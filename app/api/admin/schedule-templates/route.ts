import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
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
    const { groupId, dayOfWeek, startTime, locationId, durationMin = 60 } = body;
    if (!groupId || !dayOfWeek || !startTime || !locationId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const group = await assertGroupInSchool(String(groupId), ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const location = await assertLocationInSchool(String(locationId), ctx.schoolId);
    if (!location.ok) return tenantNotFoundResponse("Nie znaleziono lokalizacji");

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

    await queryDb(
      `INSERT INTO schedule_templates (school_id, id, group_id, location_id, day_of_week, start_time, duration_min, school_year_id)
       VALUES ($1, $2, $3, $4, $5, $6::time, $7, $8)`,
      [
        ctx.schoolId,
        randomUUID(),
        groupId,
        locationId,
        dayOfWeek,
        startTime,
        durationMin,
        group.schoolYearId,
      ]
    );

    return NextResponse.json({ message: "Termin został dodany" });
  } catch (error) {
    console.error("POST schedule template error:", error);
    return NextResponse.json({ message: "Błąd dodawania terminu" }, { status: 500 });
  }
}
