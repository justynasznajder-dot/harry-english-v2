import { NextRequest, NextResponse } from "next/server";
import {
  getDbShape,
  getRegistrationSchoolId,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  runPgTransaction,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { sendProposalRejectedEmail } from "@/lib/email";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

/**
 * Rodzic odrzuca **aktywną** propozycję grupy (`enrollment_proposals.status = PENDING`).
 *
 * Body: `{ enrollmentRequestId: string, rejectionComment?: string }`
 * (wstecznie: `requestId`, `reason`).
 *
 * Gdy istnieje tabela `enrollment_proposals`:
 * - PENDING → REJECTED + komentarz + `responded_at`,
 * - `enrollment_requests.status` → `NEGOTIATING`, `proposed_group_id` / `proposed_at` NULL.
 *
 * Gdy brak tabeli historii — stary przebieg: `enrollment_requests` → REJECTED + zerowanie grupy.
 */
export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  let body: { enrollmentRequestId?: unknown; requestId?: unknown; rejectionComment?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "Niepoprawne dane wejściowe" }, { status: 400 });
  }

  const enrollmentRequestIdRaw =
    (typeof body.enrollmentRequestId === "string" && body.enrollmentRequestId.trim()) ||
    (typeof body.requestId === "string" && body.requestId.trim()) ||
    "";
  const enrollmentRequestId = enrollmentRequestIdRaw.trim();
  if (!enrollmentRequestId) {
    return NextResponse.json({ message: "Brak `enrollmentRequestId`" }, { status: 400 });
  }

  const rawComment =
    typeof body.rejectionComment === "string"
      ? body.rejectionComment.trim()
      : typeof body.reason === "string"
        ? body.reason.trim()
        : "";
  const rejectionComment = rawComment.length > 0 ? rawComment.slice(0, 2000) : null;

  try {
    const shape = await getDbShape();

    if (shape.hasEnrollmentProposalsTable) {
      const detailsRes = await queryDb<{
        ep_id: string;
        parent_first_name: string;
        parent_last_name: string;
        parent_email: string;
        child_first_name: string;
        child_last_name: string;
        group_name: string | null;
        location_name: string | null;
        schedule: string | null;
      }>(
        `SELECT
           ep.id AS ep_id,
           u.first_name AS parent_first_name,
           u.last_name  AS parent_last_name,
           u.email      AS parent_email,
           er.child_first_name,
           er.child_last_name,
           g.name AS group_name,
           COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
           COALESCE(
             STRING_AGG(
               DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
               ', '
             ),
             'Do ustalenia'
           ) AS schedule
         FROM enrollment_requests er
         JOIN enrollment_proposals ep ON ep.enrollment_request_id = er.id
           AND UPPER(BTRIM(COALESCE(ep.status::text, ''))) = 'PENDING'
         JOIN groups g ON g.id = ep.group_id
         LEFT JOIN users u ON u.id = er.user_id
         LEFT JOIN schedule_templates st ON st.group_id = g.id
         LEFT JOIN locations l ON l.id = st.location_id
         WHERE er.id = $1
           AND er.user_id = $2
           AND er.school_id = $3
           AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED'
         GROUP BY ep.id, u.first_name, u.last_name, u.email, er.child_first_name, er.child_last_name, g.name`,
        [enrollmentRequestId, parentId, SCHOOL_ID]
      );
      let details = detailsRes.rows[0];

      /**
       * UI (`/api/enrollment/status`) pokazuje PROPOSED na podstawie samego
       * `enrollment_requests` — bez wymogu wiersza w `enrollment_proposals`.
       * Po dodaniu tabeli mogą zostać zgłoszenia PROPOSED bez wiersza PENDING
       * (np. propozycja wysłana przed migracją). Wtedy pierwszy SELECT zwraca
       * pustkę mimo że rodzic widzi kartę — obsługujemy to jak odrzucenie
       * propozycji (tylko UPDATE zgłoszenia, bez wiersza historii).
       */
      if (!details) {
        const orphanRes = await queryDb<{
          parent_first_name: string;
          parent_last_name: string;
          parent_email: string;
          child_first_name: string;
          child_last_name: string;
          group_name: string | null;
          location_name: string | null;
          schedule: string | null;
        }>(
          `SELECT
             u.first_name AS parent_first_name,
             u.last_name  AS parent_last_name,
             u.email      AS parent_email,
             er.child_first_name,
             er.child_last_name,
             g.name AS group_name,
             COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
             COALESCE(
               STRING_AGG(
                 DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                 ', '
               ),
               'Do ustalenia'
             ) AS schedule
           FROM enrollment_requests er
           LEFT JOIN users u ON u.id = er.user_id
           LEFT JOIN groups g ON g.id = er.proposed_group_id
           LEFT JOIN schedule_templates st ON st.group_id = g.id
           LEFT JOIN locations l ON l.id = st.location_id
           WHERE er.id = $1
             AND er.user_id = $2
             AND er.school_id = $3
             AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED'
             AND er.proposed_group_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM enrollment_proposals ep
               WHERE ep.enrollment_request_id = er.id
                 AND UPPER(BTRIM(COALESCE(ep.status::text, ''))) = 'PENDING'
             )
           GROUP BY er.id, u.first_name, u.last_name, u.email, er.child_first_name, er.child_last_name, g.name`,
          [enrollmentRequestId, parentId, SCHOOL_ID]
        );
        const orphan = orphanRes.rows[0];
        if (orphan) {
          const updOrphan = await queryDb(
            `UPDATE enrollment_requests
               SET status = 'NEGOTIATING',
                   proposed_group_id = NULL,
                   proposed_at = NULL
             WHERE id = $1
               AND user_id = $2
               AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'`,
            [enrollmentRequestId, parentId]
          );
          if ((updOrphan.rowCount ?? 0) === 0) {
            return NextResponse.json(
              { message: "Propozycja jest już nieaktywna" },
              { status: 409 }
            );
          }
          await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "NEGOTIATING");
          await syncParentUserAccessLevel(parentId);
          try {
            await sendProposalRejectedEmail({
              parentFirstName: orphan.parent_first_name ?? "",
              parentLastName: orphan.parent_last_name ?? "",
              parentEmail: orphan.parent_email ?? "",
              childFirstName: orphan.child_first_name ?? "",
              childLastName: orphan.child_last_name ?? "",
              groupName: orphan.group_name ?? "(nieznana grupa)",
              locationName: orphan.location_name ?? "Do ustalenia",
              schedule: orphan.schedule ?? "Do ustalenia",
              reason: rejectionComment,
            });
          } catch (mailErr) {
            console.error("Reject email error:", mailErr);
          }
          return NextResponse.json({ ok: true });
        }

        return NextResponse.json(
          { message: "Propozycja nieaktywna lub nie należy do Twojego konta" },
          { status: 409 }
        );
      }

      await runPgTransaction(async (client) => {
        const u1 = await client.query(
          `UPDATE enrollment_proposals
             SET status = 'REJECTED',
                 rejection_comment = $2,
                 responded_at = NOW()
           WHERE id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'`,
          [details.ep_id, rejectionComment]
        );
        if ((u1.rowCount ?? 0) === 0) {
          throw new Error("__409_REJECT_RACE__");
        }
        await client.query(
          `UPDATE enrollment_requests
             SET status = 'NEGOTIATING',
                 proposed_group_id = NULL,
                 proposed_at = NULL
           WHERE id = $1
             AND user_id = $2
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'`,
          [enrollmentRequestId, parentId]
        );
      });

      await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "NEGOTIATING");
      await syncParentUserAccessLevel(parentId);

      try {
        await sendProposalRejectedEmail({
          parentFirstName: details.parent_first_name ?? "",
          parentLastName: details.parent_last_name ?? "",
          parentEmail: details.parent_email ?? "",
          childFirstName: details.child_first_name ?? "",
          childLastName: details.child_last_name ?? "",
          groupName: details.group_name ?? "(nieznana grupa)",
          locationName: details.location_name ?? "Do ustalenia",
          schedule: details.schedule ?? "Do ustalenia",
          reason: rejectionComment,
        });
      } catch (mailErr) {
        console.error("Reject email error:", mailErr);
      }

      return NextResponse.json({ ok: true });
    }

    /* --- Legacy: brak tabeli enrollment_proposals --- */
    const detailsRes = await queryDb<{
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      child_first_name: string;
      child_last_name: string;
      group_name: string | null;
      location_name: string | null;
      schedule: string | null;
    }>(
      `SELECT
         u.first_name AS parent_first_name,
         u.last_name  AS parent_last_name,
         u.email      AS parent_email,
         er.child_first_name,
         er.child_last_name,
         g.name AS group_name,
         COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
         COALESCE(
           STRING_AGG(
             DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
             ', '
           ),
           'Do ustalenia'
         ) AS schedule
       FROM enrollment_requests er
       LEFT JOIN users u ON u.id = er.user_id
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE er.id = $1
         AND er.user_id = $2
         AND er.school_id = $3
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED'
       GROUP BY er.id, u.first_name, u.last_name, u.email, er.child_first_name, er.child_last_name, g.name`,
      [enrollmentRequestId, parentId, SCHOOL_ID]
    );
    const details = detailsRes.rows[0];
    if (!details) {
      return NextResponse.json(
        { message: "Propozycja nieaktywna lub nie należy do Twojego konta" },
        { status: 409 }
      );
    }

    const setClauses: string[] = [
      "status = 'REJECTED'",
      "proposed_group_id = NULL",
      "proposed_at = NULL",
    ];
    const params: Array<string | null> = [enrollmentRequestId, parentId];
    if (shape.enrollmentHasRejectionComment) {
      params.push(rejectionComment);
      setClauses.push(`rejection_comment = $${params.length}`);
    }
    if (shape.enrollmentHasRejectedAt) {
      setClauses.push("rejected_at = NOW()");
    }

    const upd = await queryDb<{ id: string }>(
      `UPDATE enrollment_requests
         SET ${setClauses.join(", ")}
       WHERE id = $1
         AND user_id = $2
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
       RETURNING id`,
      params
    );
    if ((upd.rowCount ?? 0) === 0) {
      return NextResponse.json({ message: "Propozycja jest już nieaktywna" }, { status: 409 });
    }

    await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "REJECTED");
    await syncParentUserAccessLevel(parentId);

    try {
      await sendProposalRejectedEmail({
        parentFirstName: details.parent_first_name ?? "",
        parentLastName: details.parent_last_name ?? "",
        parentEmail: details.parent_email ?? "",
        childFirstName: details.child_first_name ?? "",
        childLastName: details.child_last_name ?? "",
        groupName: details.group_name ?? "(nieznana grupa)",
        locationName: details.location_name ?? "Do ustalenia",
        schedule: details.schedule ?? "Do ustalenia",
        reason: rejectionComment,
      });
    } catch (mailErr) {
      console.error("Reject email error:", mailErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "__409_REJECT_RACE__") {
      return NextResponse.json({ message: "Propozycja jest już nieaktywna" }, { status: 409 });
    }
    console.error("Enrollment reject error:", error);
    return NextResponse.json({ message: "Nie udało się odrzucić propozycji" }, { status: 500 });
  }
}
