import { NextRequest, NextResponse } from "next/server";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import {
  managerSchoolAndClause,
  requireAdminSchoolContext,
} from "@/lib/admin-school-context";
import {
  sqlSchoolTimestampAsTimestamptz,
  toIsoUtc,
} from "@/lib/school-timezone";

/**
 * GET /api/admin/groups/year-lessons?schoolYearId=...
 * Lista grup szkoły z zajęciami w wybranym (lub aktywnym) roku szkolnym.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { searchParams } = new URL(request.url);
  const requestedYearId = searchParams.get("schoolYearId")?.trim() || null;

  const { clause: schoolClause, schoolId: managerSchoolId } = managerSchoolAndClause(
    ctx.tenant,
    "g.school_id",
    1,
  );
  const groupParams = managerSchoolId ? [managerSchoolId] : [];

  try {
    let year: { id: string; name: string | null; date_from: string; date_to: string } | null =
      null;

    if (requestedYearId) {
      const yearRes = await queryDb<{
        id: string;
        name: string | null;
        date_from: string;
        date_to: string;
        school_id: string;
      }>(
        ctx.tenant.role === "MANAGER"
          ? `SELECT id, name, date_from::text, date_to::text, school_id
             FROM school_years WHERE id = $1 AND school_id = $2`
          : `SELECT id, name, date_from::text, date_to::text, school_id
             FROM school_years WHERE id = $1`,
        ctx.tenant.role === "MANAGER"
          ? [requestedYearId, ctx.schoolId]
          : [requestedYearId],
      );
      const row = yearRes.rows[0];
      if (!row) {
        return NextResponse.json({ message: "Nie znaleziono roku szkolnego" }, { status: 404 });
      }
      year = {
        id: row.id,
        name: row.name,
        date_from: String(row.date_from).slice(0, 10),
        date_to: String(row.date_to).slice(0, 10),
      };
    } else if (ctx.schoolId) {
      const activeRes = await queryDb<{
        id: string;
        name: string | null;
        date_from: string;
        date_to: string;
      }>(
        `SELECT id, name, date_from::text, date_to::text
         FROM school_years
         WHERE school_id = $1 AND active = TRUE
         LIMIT 1`,
        [ctx.schoolId],
      );
      const row = activeRes.rows[0];
      if (row) {
        year = {
          id: row.id,
          name: row.name,
          date_from: String(row.date_from).slice(0, 10),
          date_to: String(row.date_to).slice(0, 10),
        };
      }
    }

    const groupsRes = await queryDb<{
      id: string;
      name: string;
      level: string | null;
      active: boolean;
      teacher_name: string | null;
      location_name: string | null;
      schedule: string | null;
    }>(
      `SELECT
         g.id,
         g.name,
         g.level,
         g.active,
         CASE WHEN t.id IS NULL THEN NULL ELSE CONCAT(t.first_name, ' ', t.last_name) END AS teacher_name,
         COALESCE(gl.name, MAX(l.name)) AS location_name,
         COALESCE(
           NULLIF(
             STRING_AGG(
               DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
               ', '
             ),
             ''
           ),
           '-'
         ) AS schedule
       FROM groups g
       LEFT JOIN users t ON t.id = g.teacher_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE 1=1 ${schoolClause}
       GROUP BY g.id, t.id, gl.name
       ORDER BY g.name ASC`,
      groupParams,
    );

    const lessonsByGroup = new Map<
      string,
      Array<{
        id: string;
        scheduled_at: string;
        status: string;
        duration_min: number;
      }>
    >();

    if (year) {
      const lessonSchool = managerSchoolAndClause(ctx.tenant, "g.school_id", 2);
      const lessonsRes = await queryDb<{
        id: string;
        group_id: string;
        scheduled_at: Date | string;
        status: string;
        duration_min: number;
      }>(
        `SELECT
           l.id,
           l.group_id,
           ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
           l.status,
           l.duration_min
         FROM lessons l
         INNER JOIN groups g ON g.id = l.group_id
         WHERE l.school_year_id = $1
           AND l.status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
           ${lessonSchool.clause}
         ORDER BY l.scheduled_at ASC`,
        lessonSchool.schoolId ? [year.id, lessonSchool.schoolId] : [year.id],
      );

      for (const row of lessonsRes.rows) {
        const list = lessonsByGroup.get(row.group_id) ?? [];
        list.push({
          id: row.id,
          scheduled_at: toIsoUtc(row.scheduled_at),
          status: row.status,
          duration_min: row.duration_min,
        });
        lessonsByGroup.set(row.group_id, list);
      }
    }

    const groups = groupsRes.rows.map((g) => {
      const lessons = lessonsByGroup.get(g.id) ?? [];
      const scheduled_count = lessons.filter((l) => l.status === "SCHEDULED").length;
      const completed_count = lessons.filter((l) => l.status === "COMPLETED").length;
      const cancelled_count = lessons.filter((l) => l.status === "CANCELLED").length;
      return {
        id: g.id,
        name: g.name,
        level: g.level,
        active: g.active,
        teacher_name: g.teacher_name,
        location_name: g.location_name,
        schedule: g.schedule,
        lessons_count: lessons.length,
        scheduled_count,
        completed_count,
        cancelled_count,
        lessons,
      };
    });

    return NextResponse.json({
      schoolYear: year,
      groups,
    });
  } catch (error) {
    console.error("GET groups/year-lessons error:", error);
    return NextResponse.json({ message: "Błąd pobierania zajęć grup" }, { status: 500 });
  }
}
