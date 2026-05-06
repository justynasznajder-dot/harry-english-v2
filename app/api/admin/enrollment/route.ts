import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";

function getUserIdFromToken(token: string): string | null {
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authToken = request.cookies.get("auth-token");
    if (!authToken) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    const userId = getUserIdFromToken(authToken.value);
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const parentsSchoolClause =
      tenant.role === "MANAGER" ? `AND u.school_id = $1` : "";
    const parentsParams = tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : [];

    const parentsRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      access_level: string;
      children_json: string;
    }>(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.access_level,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', c.id,
               'firstName', c.first_name,
               'lastName', c.last_name,
               'confirmed', c.confirmed
             )
           ) FILTER (WHERE c.id IS NOT NULL),
           '[]'::json
         )::text AS children_json
       FROM users u
       LEFT JOIN children c
         ON c.parent_id = u.id AND c.school_id = u.school_id
       WHERE u.role = 'PARENT'
         AND u.access_level <> 'ACTIVE'
         ${parentsSchoolClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
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
    const authToken = request.cookies.get("auth-token");
    if (!authToken) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    const userId = getUserIdFromToken(authToken.value);
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const body = await request.json();
    const { parentId, groupId, priceMonthly } = body as {
      parentId?: string;
      groupId?: string;
      priceMonthly?: number;
    };
    if (!parentId || !groupId || typeof priceMonthly !== "number") {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const parentRes =
      tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            first_name: string;
            last_name: string;
            email: string;
            school_id: string;
          }>(
            `SELECT id, first_name, last_name, email, school_id
             FROM users
             WHERE id = $1 AND school_id = $2 AND role = 'PARENT'
             LIMIT 1`,
            [parentId, tenant.tenantSchoolId]
          )
        : await queryDb<{
            id: string;
            first_name: string;
            last_name: string;
            email: string;
            school_id: string;
          }>(
            `SELECT id, first_name, last_name, email, school_id
             FROM users
             WHERE id = $1 AND role = 'PARENT'
             LIMIT 1`,
            [parentId]
          );
    const parent = parentRes.rows[0];
    if (!parent) return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });
    if (!parent.school_id) {
      return NextResponse.json({ message: "Rodzic nie ma przypisanej szkoły" }, { status: 400 });
    }
    const parentSchoolId = parent.school_id;

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

    const requestId = randomUUID();
    await queryDb(
      `INSERT INTO enrollment_requests (
        id, school_id, parent_first_name, parent_last_name, parent_email,
        child_first_name, child_last_name, notes, status, proposed_group_id, proposed_at, user_id
      )
      SELECT
        $1, $2, u.first_name, u.last_name, u.email,
        c.first_name, c.last_name, $5, 'PROPOSED', $3, NOW(), u.id
      FROM users u
      LEFT JOIN children c ON c.parent_id = u.id AND c.school_id = u.school_id
      WHERE u.id = $4
      ORDER BY c.created_at ASC
      LIMIT 1`,
      [requestId, parentSchoolId, groupId, parentId, String(priceMonthly)]
    );
    await queryDb(`UPDATE users SET access_level = 'PROPOSED' WHERE id = $1`, [parentId]);
    await queryDb(
      `UPDATE children
       SET enrollment_request_id = $2
       WHERE parent_id = $1 AND school_id = $3`,
      [parentId, requestId, parentSchoolId]
    );

    await sendProposalEmail(parent.email, `${parent.first_name} ${parent.last_name}`, {
      groupName: group.name,
      locationName: group.location_name,
      schedule: group.schedule,
      priceMonthly,
    });

    return NextResponse.json({ message: "Propozycja została wysłana" });
  } catch (error) {
    console.error("Admin enrollment POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji" }, { status: 500 });
  }
}
