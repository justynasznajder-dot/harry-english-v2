import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import {
  ensureLessonsThroughActiveSchoolYear,
  sqlExistsUnfilledFutureScheduleSlot,
} from "@/lib/lesson-generation";
import { sqlSchoolTimestampAsTimestamptz, toIsoUtc } from "@/lib/school-timezone";
import {
  findActiveGroupNameConflict,
  validateHarryEnglishGroupNaming,
} from "@/lib/harry-english-group-naming";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { tenant } = ctx;
  const { id } = await params;
  try {
    await completePastScheduledLessons();

    const group = await queryDb<{
      id: string;
      school_id: string;
      teacher_id: string | null;
      [key: string]: unknown;
    }>(
      `SELECT g.*, CONCAT(u.first_name, ' ', u.last_name) AS teacher_name, gl.name AS location_name
       FROM groups g
       LEFT JOIN users u ON u.id = g.teacher_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       WHERE g.id = $1
         AND g.deleted_at IS NULL
         ${tenant.role === "MANAGER" ? "AND g.school_id = $2" : ""}
       LIMIT 1`,
      tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id]
    );
    if (!group.rows[0]) return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });

    const groupRow = group.rows[0];
    const groupSchoolId = String(groupRow.school_id);

    const activeYear = await queryDb<{ id: string; name: string }>(
      `SELECT id, name FROM school_years
       WHERE school_id = $1 AND active = TRUE
       LIMIT 1`,
      [groupSchoolId],
    );
    const activeYearId = activeYear.rows[0]?.id ?? null;
    const activeYearName = activeYear.rows[0]?.name ?? null;

    const scheduleTemplatesRaw = await queryDb(
      `SELECT st.*, l.name AS location_name
       FROM schedule_templates st
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE st.group_id = $1
       ORDER BY st.day_of_week, st.start_time`,
      [id]
    );

    const scheduleNeedsConfirmation =
      Boolean(activeYearId) &&
      scheduleTemplatesRaw.rows.length > 0 &&
      scheduleTemplatesRaw.rows.some(
        (st) => String((st as { school_year_id?: string | null }).school_year_id ?? "") !== activeYearId,
      );
    const scheduleConfirmedForActiveYear =
      Boolean(activeYearId) &&
      scheduleTemplatesRaw.rows.length > 0 &&
      scheduleTemplatesRaw.rows.every(
        (st) => String((st as { school_year_id?: string | null }).school_year_id ?? "") === activeYearId,
      );

    if (scheduleConfirmedForActiveYear && groupRow.teacher_id) {
      await ensureLessonsThroughActiveSchoolYear({
        schoolId: groupSchoolId,
        groupId: id,
        teacherId: groupRow.teacher_id,
      });
      await completePastScheduledLessons();
    }

    /** Lekcje listy: aktywny rok, a gdy go brak — rok z potwierdzonego harmonogramu. */
    let lessonsYearId = activeYearId;
    let lessonsYearName = activeYearName;
    if (!lessonsYearId && scheduleTemplatesRaw.rows.length > 0) {
      const yearIds = [
        ...new Set(
          scheduleTemplatesRaw.rows
            .map((st) => String((st as { school_year_id?: string | null }).school_year_id ?? ""))
            .filter(Boolean),
        ),
      ];
      if (yearIds.length === 1) {
        const yr = await queryDb<{ id: string; name: string }>(
          `SELECT id, name FROM school_years WHERE id = $1 LIMIT 1`,
          [yearIds[0]],
        );
        lessonsYearId = yr.rows[0]?.id ?? null;
        lessonsYearName = yr.rows[0]?.name ?? null;
      }
    }

    const futureLessonsByTemplate = lessonsYearId
      ? await queryDb<{ schedule_template_id: string; cnt: number }>(
          `SELECT schedule_template_id, COUNT(*)::int AS cnt
           FROM lessons
           WHERE group_id = $1
             AND school_year_id = $2
             AND schedule_template_id IS NOT NULL
             AND ${sqlSchoolTimestampAsTimestamptz("scheduled_at")} > NOW()
             AND status = 'SCHEDULED'
           GROUP BY schedule_template_id`,
          [id, lessonsYearId],
        )
      : { rows: [] as Array<{ schedule_template_id: string; cnt: number }> };
    const completedLessonsByTemplate = lessonsYearId
      ? await queryDb<{ schedule_template_id: string; cnt: number }>(
          `SELECT schedule_template_id, COUNT(*)::int AS cnt
           FROM lessons
           WHERE group_id = $1
             AND school_year_id = $2
             AND schedule_template_id IS NOT NULL
             AND status = 'COMPLETED'
           GROUP BY schedule_template_id`,
          [id, lessonsYearId],
        )
      : { rows: [] as Array<{ schedule_template_id: string; cnt: number }> };
    const templateFutureMap = new Map(
      futureLessonsByTemplate.rows.map((r) => [r.schedule_template_id, r.cnt]),
    );
    const templateCompletedMap = new Map(
      completedLessonsByTemplate.rows.map((r) => [r.schedule_template_id, r.cnt]),
    );
    const scheduleTemplates = scheduleTemplatesRaw.rows.map((st) => ({
      ...st,
      future_lessons_count: templateFutureMap.get(st.id) ?? 0,
      completed_lessons_count: templateCompletedMap.get(st.id) ?? 0,
    }));

    const students = await queryDb(
      `SELECT
         gs.id,
         gs.enrolled_at,
         gs.left_at,
         c.lesson_unit_price::text AS lesson_unit_price,
         c.monthly_unit_price::text AS monthly_unit_price,
         c.yearly_unit_price::text AS yearly_unit_price,
         c.id AS child_id,
         c.first_name,
         c.last_name,
         c.birth_date,
         c.active,
         c.confirmed
       FROM group_students gs
       JOIN children c ON c.id = gs.child_id
       WHERE gs.group_id = $1
       ORDER BY gs.enrolled_at DESC`,
      [id]
    );
    const locations = await queryDb(
      tenant.role === "MANAGER"
        ? `SELECT id, name FROM locations WHERE school_id = $1 AND active = TRUE ORDER BY name`
        : `SELECT id, name FROM locations WHERE active = TRUE ORDER BY name`,
      tenant.role === "MANAGER" ? [ctx.schoolId] : []
    );

    const schoolYearLessonsRes = lessonsYearId
      ? await queryDb<{
          id: string;
          scheduled_at: Date | string;
          status: string;
          duration_min: number;
        }>(
          `SELECT
             l.id,
             ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
             l.status,
             l.duration_min
           FROM lessons l
           WHERE l.group_id = $1
             AND l.school_year_id = $2
             AND l.status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
           ORDER BY l.scheduled_at ASC`,
          [id, lessonsYearId],
        )
      : { rows: [] as Array<{ id: string; scheduled_at: Date | string; status: string; duration_min: number }> };

    const schoolYearLessons = schoolYearLessonsRes.rows.map((row) => ({
      id: row.id,
      scheduled_at: toIsoUtc(row.scheduled_at),
      status: row.status,
      duration_min: row.duration_min,
    }));

    const futureCount = schoolYearLessons.filter((l) => l.status === "SCHEDULED").length;
    const completedCount = schoolYearLessons.filter((l) => l.status === "COMPLETED").length;

    const missingGeneratedRes =
      scheduleConfirmedForActiveYear && activeYearId
        ? await queryDb<{ missing: boolean }>(
            `SELECT ${sqlExistsUnfilledFutureScheduleSlot("$1", "$2")} AS missing`,
            [id, groupSchoolId],
          )
        : { rows: [{ missing: false }] };

    return NextResponse.json({
      group: groupRow,
      scheduleTemplates,
      students: students.rows,
      schoolYearLessons,
      locations: locations.rows,
      generatedLessons: {
        futureCount,
        completedCount,
        schoolYearCount: schoolYearLessons.length,
      },
      missingGeneratedLessons: Boolean(missingGeneratedRes.rows[0]?.missing),
      activeSchoolYear: activeYearId
        ? { id: activeYearId, name: activeYearName }
        : null,
      lessonsSchoolYear: lessonsYearId
        ? { id: lessonsYearId, name: lessonsYearName }
        : null,
      scheduleConfirmedForActiveYear,
      scheduleNeedsConfirmation,
    });
  } catch (error) {
    console.error("GET group detail error:", error);
    return NextResponse.json({ message: "Błąd pobierania szczegółów grupy" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { tenant } = ctx;
  const { id } = await params;
  try {
    const body = await request.json();
    const {
      // TODO(tymczasowo): name edytowalne po zapisie — potem usunąć
      name: bodyName,
      teacherId,
      maxStudents,
      active,
      priceMonthly,
      priceYearly,
      pricePerLesson,
      teacherPickupConsent,
    } = body;

    const existingRes = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      level: string | null;
      location_id: string | null;
      active: boolean;
      deleted_at: Date | string | null;
    }>(
      `SELECT id, school_id, name, level, location_id, active, deleted_at
       FROM groups
       WHERE id = $1 ${tenant.role === "MANAGER" ? "AND school_id = $2" : ""}
       LIMIT 1`,
      tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });
    }
    if (existing.deleted_at) {
      return NextResponse.json(
        { message: "Grupa została usunięta z widoku szkoły" },
        { status: 404 }
      );
    }

    const nextNameRaw =
      typeof bodyName === "string" ? bodyName.trim() : existing.name;
    const naming = validateHarryEnglishGroupNaming({
      name: nextNameRaw,
      level: existing.level ?? "",
      requireLevel: true,
    });
    if (!naming.ok) {
      return NextResponse.json({ message: naming.message }, { status: 400 });
    }
    const nextName = naming.name;

    const nextActive = active == null ? existing.active : Boolean(active);
    const nameChanged =
      nextName.toLowerCase() !== existing.name.trim().toLowerCase();
    if (nextActive && (nameChanged || !existing.active)) {
      const conflict = await findActiveGroupNameConflict({
        schoolId: existing.school_id,
        name: nextName,
        excludeGroupId: id,
      });
      if (conflict) {
        return NextResponse.json(
          { message: "Grupa o podanej nazwie już istnieje" },
          { status: 409 }
        );
      }
    }

    await queryDb(
      `UPDATE groups
       SET name = $2,
           teacher_id = $3,
           max_students = COALESCE($4, max_students),
           active = $5,
           price_monthly = $6,
           price_yearly = $7,
           price_per_lesson = $8,
           teacher_pickup_consent = COALESCE($9, teacher_pickup_consent)
       WHERE id = $1 ${tenant.role === "MANAGER" ? "AND school_id = $10" : ""}`,
      tenant.role === "MANAGER"
        ? [
            id,
            nextName,
            teacherId ?? null,
            maxStudents ?? null,
            nextActive,
            priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
            priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
            pricePerLesson != null && pricePerLesson !== "" ? Number(pricePerLesson) : null,
            teacherPickupConsent ?? null,
            ctx.schoolId,
          ]
        : [
            id,
            nextName,
            teacherId ?? null,
            maxStudents ?? null,
            nextActive,
            priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
            priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
            pricePerLesson != null && pricePerLesson !== "" ? Number(pricePerLesson) : null,
            teacherPickupConsent ?? null,
          ]
    );
    return NextResponse.json({ message: "Grupa została zaktualizowana" });
  } catch (error) {
    console.error("PUT group error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji grupy" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { tenant } = ctx;
  const { id } = await params;
  try {
    const updated = await queryDb<{ id: string }>(
      tenant.role === "MANAGER"
        ? `UPDATE groups
           SET deleted_at = NOW(), active = FALSE
           WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
           RETURNING id`
        : `UPDATE groups
           SET deleted_at = NOW(), active = FALSE
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id`,
      tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id]
    );
    if ((updated.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Nie znaleziono grupy do usunięcia" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      message:
        "Grupa usunięta z widoku szkoły (pozostaje w bazie jako nieaktywna)",
    });
  } catch (error) {
    console.error("DELETE group error:", error);
    return NextResponse.json({ message: "Błąd usuwania grupy" }, { status: 500 });
  }
}
