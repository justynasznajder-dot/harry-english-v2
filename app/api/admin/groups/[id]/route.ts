import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { sqlExistsUnfilledFutureScheduleSlot } from "@/lib/lesson-generation";
import { normalizeLessonsPerWeek } from "@/lib/lessons-per-week";
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

    const activeYear = await queryDb<{
      id: string;
      name: string;
      date_from: string;
      date_to: string;
    }>(
      `SELECT id, name, date_from::text AS date_from, date_to::text AS date_to
       FROM school_years
       WHERE school_id = $1 AND active = TRUE
       LIMIT 1`,
      [groupSchoolId],
    );
    const activeYearId = activeYear.rows[0]?.id ?? null;
    const activeYearName = activeYear.rows[0]?.name ?? null;
    const activeYearDateFrom = activeYear.rows[0]?.date_from?.slice(0, 10) ?? null;
    const activeYearDateTo = activeYear.rows[0]?.date_to?.slice(0, 10) ?? null;

    const lessonBoundsRes = activeYearId
      ? await queryDb<{
          lessons_start_on: string | null;
          lessons_end_on: string | null;
        }>(
          `SELECT lessons_start_on::text AS lessons_start_on,
                  lessons_end_on::text AS lessons_end_on
           FROM group_school_year_bounds
           WHERE group_id = $1 AND school_year_id = $2
           LIMIT 1`,
          [id, activeYearId],
        )
      : { rows: [] as Array<{ lessons_start_on: string | null; lessons_end_on: string | null }> };
    const lessonBoundsRow = lessonBoundsRes.rows[0];
    const lessonBounds = {
      lessonsStartOn: lessonBoundsRow?.lessons_start_on?.slice(0, 10) ?? null,
      lessonsEndOn: lessonBoundsRow?.lessons_end_on?.slice(0, 10) ?? null,
    };

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

    // Nie dopełniaj tu zajęć — po usunięciu z listy GET odtwarzałby luki.
    // Generowanie tylko przez „Wygeneruj zajęcia” (i cron).
    if (scheduleConfirmedForActiveYear) {
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
          `SELECT st.id AS schedule_template_id, COUNT(l.id)::int AS cnt
           FROM schedule_templates st
           LEFT JOIN lessons l
             ON l.group_id = st.group_id
            AND l.school_year_id = $2
            AND l.status = 'SCHEDULED'
            AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
            AND (
              l.schedule_template_id = st.id
              OR (
                EXTRACT(ISODOW FROM l.scheduled_at)::int = st.day_of_week
                AND TO_CHAR(l.scheduled_at, 'HH24:MI:SS') = TO_CHAR(st.start_time, 'HH24:MI:SS')
              )
            )
           WHERE st.group_id = $1
             AND st.active = TRUE
           GROUP BY st.id`,
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
         gs.lessons_per_week,
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
          schedule_template_id: string | null;
        }>(
          `SELECT
             l.id,
             ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
             l.status,
             l.duration_min,
             l.schedule_template_id
           FROM lessons l
           WHERE l.group_id = $1
             AND l.school_year_id = $2
             AND l.status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
           ORDER BY l.scheduled_at ASC`,
          [id, lessonsYearId],
        )
      : {
          rows: [] as Array<{
            id: string;
            scheduled_at: Date | string;
            status: string;
            duration_min: number;
            schedule_template_id: string | null;
          }>,
        };

    const activeTemplateIds = new Set(
      scheduleTemplatesRaw.rows.map((st) => String((st as { id: string }).id)),
    );

    const schoolYearLessons = schoolYearLessonsRes.rows.map((row) => {
      const templateId = row.schedule_template_id
        ? String(row.schedule_template_id)
        : null;
      const orphanFromSchedule =
        row.status !== "CANCELLED" &&
        (templateId == null || !activeTemplateIds.has(templateId));
      return {
        id: row.id,
        scheduled_at: toIsoUtc(row.scheduled_at),
        status: row.status,
        duration_min: row.duration_min,
        schedule_template_id: templateId,
        orphan_from_schedule: orphanFromSchedule,
      };
    });

    const futureCount = schoolYearLessons.filter((l) => l.status === "SCHEDULED").length;
    const completedCount = schoolYearLessons.filter((l) => l.status === "COMPLETED").length;
    // Licznik u góry: aktualne zajęcia (bez anulowanych)
    const schoolYearCount = futureCount + completedCount;
    const orphanLessonsCount = schoolYearLessons.filter(
      (l) => l.orphan_from_schedule,
    ).length;

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
        schoolYearCount,
        orphanLessonsCount,
      },
      missingGeneratedLessons: Boolean(missingGeneratedRes.rows[0]?.missing),
      activeSchoolYear: activeYearId
        ? {
            id: activeYearId,
            name: activeYearName,
            dateFrom: activeYearDateFrom,
            dateTo: activeYearDateTo,
          }
        : null,
      lessonBounds,
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
      name: bodyName,
      level: bodyLevel,
      locationId: bodyLocationId,
      teacherId,
      maxStudents,
      active,
      priceMonthly,
      priceYearly,
      pricePerLesson,
      teacherPickupConsent,
      lessonsPerWeek,
    } = body;

    const existingRes = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      level: string | null;
      location_id: string | null;
      teacher_id: string | null;
      active: boolean;
      deleted_at: Date | string | null;
    }>(
      `SELECT id, school_id, name, level, location_id, teacher_id, active, deleted_at
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

    const nextLevelRaw =
      typeof bodyLevel === "string" ? bodyLevel.trim() : (existing.level ?? "");
    const nextNameRaw =
      typeof bodyName === "string" ? bodyName.trim() : existing.name;
    const naming = validateHarryEnglishGroupNaming({
      name: nextNameRaw,
      level: nextLevelRaw,
      requireLevel: true,
      allowLegacyLevel: true,
    });
    if (!naming.ok) {
      return NextResponse.json({ message: naming.message }, { status: 400 });
    }
    const nextName = naming.name;
    const nextLevel = naming.level;

    let nextLocationId = existing.location_id;
    if (typeof bodyLocationId === "string") {
      const locationIdTrim = bodyLocationId.trim();
      if (!locationIdTrim) {
        return NextResponse.json(
          { message: "Wybierz lokalizację grupy" },
          { status: 400 }
        );
      }
      const locRes = await queryDb<{ id: string }>(
        `SELECT id FROM locations
         WHERE id = $1 AND school_id = $2 AND active = TRUE
         LIMIT 1`,
        [locationIdTrim, existing.school_id]
      );
      if (!locRes.rows[0]) {
        // Pozwól zachować dotychczasową (np. nieaktywną) lokalizację bez zmiany.
        if (locationIdTrim !== existing.location_id) {
          return NextResponse.json(
            { message: "Nie znaleziono lokalizacji" },
            { status: 404 }
          );
        }
      }
      nextLocationId = locationIdTrim;
    }
    if (!nextLocationId) {
      return NextResponse.json(
        { message: "Wybierz lokalizację grupy" },
        { status: 400 }
      );
    }

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

    const nextLessonsPerWeek =
      lessonsPerWeek === undefined
        ? null
        : normalizeLessonsPerWeek(lessonsPerWeek);

    const nextTeacherId =
      teacherId === undefined
        ? existing.teacher_id
        : teacherId == null || String(teacherId).trim() === ""
          ? null
          : String(teacherId).trim();
    const teacherChanged =
      (existing.teacher_id ?? null) !== (nextTeacherId ?? null);

    await queryDb(
      `UPDATE groups
       SET name = $2,
           level = $3,
           location_id = $4,
           teacher_id = $5,
           max_students = COALESCE($6, max_students),
           active = $7,
           price_monthly = $8,
           price_yearly = $9,
           price_per_lesson = $10,
           teacher_pickup_consent = COALESCE($11, teacher_pickup_consent),
           lessons_per_week = COALESCE($12, lessons_per_week)
       WHERE id = $1 ${tenant.role === "MANAGER" ? "AND school_id = $13" : ""}`,
      tenant.role === "MANAGER"
        ? [
            id,
            nextName,
            nextLevel,
            nextLocationId,
            nextTeacherId,
            maxStudents ?? null,
            nextActive,
            priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
            priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
            pricePerLesson != null && pricePerLesson !== "" ? Number(pricePerLesson) : null,
            teacherPickupConsent ?? null,
            nextLessonsPerWeek,
            ctx.schoolId,
          ]
        : [
            id,
            nextName,
            nextLevel,
            nextLocationId,
            nextTeacherId,
            maxStudents ?? null,
            nextActive,
            priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
            priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
            pricePerLesson != null && pricePerLesson !== "" ? Number(pricePerLesson) : null,
            teacherPickupConsent ?? null,
            nextLessonsPerWeek,
          ]
    );

    let futureLessonsTeacherUpdated = 0;
    if (teacherChanged && nextTeacherId) {
      // Przyszłe (jeszcze nieodbyte) SCHEDULED — historia COMPLETED / przeszłość zostaje.
      const synced = await queryDb<{ id: string }>(
        `UPDATE lessons
         SET teacher_id = $2
         WHERE group_id = $1
           AND status = 'SCHEDULED'
           AND ${sqlSchoolTimestampAsTimestamptz("scheduled_at")} > NOW()
           AND teacher_id IS DISTINCT FROM $2
         RETURNING id`,
        [id, nextTeacherId]
      );
      futureLessonsTeacherUpdated = synced.rows.length;
    }

    return NextResponse.json({
      message:
        teacherChanged && nextTeacherId
          ? futureLessonsTeacherUpdated > 0
            ? `Grupa została zaktualizowana. Nowy lektor przypisany do ${futureLessonsTeacherUpdated} przyszłych zajęć.`
            : "Grupa została zaktualizowana. Brak przyszłych zajęć do przepięcia lektora."
          : "Grupa została zaktualizowana",
      futureLessonsTeacherUpdated,
    });
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
