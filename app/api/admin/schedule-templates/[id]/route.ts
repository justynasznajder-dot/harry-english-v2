import { NextRequest, NextResponse } from "next/server";
import { queryDb, runPgTransaction } from "@/lib/db";
import {
  assertLocationInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { purgeFutureOrphanScheduledLessons } from "@/lib/lesson-generation";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

async function countGeneratedLessonsForTemplate(
  templateId: string,
  groupId: string,
  dayOfWeek: number,
  startTime: string,
): Promise<number> {
  const res = await queryDb<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt
     FROM lessons l
     WHERE l.group_id = $1
       AND l.status IN ('SCHEDULED', 'COMPLETED')
       AND (
         l.schedule_template_id = $2
         OR (
           EXTRACT(ISODOW FROM l.scheduled_at)::int = $3
           AND TO_CHAR(l.scheduled_at, 'HH24:MI:SS') = $4
         )
       )`,
    [groupId, templateId, dayOfWeek, startTime],
  );
  return res.rows[0]?.cnt ?? 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const body = await request.json();
    const hasScheduleFields =
      body.dayOfWeek != null ||
      body.startTime != null ||
      body.locationId != null ||
      body.durationMin != null;

    const existing = await queryDb<{
      id: string;
      group_id: string;
      day_of_week: number;
      start_time: string;
      location_id: string;
      duration_min: number;
      once_weekly_day: boolean;
      lessons_per_week: number | null;
    }>(
      `SELECT
         st.id,
         st.group_id,
         st.day_of_week,
         TO_CHAR(st.start_time, 'HH24:MI:SS') AS start_time,
         st.location_id,
         st.duration_min,
         st.once_weekly_day,
         g.lessons_per_week
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.id = $1 AND g.school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    const row = existing.rows[0];
    if (!row) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }

    // Tylko oznaczenie dnia 1× — dozwolone także gdy są zajęcia.
    if (!hasScheduleFields) {
      if (typeof body.onceWeeklyDay !== "boolean") {
        return NextResponse.json(
          { message: "Podaj onceWeeklyDay (true/false) albo pola terminu do edycji" },
          { status: 400 }
        );
      }

      if (Number(row.lessons_per_week) !== 2 && body.onceWeeklyDay) {
        return NextResponse.json(
          {
            message:
              "Dzień dla dzieci 1× można oznaczyć tylko w grupie z zajęciami 2× w tygodniu",
          },
          { status: 400 }
        );
      }

      if (body.onceWeeklyDay) {
        await queryDb(
          `UPDATE schedule_templates
           SET once_weekly_day = FALSE
           WHERE group_id = $1 AND once_weekly_day = TRUE AND id <> $2`,
          [row.group_id, id]
        );
      }

      await queryDb(
        `UPDATE schedule_templates
         SET once_weekly_day = $2
         WHERE id = $1`,
        [id, body.onceWeeklyDay]
      );

      return NextResponse.json({ message: "Zaktualizowano termin" });
    }

    const dayOfWeek = Number(body.dayOfWeek ?? row.day_of_week);
    const startTimeRaw = String(body.startTime ?? row.start_time.slice(0, 5));
    const startTime =
      startTimeRaw.length === 5 ? `${startTimeRaw}:00` : startTimeRaw;
    const locationId = String(body.locationId ?? row.location_id);
    const durationMin = Number(body.durationMin ?? row.duration_min);
    const onceWeeklyDay =
      typeof body.onceWeeklyDay === "boolean"
        ? body.onceWeeklyDay
        : Boolean(row.once_weekly_day);

    if (![1, 2, 3, 4, 5, 6, 7].includes(dayOfWeek)) {
      return NextResponse.json({ message: "Nieprawidłowy dzień tygodnia" }, { status: 400 });
    }
    if (!Number.isFinite(durationMin) || durationMin < 15) {
      return NextResponse.json(
        { message: "Czas trwania musi wynosić co najmniej 15 minut" },
        { status: 400 }
      );
    }

    const generatedCount = await countGeneratedLessonsForTemplate(
      id,
      row.group_id,
      row.day_of_week,
      row.start_time,
    );
    if (generatedCount > 0) {
      return NextResponse.json(
        {
          message:
            "Nie można edytować terminu — są już wygenerowane zajęcia. Usuń termin albo zajęcia, a potem dodaj nowy.",
        },
        { status: 409 }
      );
    }

    const location = await assertLocationInSchool(locationId, ctx.schoolId);
    if (!location.ok) return tenantNotFoundResponse("Nie znaleziono lokalizacji");

    const groupIsTwiceWeekly = Number(row.lessons_per_week) === 2;
    if (!groupIsTwiceWeekly && onceWeeklyDay) {
      return NextResponse.json(
        {
          message:
            "Dzień dla dzieci 1× można oznaczyć tylko w grupie z zajęciami 2× w tygodniu",
        },
        { status: 400 }
      );
    }
    const markOnceWeekly = groupIsTwiceWeekly && onceWeeklyDay;

    const duplicate = await queryDb<{ id: string }>(
      `SELECT id
       FROM schedule_templates
       WHERE group_id = $1
         AND active = TRUE
         AND day_of_week = $2
         AND start_time = $3::time
         AND id <> $4
       LIMIT 1`,
      [row.group_id, dayOfWeek, startTime, id]
    );
    if (duplicate.rows[0]) {
      return NextResponse.json(
        {
          message:
            "Ten termin już jest w harmonogramie grupy (ten sam dzień i godzina). Usuń istniejący albo wybierz inny termin.",
        },
        { status: 409 }
      );
    }

    const teacherConflict = await queryDb<{ name: string; start_time: string }>(
      `SELECT g.name, st.start_time::text
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id AND g.school_id = $4
       WHERE g.teacher_id = (SELECT teacher_id FROM groups WHERE id = $1 AND school_id = $4)
         AND st.day_of_week = $2
         AND st.start_time = $3::time
         AND st.group_id != $1
       LIMIT 1`,
      [row.group_id, dayOfWeek, startTime, ctx.schoolId]
    );
    if (teacherConflict.rows[0]) {
      return NextResponse.json(
        {
          message: `Nauczyciel zajęty: ${teacherConflict.rows[0].name}, ${teacherConflict.rows[0].start_time}`,
        },
        { status: 409 }
      );
    }

    const roomConflict = await queryDb<{ name: string; start_time: string }>(
      `SELECT g.name, st.start_time::text
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id AND g.school_id = $5
       WHERE st.location_id = $1
         AND st.day_of_week = $2
         AND st.start_time = $3::time
         AND st.group_id != $4
       LIMIT 1`,
      [locationId, dayOfWeek, startTime, row.group_id, ctx.schoolId]
    );
    if (roomConflict.rows[0]) {
      return NextResponse.json(
        {
          message: `Sala zajęta: ${roomConflict.rows[0].name}, ${roomConflict.rows[0].start_time}`,
        },
        { status: 409 }
      );
    }

    if (markOnceWeekly) {
      await queryDb(
        `UPDATE schedule_templates
         SET once_weekly_day = FALSE
         WHERE group_id = $1 AND once_weekly_day = TRUE AND id <> $2`,
        [row.group_id, id]
      );
    }

    await queryDb(
      `UPDATE schedule_templates
       SET location_id = $2,
           day_of_week = $3,
           start_time = $4::time,
           duration_min = $5,
           once_weekly_day = $6
       WHERE id = $1`,
      [id, locationId, dayOfWeek, startTime, durationMin, markOnceWeekly]
    );

    return NextResponse.json({ message: "Termin zaktualizowany" });
  } catch (error) {
    console.error("PATCH schedule template error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji terminu" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const existing = await queryDb<{
      id: string;
      group_id: string;
      day_of_week: number;
      start_time: string;
    }>(
      `SELECT
         st.id,
         st.group_id,
         st.day_of_week,
         TO_CHAR(st.start_time, 'HH24:MI:SS') AS start_time
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.id = $1 AND g.school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    const template = existing.rows[0];
    if (!template) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }

    const lessonsRemoved = await runPgTransaction(async (client) => {
      // Przyszłe SCHEDULED z tego szablonu LUB z tym samym dniem/godziną w grupie
      // (na wypadek zajęć bez schedule_template_id / po wcześniejszym odpięciu).
      const toRemove = await client.query<{ id: string }>(
        `SELECT l.id
         FROM lessons l
         WHERE l.group_id = $1
           AND l.status = 'SCHEDULED'
           AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
           AND (
             l.schedule_template_id = $2
             OR (
               EXTRACT(ISODOW FROM l.scheduled_at)::int = $3
               AND TO_CHAR(l.scheduled_at, 'HH24:MI:SS') = $4
             )
           )`,
        [template.group_id, id, template.day_of_week, template.start_time]
      );
      const lessonIds = toRemove.rows.map((r) => r.id);

      if (lessonIds.length > 0) {
        await client.query(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [
          lessonIds,
        ]);
        await client.query(
          `DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`,
          [lessonIds]
        );
        await client.query(
          `DELETE FROM lessons
           WHERE id = ANY($1::text[])
             AND status = 'SCHEDULED'`,
          [lessonIds]
        );
      }

      // Zakończone / przeszłe: odłącz od szablonu, żeby dało się usunąć termin.
      await client.query(
        `UPDATE lessons
         SET schedule_template_id = NULL
         WHERE schedule_template_id = $1`,
        [id]
      );

      const delTpl = await client.query<{ id: string }>(
        `DELETE FROM schedule_templates st
         USING groups g
         WHERE st.id = $1
           AND st.group_id = g.id
           AND g.school_id = $2
         RETURNING st.id`,
        [id, ctx.schoolId]
      );
      if (!delTpl.rows[0]) {
        throw new Error("TEMPLATE_NOT_FOUND");
      }

      return lessonIds.length;
    });

    const orphansRemoved = await purgeFutureOrphanScheduledLessons(template.group_id);
    const totalRemoved = lessonsRemoved + orphansRemoved;

    return NextResponse.json({
      message:
        totalRemoved > 0
          ? `Termin usunięty. Usunięto też ${totalRemoved} ${
              totalRemoved === 1
                ? "nadchodzące zajęcie"
                : totalRemoved < 5
                  ? "nadchodzące zajęcia"
                  : "nadchodzących zajęć"
            } z kalendarza.`
          : "Termin usunięty",
      lessonsRemoved: totalRemoved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }
    console.error("DELETE schedule template error:", error);
    return NextResponse.json({ message: "Błąd usuwania terminu" }, { status: 500 });
  }
}
