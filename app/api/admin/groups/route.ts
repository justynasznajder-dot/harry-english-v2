import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import {
  managerSchoolAndClause,
  requireAdminSchoolContext,
  resolveInsertSchoolId,
} from "@/lib/admin-school-context";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { clause: schoolClause, schoolId: managerSchoolId } = managerSchoolAndClause(
    ctx.tenant,
    "g.school_id",
    1
  );
  const listParams = managerSchoolId ? [managerSchoolId] : [];

  try {
    const groups = await queryDb<{
      id: string;
      name: string;
      level: string | null;
      max_students: number;
      active: boolean;
      teacher_id: string | null;
      teacher_name: string | null;
      location_name: string | null;
      location_id: string | null;
      schedule: string | null;
      students_count: string;
      price_monthly: string | null;
      price_yearly: string | null;
      price_per_lesson: string | null;
      has_schedule: boolean;
      future_lessons_count: number;
      missing_generated_lessons: boolean;
      schedule_needs_confirmation: boolean;
    }>(
      `SELECT
         g.id,
         g.name,
         g.level,
         g.max_students,
         g.active,
         g.location_id,
         g.teacher_id,
         g.price_monthly::text AS price_monthly,
         g.price_yearly::text AS price_yearly,
         g.price_per_lesson::text AS price_per_lesson,
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
         ) AS schedule,
         COUNT(DISTINCT gs.id) FILTER (
           WHERE gs.left_at IS NULL
         )::text AS students_count,
         (COUNT(DISTINCT st.id) > 0) AS has_schedule,
         COALESCE((
           SELECT COUNT(*)::int
           FROM lessons l
           WHERE l.group_id = g.id
             AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
             AND l.status = 'SCHEDULED'
         ), 0) AS future_lessons_count,
         (
           COUNT(DISTINCT st.id) > 0
           AND COUNT(DISTINCT st.id) FILTER (
             WHERE st.school_year_id IS DISTINCT FROM (
               SELECT sy.id FROM school_years sy
               WHERE sy.school_id = g.school_id AND sy.active = TRUE
               LIMIT 1
             )
           ) = 0
           AND COALESCE((
             SELECT COUNT(*)::int
             FROM lessons l
             WHERE l.group_id = g.id
               AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
               AND l.status = 'SCHEDULED'
           ), 0) = 0
         ) AS missing_generated_lessons,
         (
           COUNT(DISTINCT st.id) > 0
           AND COUNT(DISTINCT st.id) FILTER (
             WHERE st.school_year_id IS DISTINCT FROM (
               SELECT sy.id FROM school_years sy
               WHERE sy.school_id = g.school_id AND sy.active = TRUE
               LIMIT 1
             )
           ) > 0
         ) AS schedule_needs_confirmation
       FROM groups g
       LEFT JOIN users t ON t.id = g.teacher_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       LEFT JOIN locations l ON l.id = st.location_id
       LEFT JOIN group_students gs ON gs.group_id = g.id
       WHERE 1=1 ${schoolClause}
       GROUP BY g.id, t.id, gl.name
       ORDER BY g.created_at DESC`,
      listParams
    );

    return NextResponse.json({ groups: groups.rows });
  } catch (error) {
    console.error("GET groups error:", error);
    return NextResponse.json({ message: "Błąd pobierania grup" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const {
      name,
      level,
      teacherId,
      maxStudents = 12,
      active = true,
      locationId,
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
      priceMonthly,
      priceYearly,
      pricePerLesson,
      teacherPickupConsent,
    }: {
      name?: string;
      level?: string;
      teacherId?: string | null;
      maxStudents?: number;
      active?: boolean;
      locationId?: string | null;
      school_id?: string;
      schoolId?: string;
      priceMonthly?: number | string | null;
      priceYearly?: number | string | null;
      pricePerLesson?: number | string | null;
      teacherPickupConsent?: boolean;
    } = body;

    if (!name) return NextResponse.json({ message: "Nazwa grupy jest wymagana" }, { status: 400 });
    if (!teacherId) {
      return NextResponse.json({ message: "Wybierz nauczyciela dla grupy" }, { status: 400 });
    }

    const insertSchoolId = resolveInsertSchoolId(ctx.tenant, {
      bodySchoolId,
      bodySchoolIdCamel,
    });
    if (!insertSchoolId) {
      return NextResponse.json(
        {
          message:
            ctx.tenant.role === "MANAGER"
              ? "Brak dostępu do wskazanej szkoły"
              : "Brak identyfikatora szkoły (school_id / schoolId lub SCHOOL_ID w środowisku)",
        },
        { status: 400 }
      );
    }

    const inserted = await queryDb<{ id: string }>(
      `INSERT INTO groups (
         id, school_id, teacher_id, name, level, max_students, active,
         created_at, location_id, price_monthly, price_yearly,
         price_per_lesson, teacher_pickup_consent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        randomUUID(),
        insertSchoolId,
        teacherId ?? null,
        name.trim(),
        level ?? null,
        maxStudents,
        active,
        locationId ?? null,
        priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
        priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
        pricePerLesson != null && pricePerLesson !== "" ? Number(pricePerLesson) : null,
        Boolean(teacherPickupConsent),
      ]
    );

    return NextResponse.json({ id: inserted.rows[0].id, message: "Grupa została utworzona" });
  } catch (error) {
    console.error("POST groups error:", error);
    return NextResponse.json({ message: "Błąd tworzenia grupy" }, { status: 500 });
  }
}
