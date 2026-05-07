import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";
import { getTokenFromRequest } from "@/lib/auth";
import type { EnrollmentStatus } from "@/lib/enrollment-status";

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
         COALESCE(NULLIF(u.first_name, ''), er.parent_first_name) AS first_name,
         COALESCE(NULLIF(u.last_name, ''), er.parent_last_name) AS last_name,
         COALESCE(NULLIF(u.email, ''), er.parent_email) AS email,
         CASE
           WHEN MAX(
             CASE
               WHEN UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('PROPOSED', 'ACCEPTED', 'SIGNED') THEN 3
               WHEN UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW' THEN 1
               ELSE 1
             END
           ) >= 3 THEN 'PROPOSED'
           WHEN MAX(
             CASE
               WHEN UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW' THEN 1
               ELSE 0
             END
           ) = 1 THEN 'NEW'
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
               'birthDate', er.child_birth_date::text,
               'preferredLocation', COALESCE(loc.name, NULLIF(TRIM(er.preferred_location::text), '')),
               'preferredDays', er.preferred_days,
               'notes', er.notes,
               'proposedGroupId', er.proposed_group_id,
               'proposedAt', er.proposed_at
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
       WHERE UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED')
         AND (
           COALESCE(u.id, NULLIF(BTRIM(er.user_id::text), '')) IS NOT NULL
           OR NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
         )
         ${parentsSchoolClause}
       GROUP BY COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, er.parent_email),
                COALESCE(NULLIF(u.first_name, ''), er.parent_first_name),
                COALESCE(NULLIF(u.last_name, ''), er.parent_last_name),
                COALESCE(NULLIF(u.email, ''), er.parent_email)
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
                  DISTINCT CONCAT(st.day_of_week, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
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

    const body = await request.json();
    const { requestId, groupId } = body as {
      requestId?: string;
      groupId?: string;
    };
    if (!requestId || !groupId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const enrollmentRes =
      tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            user_id: string;
            first_name: string;
            last_name: string;
            email: string;
            school_id: string;
            child_first_name: string;
            child_last_name: string;
          }>(
            `SELECT er.id,
                    u.id AS user_id,
                    u.first_name,
                    u.last_name,
                    u.email,
                    er.school_id,
                    er.child_first_name,
                    er.child_last_name
             FROM enrollment_requests er
             JOIN users u ON u.id = er.user_id
             WHERE er.id = $1
               AND er.school_id = $2
               AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED')
               AND u.role = 'PARENT'
             LIMIT 1`,
            [requestId, tenant.tenantSchoolId]
          )
        : await queryDb<{
            id: string;
            user_id: string;
            first_name: string;
            last_name: string;
            email: string;
            school_id: string;
            child_first_name: string;
            child_last_name: string;
          }>(
            `SELECT er.id,
                    u.id AS user_id,
                    u.first_name,
                    u.last_name,
                    u.email,
                    er.school_id,
                    er.child_first_name,
                    er.child_last_name
             FROM enrollment_requests er
             JOIN users u ON u.id = er.user_id
             WHERE er.id = $1
               AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED')
               AND u.role = 'PARENT'
             LIMIT 1`,
            [requestId]
          );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) return NextResponse.json({ message: "Nie znaleziono zgłoszenia" }, { status: 404 });
    const parentSchoolId = enrollment.school_id;

    const groupRes = await queryDb<{ id: string; name: string; location_name: string; schedule: string }>(
      `SELECT g.id,
              g.name,
              COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(st.day_of_week, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
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

    await queryDb(
      `UPDATE enrollment_requests
       SET status = 'PROPOSED',
           proposed_group_id = $2,
           proposed_at = NOW()
       WHERE id = $1`,
      [requestId, groupId]
    );
    await queryDb(`UPDATE users SET access_level = 'PROPOSED' WHERE id = $1`, [enrollment.user_id]);
    await queryDb(
      `UPDATE children
       SET enrollment_request_id = $1
       WHERE parent_id = $2
         AND school_id = $3
         AND first_name = $4
         AND last_name = $5`,
      [requestId, enrollment.user_id, parentSchoolId, enrollment.child_first_name, enrollment.child_last_name]
    );

    await sendProposalEmail(enrollment.email, `${enrollment.first_name} ${enrollment.last_name}`, {
      groupName: group.name,
      locationName: group.location_name,
      schedule: group.schedule,
      priceMonthly: 0,
    });

    return NextResponse.json({ message: "Propozycja została wysłana" });
  } catch (error) {
    console.error("Admin enrollment POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji" }, { status: 500 });
  }
}
