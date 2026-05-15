import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import {
  canAccessSchoolAdminApis,
  createUser,
  findUserBySchoolAndEmail,
  getDbShape,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  resolveAdminPanelTenant,
  runPgTransaction,
} from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";
import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { generateTempPassword } from "@/lib/password";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

export async function GET(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;
    const shape = await getDbShape();

    const parentsSchoolClause =
      tenant.role === "MANAGER" ? `AND er.school_id = $1` : "";
    const parentsParams = tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : [];

    const parentsRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      access_level: EnrollmentStatus;
      children_json: string;
    }>(
      `SELECT
         COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, er.parent_email) AS id,
         COALESCE(
           MAX(NULLIF(BTRIM(u.first_name), '')),
           MAX(NULLIF(BTRIM(er.parent_first_name), '')),
           ''
         ) AS first_name,
         COALESCE(
           MAX(NULLIF(BTRIM(u.last_name), '')),
           MAX(NULLIF(BTRIM(er.parent_last_name), '')),
           ''
         ) AS last_name,
         COALESCE(
           MAX(NULLIF(BTRIM(u.email), '')),
           MAX(NULLIF(BTRIM(er.parent_email), '')),
           ''
         ) AS email,
         CASE
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW') THEN 'NEW'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEGOTIATING') THEN 'NEGOTIATING'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'REJECTED') THEN 'REJECTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED') THEN 'PROPOSED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'ACCEPTED') THEN 'ACCEPTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'SIGNED') THEN 'SIGNED'
           ELSE 'NEW'
         END AS access_level,
         COALESCE(
           JSON_AGG(
             DISTINCT JSONB_BUILD_OBJECT(
               'id', COALESCE(c.id, er.id),
               'requestId', er.id,
               'firstName', COALESCE(c.first_name, er.child_first_name),
               'lastName', COALESCE(c.last_name, er.child_last_name),
               'confirmed', COALESCE(c.confirmed, FALSE),
               'status', UPPER(BTRIM(COALESCE(er.status::text, 'NEW'))),
               'childAccessLevel', UPPER(BTRIM(COALESCE(c.access_level::text, er.status::text, 'NEW'))),
               'birthDate', er.child_birth_date::text,
               'preferredLocation', COALESCE(loc.name, NULLIF(TRIM(er.preferred_location::text), '')),
               'preferredDays', er.preferred_days,
               'notes', er.notes,
               'proposedGroupId', er.proposed_group_id,
               'proposedAt', er.proposed_at
               ${shape.hasEnrollmentProposalsTable
                 ? `, 'proposalCount', COALESCE((SELECT COUNT(*)::int FROM enrollment_proposals ep WHERE ep.enrollment_request_id = er.id), 0),
                 'hasPendingProposal', EXISTS (SELECT 1 FROM enrollment_proposals ep2 WHERE ep2.enrollment_request_id = er.id AND UPPER(BTRIM(COALESCE(ep2.status::text, ''))) = 'PENDING')`
                 : ""}
             )
           ) FILTER (
             WHERE COALESCE(c.id, er.id) IS NOT NULL
               AND COALESCE(c.first_name, er.child_first_name, '') <> ''
               AND COALESCE(c.last_name, er.child_last_name, '') <> ''
           ),
           '[]'::json
         )::text AS children_json
       FROM enrollment_requests er
       LEFT JOIN locations loc
         ON loc.school_id = er.school_id
        AND loc.id::text = NULLIF(TRIM(BOTH FROM COALESCE(er.preferred_location::text, '')), '')
       LEFT JOIN users u
         ON (
           u.id = NULLIF(BTRIM(er.user_id), '')
           OR (
             u.school_id = er.school_id
             AND LOWER(u.email::text) = LOWER(er.parent_email::text)
           )
         )
       LEFT JOIN children c
         ON c.parent_id = COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id)
        AND c.school_id = er.school_id
        AND c.first_name = er.child_first_name
        AND c.last_name = er.child_last_name
       WHERE UPPER(BTRIM(COALESCE(er.status::text, ''))) <> 'COMPLETED'
         AND (
           COALESCE(u.id, NULLIF(BTRIM(er.user_id::text), '')) IS NOT NULL
           OR NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
         )
         ${parentsSchoolClause}
      GROUP BY COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, er.parent_email)
       ORDER BY MAX(er.created_at) DESC`,
      parentsParams
    );

    const groupsSchoolClause =
      tenant.role === "MANAGER" ? `AND g.school_id = $1` : "";
    const groupsParams = tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : [];

    const groupsRes = await queryDb<{
      id: string;
      name: string;
      location_name: string;
      schedule: string;
    }>(
      `SELECT g.id,
              g.name,
              COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.active = TRUE
         ${groupsSchoolClause}
       GROUP BY g.id, g.name
       ORDER BY g.name`,
      groupsParams
    );

    return NextResponse.json({
      parents: parentsRes.rows.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        accessLevel: row.access_level,
        children: JSON.parse(row.children_json),
      })),
      groups: groupsRes.rows,
    });
  } catch (error) {
    console.error("Admin enrollment GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania zgłoszeń" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;
    const shape = await getDbShape();

    const body = await request.json();
    const { requestId, groupId } = body as {
      requestId?: string;
      groupId?: string;
    };
    if (!requestId || !groupId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    // 1) Pobierz enrollment_request — bez JOIN na users, bo nowo zgłoszony rodzic może
    //    nie mieć jeszcze konta (user_id IS NULL z formularza publicznego).
    const enrollmentRes =
      tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            user_id: string | null;
            parent_first_name: string;
            parent_last_name: string;
            parent_email: string;
            parent_phone: string | null;
            school_id: string;
            child_first_name: string;
            child_last_name: string;
            child_birth_date: string;
            preferred_location: string | null;
          }>(
            `SELECT er.id,
                    er.user_id,
                    er.parent_first_name,
                    er.parent_last_name,
                    er.parent_email,
                    er.parent_phone,
                    er.school_id,
                    er.child_first_name,
                    er.child_last_name,
                    er.child_birth_date::text AS child_birth_date,
                    er.preferred_location
             FROM enrollment_requests er
             WHERE er.id = $1
               AND er.school_id = $2
               AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED', 'REJECTED', 'NEGOTIATING')
             LIMIT 1`,
            [requestId, tenant.tenantSchoolId]
          )
        : await queryDb<{
            id: string;
            user_id: string | null;
            parent_first_name: string;
            parent_last_name: string;
            parent_email: string;
            parent_phone: string | null;
            school_id: string;
            child_first_name: string;
            child_last_name: string;
            child_birth_date: string;
            preferred_location: string | null;
          }>(
            `SELECT er.id,
                    er.user_id,
                    er.parent_first_name,
                    er.parent_last_name,
                    er.parent_email,
                    er.parent_phone,
                    er.school_id,
                    er.child_first_name,
                    er.child_last_name,
                    er.child_birth_date::text AS child_birth_date,
                    er.preferred_location
             FROM enrollment_requests er
             WHERE er.id = $1
               AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED', 'REJECTED', 'NEGOTIATING')
             LIMIT 1`,
            [requestId]
          );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) return NextResponse.json({ message: "Nie znaleziono zgłoszenia" }, { status: 404 });
    const parentSchoolId = enrollment.school_id;
    const parentEmail = String(enrollment.parent_email || "").trim().toLowerCase();
    if (!parentEmail) {
      return NextResponse.json({ message: "Brak adresu email rodzica w zgłoszeniu" }, { status: 400 });
    }

    // 2) Sprawdź grupę (w zakresie szkoły rodzica).
    const groupRes = await queryDb<{ id: string; name: string; location_name: string; schedule: string }>(
      `SELECT g.id,
              g.name,
              COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.id = $1 AND g.school_id = $2
       GROUP BY g.id, g.name`,
      [groupId, parentSchoolId]
    );
    const group = groupRes.rows[0];
    if (!group) return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });

    // 3) Znajdź lub utwórz konto rodzica.
    let parentUserId: string;
    let parentFirstName: string;
    let parentLastName: string;
    let tempPassword: string | null = null;
    let parentCreated = false;

    if (enrollment.user_id && String(enrollment.user_id).trim().length > 0) {
      // enrollment_request już dowiązany do usera — użyj istniejącego konta.
      const existingRes = await queryDb<{
        id: string;
        first_name: string;
        last_name: string;
      }>(
        `SELECT id, first_name, last_name FROM users WHERE id = $1 LIMIT 1`,
        [enrollment.user_id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return NextResponse.json(
          { message: "Zgłoszenie wskazuje na nieistniejące konto rodzica" },
          { status: 409 }
        );
      }
      parentUserId = existing.id;
      parentFirstName = existing.first_name;
      parentLastName = existing.last_name;
    } else {
      const existing = await findUserBySchoolAndEmail(parentSchoolId, parentEmail);
      if (existing) {
        // Konto już istnieje (np. były klient lub utworzone ręcznie) — reużywamy bez resetu hasła.
        parentUserId = existing.id;
        parentFirstName = existing.first_name;
        parentLastName = existing.last_name;
      } else {
        tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const newUser = await createUser({
          email: parentEmail,
          passwordHash,
          firstName: enrollment.parent_first_name?.trim() || "Rodzic",
          lastName: enrollment.parent_last_name?.trim() || "",
          role: "PARENT",
          schoolId: parentSchoolId,
          phone: enrollment.parent_phone ?? null,
          confirmed: false,
          accessLevel: "PENDING",
          mustChangePassword: true,
        });
        parentUserId = newUser.id;
        parentFirstName = newUser.first_name;
        parentLastName = newUser.last_name;
        parentCreated = true;
      }
    }

    // 4) Podlinkuj WSZYSTKIE enrollment_requests tego rodzica (po emailu i szkole),
    //    które jeszcze nie mają user_id — żeby kolejne kliknięcia „Wyślij propozycję"
    //    nie próbowały utworzyć drugiego konta.
    await queryDb(
      `UPDATE enrollment_requests
       SET user_id = $1
       WHERE school_id = $2
         AND user_id IS NULL
         AND LOWER(parent_email::text) = LOWER($3::text)`,
      [parentUserId, parentSchoolId, parentEmail]
    );

    // 5) Propozycja: INSERT do enrollment_proposals + UPDATE enrollment_requests (albo sam UPDATE bez tabeli historii).
    let proposalCount: number | undefined;
    if (shape.hasEnrollmentProposalsTable) {
      try {
        proposalCount = await runPgTransaction(async (client) => {
          const pend = await client.query<{ id: string }>(
            `SELECT id FROM enrollment_proposals
             WHERE enrollment_request_id = $1
               AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'
             LIMIT 1`,
            [requestId]
          );
          if (pend.rows.length > 0) {
            throw new Error("__409_PENDING_PROPOSAL__");
          }
          const proposalId = randomUUID();
          await client.query(
            `INSERT INTO enrollment_proposals (
               id, school_id, enrollment_request_id, group_id, proposed_by, proposed_at, status, created_at
             ) VALUES ($1, $2, $3, $4, $5, NOW(), 'PENDING', NOW())`,
            [proposalId, parentSchoolId, requestId, groupId, userId]
          );
          await client.query(
            `UPDATE enrollment_requests
             SET status = 'PROPOSED',
                 proposed_group_id = $2,
                 proposed_at = NOW(),
                 user_id = COALESCE(user_id, $3)
             WHERE id = $1`,
            [requestId, groupId, parentUserId]
          );
          const cnt = await client.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM enrollment_proposals WHERE enrollment_request_id = $1`,
            [requestId]
          );
          return Number(cnt.rows[0]?.n ?? "0");
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "__409_PENDING_PROPOSAL__") {
          return NextResponse.json(
            { message: "Aktywna propozycja czeka już na decyzję rodzica." },
            { status: 409 }
          );
        }
        const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
        if (code === "23505") {
          return NextResponse.json(
            { message: "Aktywna propozycja czeka już na decyzję rodzica." },
            { status: 409 }
          );
        }
        throw e;
      }
    } else {
      await queryDb(
        `UPDATE enrollment_requests
         SET status = 'PROPOSED',
             proposed_group_id = $2,
             proposed_at = NOW(),
             user_id = COALESCE(user_id, $3)
         WHERE id = $1`,
        [requestId, groupId, parentUserId]
      );
    }

    // 6) Upewnij się, że dziecko z tego zgłoszenia istnieje w `children` (active=TRUE, confirmed=FALSE)
    //    i jest dowiązane do enrollment_request_id. Tworzymy TYLKO to jedno dziecko.
    if (shape.hasChildrenTable) {
      const childFirst = (enrollment.child_first_name ?? "").trim();
      const childLast = (enrollment.child_last_name ?? "").trim();
      const childBirth = String(enrollment.child_birth_date ?? "").slice(0, 10);

      const existingChildRes = await queryDb<{ id: string }>(
        `SELECT id FROM children
         WHERE parent_id = $1
           AND school_id = $2
           AND first_name = $3
           AND last_name = $4
         LIMIT 1`,
        [parentUserId, parentSchoolId, childFirst, childLast]
      );
      const existingChildId = existingChildRes.rows[0]?.id ?? null;

      if (existingChildId) {
        const setParts = ["active = TRUE"];
        const setVals: unknown[] = [existingChildId];
        let pi = 2;
        if (shape.childHasEnrollmentRequestId) {
          setParts.push(`enrollment_request_id = $${pi++}`);
          setVals.push(requestId);
        }
        if (shape.childHasAccessLevel) {
          setParts.push(`access_level = $${pi++}`);
          setVals.push("PROPOSED");
        }
        await queryDb(
          `UPDATE children SET ${setParts.join(", ")} WHERE id = $1`,
          setVals
        );
      } else {
        const childId = randomUUID();
        const cols: string[] = [
          "id",
          "school_id",
          "parent_id",
          "first_name",
          "last_name",
          "birth_date",
          "active",
        ];
        const vals: unknown[] = [
          childId,
          parentSchoolId,
          parentUserId,
          childFirst,
          childLast,
          childBirth,
          true,
        ];
        if (shape.childHasConfirmed) {
          cols.push("confirmed");
          vals.push(false);
        }
        if (shape.childHasEnrollmentRequestId) {
          cols.push("enrollment_request_id");
          vals.push(requestId);
        }
        if (shape.childHasAccessLevel) {
          cols.push("access_level");
          vals.push("PROPOSED");
        }
        if (
          shape.childHasPreferredLocationId &&
          enrollment.preferred_location != null &&
          String(enrollment.preferred_location).trim() !== ""
        ) {
          cols.push("preferred_location_id");
          vals.push(String(enrollment.preferred_location).trim());
        }
        const placeholders = vals
          .map((_, i) => {
            const col = cols[i];
            return col === "birth_date" ? `$${i + 1}::date` : `$${i + 1}`;
          })
          .join(", ");
        await queryDb(
          `INSERT INTO children (${cols.join(", ")}) VALUES (${placeholders})`,
          vals
        );
      }
    }

    await syncChildrenAccessLevelForEnrollment(requestId, "PROPOSED");
    await syncParentUserAccessLevel(parentUserId);

    // 7) Wyślij maila z propozycją (z danymi logowania tylko dla świeżo utworzonego konta).
    await sendProposalEmail(
      parentEmail,
      `${parentFirstName} ${parentLastName}`.trim(),
      {
        groupName: group.name,
        locationName: group.location_name,
        schedule: group.schedule,
        childFirstName: enrollment.child_first_name,
        childLastName: enrollment.child_last_name,
      },
      parentCreated && tempPassword
        ? { loginEmail: parentEmail, tempPassword }
        : undefined
    );

    return NextResponse.json({
      message: parentCreated
        ? "Propozycja została wysłana, konto rodzica utworzone"
        : "Propozycja została wysłana",
      parentCreated,
      /** Id użytkownika rodzica — po pierwszym podlinkowaniu zgłoszeń klucz grupowania w GET zmienia się z emaila na to id; UI modala ma się do niego przełączyć. */
      parentId: parentUserId,
      ...(proposalCount !== undefined ? { proposalCount } : {}),
    });
  } catch (error) {
    console.error("Admin enrollment POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji" }, { status: 500 });
  }
}
