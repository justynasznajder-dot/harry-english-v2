import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: yearId } = await context.params;

  try {
    const yearRes = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      date_from: string;
      date_to: string;
      active: boolean;
      closed_at: Date | null;
      closed_by: string | null;
      closed_by_name: string | null;
    }>(
      ctx.tenant.role === "MANAGER"
        ? `SELECT sy.id, sy.school_id, sy.name,
                  sy.date_from::text, sy.date_to::text, sy.active,
                  sy.closed_at, sy.closed_by,
                  TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS closed_by_name
           FROM school_years sy
           LEFT JOIN users u ON u.id = sy.closed_by
           WHERE sy.id = $1 AND sy.school_id = $2
           LIMIT 1`
        : `SELECT sy.id, sy.school_id, sy.name,
                  sy.date_from::text, sy.date_to::text, sy.active,
                  sy.closed_at, sy.closed_by,
                  TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS closed_by_name
           FROM school_years sy
           LEFT JOIN users u ON u.id = sy.closed_by
           WHERE sy.id = $1
           LIMIT 1`,
      ctx.tenant.role === "MANAGER" ? [yearId, ctx.schoolId] : [yearId]
    );
    const year = yearRes.rows[0];
    if (!year) {
      return NextResponse.json({ message: "Nie znaleziono roku szkolnego" }, { status: 404 });
    }

    const summaryRes = await queryDb<{
      groups_count: number;
      students_count: number;
      lessons_count: number;
      contracts_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM groups g
          WHERE g.school_id = $1 AND g.school_year_id = $2) AS groups_count,
         (SELECT COUNT(DISTINCT gs.child_id)::int FROM group_students gs
          WHERE gs.school_id = $1 AND gs.school_year_id = $2) AS students_count,
         (SELECT COUNT(*)::int FROM lessons l
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2) AS lessons_count,
         (SELECT COUNT(*)::int FROM contracts c
          WHERE c.school_id = $1 AND c.school_year_id = $2) AS contracts_count`,
      [year.school_id, yearId]
    );

    const teachersRes = await queryDb<{
      teacher_id: string;
      first_name: string;
      last_name: string;
      groups_count: number;
      students_count: number;
      lessons_scheduled: number;
      lessons_completed: number;
      lessons_cancelled: number;
      total_duration_min: number;
      attendance_marked_count: number;
    }>(
      `SELECT
         s.teacher_id,
         u.first_name,
         u.last_name,
         s.groups_count,
         s.students_count,
         s.lessons_scheduled,
         s.lessons_completed,
         s.lessons_cancelled,
         s.total_duration_min,
         s.attendance_marked_count
       FROM school_year_teacher_stats s
       JOIN users u ON u.id = s.teacher_id
       WHERE s.school_id = $1 AND s.school_year_id = $2
       ORDER BY u.last_name, u.first_name`,
      [year.school_id, yearId]
    );

    const groupsRes = await queryDb<{
      id: string;
      name: string;
      level: string | null;
      teacher_id: string;
      teacher_first_name: string;
      teacher_last_name: string;
      active: boolean;
      students_count: number;
    }>(
      `SELECT
         g.id,
         g.name,
         g.level,
         g.teacher_id,
         u.first_name AS teacher_first_name,
         u.last_name AS teacher_last_name,
         g.active,
         COUNT(gs.id)::int AS students_count
       FROM groups g
       JOIN users u ON u.id = g.teacher_id
       LEFT JOIN group_students gs
         ON gs.group_id = g.id AND gs.school_year_id = $2
       WHERE g.school_id = $1 AND g.school_year_id = $2
       GROUP BY g.id, g.name, g.level, g.teacher_id, u.first_name, u.last_name, g.active
       ORDER BY g.name`,
      [year.school_id, yearId]
    );

    const studentsRes = await queryDb<{
      child_id: string;
      first_name: string;
      last_name: string;
      group_id: string;
      group_name: string;
      teacher_first_name: string;
      teacher_last_name: string;
      enrolled_at: string;
      left_at: string | null;
    }>(
      `SELECT
         c.id AS child_id,
         c.first_name,
         c.last_name,
         g.id AS group_id,
         g.name AS group_name,
         u.first_name AS teacher_first_name,
         u.last_name AS teacher_last_name,
         gs.enrolled_at::text,
         gs.left_at::text
       FROM group_students gs
       JOIN children c ON c.id = gs.child_id
       JOIN groups g ON g.id = gs.group_id
       JOIN users u ON u.id = g.teacher_id
       WHERE gs.school_id = $1 AND gs.school_year_id = $2
       ORDER BY c.last_name, c.first_name, g.name`,
      [year.school_id, yearId]
    );

    const closeLogRes = await queryDb<{
      closed_at: Date;
      closed_by_name: string | null;
      lessons_cancelled: number;
      lessons_completed: number;
      groups_deactivated: number;
      memberships_closed: number;
      subscriptions_expired: number;
    }>(
      `SELECT
         l.closed_at,
         TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS closed_by_name,
         l.lessons_cancelled,
         l.lessons_completed,
         l.groups_deactivated,
         l.memberships_closed,
         l.subscriptions_expired
       FROM school_year_close_logs l
       LEFT JOIN users u ON u.id = l.closed_by
       WHERE l.school_year_id = $1
       ORDER BY l.closed_at DESC
       LIMIT 1`,
      [yearId]
    );

    return NextResponse.json({
      year: {
        id: year.id,
        name: year.name,
        date_from: String(year.date_from).slice(0, 10),
        date_to: String(year.date_to).slice(0, 10),
        isActive: year.active,
        closed_at: year.closed_at,
        closed_by_name: year.closed_by_name,
      },
      summary: summaryRes.rows[0] ?? {
        groups_count: 0,
        students_count: 0,
        lessons_count: 0,
        contracts_count: 0,
      },
      teachers: teachersRes.rows.map((t) => ({
        id: t.teacher_id,
        name: `${t.first_name} ${t.last_name}`.trim(),
        groups_count: t.groups_count,
        students_count: t.students_count,
        lessons_scheduled: t.lessons_scheduled,
        lessons_completed: t.lessons_completed,
        lessons_cancelled: t.lessons_cancelled,
        total_duration_min: t.total_duration_min,
        total_hours: Math.round((t.total_duration_min / 60) * 10) / 10,
        attendance_marked_count: t.attendance_marked_count,
      })),
      groups: groupsRes.rows.map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        teacher_name: `${g.teacher_first_name} ${g.teacher_last_name}`.trim(),
        active: g.active,
        students_count: g.students_count,
      })),
      students: studentsRes.rows.map((s) => ({
        child_id: s.child_id,
        name: `${s.first_name} ${s.last_name}`.trim(),
        group_id: s.group_id,
        group_name: s.group_name,
        teacher_name: `${s.teacher_first_name} ${s.teacher_last_name}`.trim(),
        enrolled_at: String(s.enrolled_at).slice(0, 10),
        left_at: s.left_at ? String(s.left_at).slice(0, 10) : null,
      })),
      close_log: closeLogRes.rows[0] ?? null,
    });
  } catch (error) {
    console.error("GET school-years/[id]/history error:", error);
    return NextResponse.json({ message: "Błąd pobierania historii roku szkolnego" }, { status: 500 });
  }
}
