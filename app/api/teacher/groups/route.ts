import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { isLektor, POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
  }
  if (!(await isLektor(userId))) {
    return NextResponse.json({ message: "Brak uprawnień lektora" }, { status: 403 });
  }

  try {
    const groupsRes = await queryDb<{
      id: string;
      name: string;
      level: string | null;
      schedule: string;
      students_json: string;
    }>(
      `SELECT
         g.id,
         g.name,
         g.level,
         COALESCE(
           STRING_AGG(
             DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
             ', '
           ),
           'Do ustalenia'
         ) AS schedule,
         COALESCE(
           JSON_AGG(
             DISTINCT JSONB_BUILD_OBJECT(
               'childId', c.id,
               'firstName', c.first_name,
               'lastName', c.last_name
             )
           ) FILTER (WHERE c.id IS NOT NULL AND gs.left_at IS NULL),
           '[]'::json
         )::text AS students_json
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN group_students gs ON gs.group_id = g.id AND gs.left_at IS NULL
       LEFT JOIN children c ON c.id = gs.child_id AND c.active = TRUE
       WHERE g.teacher_id = $1 AND g.active = TRUE
       GROUP BY g.id, g.name, g.level
       ORDER BY g.name`,
      [userId]
    );

    const groups = groupsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      schedule: row.schedule,
      students: JSON.parse(row.students_json || "[]") as Array<{
        childId: string;
        firstName: string;
        lastName: string;
      }>,
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/teacher/groups:", error);
    return NextResponse.json({ message: "Błąd pobierania grup" }, { status: 500 });
  }
}
