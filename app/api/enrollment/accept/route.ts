import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getDbShape,
  getRegistrationSchoolId,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  runPgTransaction,
} from "@/lib/db";
import { sendContractEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

function fillTemplate(html: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    html
  );
}

/**
 * Rodzic akceptuje konkretną propozycję grupy.
 *
 * Body (opcjonalne dla wstecznej kompatybilności): `{ requestId?: string }`.
 * - Jeśli `requestId` podany → akceptujemy konkretne zgłoszenie (multi-child).
 * - Jeśli brak → fallback do najnowszego `PROPOSED` rodzica (legacy single-child).
 *
 * Skutki:
 * - `enrollment_requests.status = 'ACCEPTED'`, `accepted_at = NOW()` — tylko dla
 *   tego konkretnego zgłoszenia,
 * - generujemy umowę w `contracts` i wysyłamy maila z umową rodzicowi,
 * - `children.access_level` → `ACCEPTED` (równolegle z `enrollment_requests`),
 * - `users.access_level` pozostaje `PENDING` do podpisania umowy (ACTIVE dopiero przy SIGNED/COMPLETED).
 */
export async function PUT(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  // Body jest opcjonalne (legacy klienci wołali PUT bez body).
  let requestedId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { requestId?: unknown };
    if (typeof body.requestId === "string" && body.requestId.trim().length > 0) {
      requestedId = body.requestId.trim();
    }
  } catch {
    /* brak body — fallback poniżej */
  }

  try {
    const parentRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      access_level: string;
    }>(
      `SELECT id, first_name, last_name, email, access_level
       FROM users
       WHERE id = $1 AND school_id = $2 AND role = 'PARENT'
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const parent = parentRes.rows[0];
    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });

    /*
     * Wybór konkretnego zgłoszenia:
     * - z parametru `requestId` (multi-child, nowe UI),
     * - lub jako fallback: najnowsze PROPOSED tego rodzica (legacy).
     */
    const enrollmentRes = requestedId
      ? await queryDb<{
          id: string;
          proposed_group_id: string;
          child_first_name: string;
          child_last_name: string;
          notes: string | null;
        }>(
          `SELECT id, proposed_group_id, child_first_name, child_last_name, notes
           FROM enrollment_requests
           WHERE id = $1 AND user_id = $2 AND school_id = $3 AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           LIMIT 1`,
          [requestedId, parentId, SCHOOL_ID]
        )
      : await queryDb<{
          id: string;
          proposed_group_id: string;
          child_first_name: string;
          child_last_name: string;
          notes: string | null;
        }>(
          `SELECT id, proposed_group_id, child_first_name, child_last_name, notes
           FROM enrollment_requests
           WHERE user_id = $1 AND school_id = $2 AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           ORDER BY created_at DESC
           LIMIT 1`,
          [parentId, SCHOOL_ID]
        );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json(
        {
          message: requestedId
            ? "Propozycja nieaktywna lub nie należy do Twojego konta"
            : "Brak propozycji do akceptacji",
        },
        { status: requestedId ? 409 : 400 }
      );
    }

    const groupRes = await queryDb<{
      id: string;
      name: string;
      location_name: string;
      schedule: string;
    }>(
      `SELECT g.id,
              g.name,
              COALESCE(l.name, 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.id = $1
       GROUP BY g.id, g.name, l.name`,
      [enrollment.proposed_group_id]
    );
    const group = groupRes.rows[0];

    const templateRes = await queryDb<{ id: string; content_html: string }>(
      `SELECT id, content_html
       FROM contract_templates
       WHERE school_id = $1 AND active = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [SCHOOL_ID]
    );
    const template = templateRes.rows[0];
    if (!template) return NextResponse.json({ message: "Brak aktywnego szablonu umowy" }, { status: 400 });

    const contractHtml = fillTemplate(template.content_html, {
      parent_first_name: parent.first_name,
      parent_last_name: parent.last_name,
      child_first_name: enrollment.child_first_name,
      child_last_name: enrollment.child_last_name,
      group_name: group?.name ?? "Do ustalenia",
      location_name: group?.location_name ?? "Do ustalenia",
      schedule: group?.schedule ?? "Do ustalenia",
      price_monthly: enrollment.notes ?? "0",
      start_date: new Date().toISOString().slice(0, 10),
      signed_at: "",
    });

    const shape = await getDbShape();

    /** Brak wiersza PENDING = np. PROPOSED sprzed migracji `enrollment_proposals` — wtedy akceptujemy jak dawniej (tylko `enrollment_requests`). */
    let pendingProposalId: string | null = null;
    if (shape.hasEnrollmentProposalsTable) {
      const pr = await queryDb<{ id: string }>(
        `SELECT id FROM enrollment_proposals
         WHERE enrollment_request_id = $1
           AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'
         LIMIT 1`,
        [enrollment.id]
      );
      pendingProposalId = pr.rows[0]?.id ?? null;
    }

    /*
     * Multi-child: dopasowujemy dziecko po `enrollment_request_id` (jeśli
     * kolumna istnieje), w przeciwnym razie po imię + nazwisko dziecka z
     * tego zgłoszenia. Stara wersja brała pierwsze dziecko rodzica — co przy
     * dwójce dzieci wystawiało umowę nie temu dziecku.
     */
    const childRes = shape.childHasEnrollmentRequestId
      ? await queryDb<{ id: string }>(
          `SELECT id
           FROM children
           WHERE parent_id = $1
             AND school_id = $2
             AND enrollment_request_id = $3
           LIMIT 1`,
          [parentId, SCHOOL_ID, enrollment.id]
        )
      : await queryDb<{ id: string }>(
          `SELECT id
           FROM children
           WHERE parent_id = $1
             AND school_id = $2
             AND first_name = $3
             AND last_name = $4
           ORDER BY created_at ASC
           LIMIT 1`,
          [parentId, SCHOOL_ID, enrollment.child_first_name, enrollment.child_last_name]
        );
    const childId = childRes.rows[0]?.id ?? null;

    const contractId = randomUUID();
    if (pendingProposalId) {
      await runPgTransaction(async (client) => {
        await client.query(
          `UPDATE enrollment_proposals
             SET status = 'ACCEPTED',
                 responded_at = NOW()
           WHERE id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'`,
          [pendingProposalId]
        );
        await client.query(
          `UPDATE enrollment_requests
           SET status = 'ACCEPTED', accepted_at = NOW()
           WHERE id = $1`,
          [enrollment.id]
        );
        await client.query(
          `INSERT INTO contracts (
            id, school_id, child_id, parent_id, group_id, template_id, content_html, status, sent_at, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT', NOW(), NOW())`,
          [contractId, SCHOOL_ID, childId, parentId, enrollment.proposed_group_id, template.id, contractHtml]
        );
      });
    } else {
      await queryDb(
        `UPDATE enrollment_requests
         SET status = 'ACCEPTED', accepted_at = NOW()
         WHERE id = $1`,
        [enrollment.id]
      );
      await queryDb(
        `INSERT INTO contracts (
        id, school_id, child_id, parent_id, group_id, template_id, content_html, status, sent_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT', NOW(), NOW())`,
        [contractId, SCHOOL_ID, childId, parentId, enrollment.proposed_group_id, template.id, contractHtml]
      );
    }

    await syncChildrenAccessLevelForEnrollment(enrollment.id, "ACCEPTED");
    await syncParentUserAccessLevel(parentId);

    const remainingRes = await queryDb<{ remaining: string }>(
      `SELECT COUNT(*)::text AS remaining
       FROM children
       WHERE parent_id = $1
         AND school_id = $2
         AND active = TRUE
         AND UPPER(BTRIM(COALESCE(access_level::text, ''))) = 'PROPOSED'`,
      [parentId, SCHOOL_ID]
    );
    const remaining = Number(remainingRes.rows[0]?.remaining ?? "0");

    await sendContractEmail(parent.email, `${parent.first_name} ${parent.last_name}`, contractHtml);
    return NextResponse.json({
      message:
        remaining === 0
          ? "Propozycja zaakceptowana, umowa wysłana"
          : "Propozycja zaakceptowana — umowa dla tego dziecka jest gotowa. Decyzja o pozostałych propozycjach pozostaje do podjęcia.",
      remainingProposed: remaining,
    });
  } catch (error) {
    console.error("Enrollment accept error:", error);
    return NextResponse.json({ message: "Nie udało się zaakceptować propozycji" }, { status: 500 });
  }
}
