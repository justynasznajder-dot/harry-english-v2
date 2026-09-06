import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import {
  assertGroupInSchool,
  assertLocationInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const {
      groupId,
      dayOfWeek,
      startTime,
      locationId,
      durationMin = 45,
      onceWeeklyDay = false,
    } = body;
    if (!groupId || !dayOfWeek || !startTime || !locationId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const duration = Number(durationMin);
    if (!Number.isFinite(duration) || duration < 1) {
      return NextResponse.json(
        { message: "Podaj czas trwania w minutach (liczba większa od 0)" },
        { status: 400 }
      );
    }

    const group = await assertGroupInSchool(String(groupId), ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const groupMeta = await queryDb<{ lessons_per_week: number | null }>(
      `SELECT lessons_per_week FROM groups WHERE id = $1 LIMIT 1`,
      [groupId]
    );
    const groupIsTwiceWeekly = Number(groupMeta.rows[0]?.lessons_per_week) === 2;
    const markOnceWeekly = groupIsTwiceWeekly && Boolean(onceWeeklyDay);

    const location = await assertLocationInSchool(String(locationId), ctx.schoolId);
    if (!location.ok) return tenantNotFoundResponse("Nie znaleziono lokalizacji");

    const duplicate = await queryDb<{ id: string }>(
      `SELECT id
       FROM schedule_templates
       WHERE group_id = $1
         AND active = TRUE
         AND day_of_week = $2
         AND start_time = $3::time
       LIMIT 1`,
      [groupId, dayOfWeek, startTime]
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
      [groupId, dayOfWeek, startTime, ctx.schoolId]
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
      [locationId, dayOfWeek, startTime, groupId, ctx.schoolId]
    );
    if (roomConflict.rows[0]) {
      return NextResponse.json(
        {
          message: `Sala zajęta: ${roomConflict.rows[0].name}, ${roomConflict.rows[0].start_time}`,
        },
        { status: 409 }
      );
    }

    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    const templateId = randomUUID();

    if (markOnceWeekly) {
      await queryDb(
        `UPDATE schedule_templates
         SET once_weekly_day = FALSE
         WHERE group_id = $1 AND once_weekly_day = TRUE`,
        [groupId]
      );
    }

    await queryDb(
      `INSERT INTO schedule_templates (
         school_id, id, group_id, location_id, day_of_week, start_time,
         duration_min, school_year_id, once_weekly_day
       )
       VALUES ($1, $2, $3, $4, $5, $6::time, $7, $8, $9)`,
      [
        ctx.schoolId,
        templateId,
        groupId,
        locationId,
        dayOfWeek,
        startTime,
        duration,
        activeYear?.id ?? null,
        markOnceWeekly,
      ]
    );

    return NextResponse.json({
      message:
        "Termin został dodany. Zajęcia wygenerujesz osobno przyciskiem „Wygeneruj zajęcia”.",
      lessonsCreated: 0,
      id: templateId,
    });
  } catch (error) {
    console.error("POST schedule template error:", error);
    return NextResponse.json({ message: "Błąd dodawania terminu" }, { status: 500 });
  }
}
