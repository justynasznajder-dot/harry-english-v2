import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<boolean> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return false;
  return canAccessSchoolAdminApis(userId);
}

export async function POST(request: NextRequest) {
  if (!(await ensureAdmin(request))) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { groupId, dayOfWeek, startTime, locationId, durationMin = 60 } = body;
    if (!groupId || !dayOfWeek || !startTime || !locationId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const teacherConflict = await queryDb<{ name: string; start_time: string }>(
      `SELECT g.name, st.start_time::text
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE g.teacher_id = (SELECT teacher_id FROM groups WHERE id = $1)
         AND st.day_of_week = $2
         AND st.start_time = $3::time
         AND st.group_id != $1
       LIMIT 1`,
      [groupId, dayOfWeek, startTime]
    );
    if (teacherConflict.rows[0]) {
      return NextResponse.json(
        { message: `Nauczyciel zajęty: ${teacherConflict.rows[0].name}, ${teacherConflict.rows[0].start_time}` },
        { status: 409 }
      );
    }

    const roomConflict = await queryDb<{ name: string; start_time: string }>(
      `SELECT g.name, st.start_time::text
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.location_id = $1
         AND st.day_of_week = $2
         AND st.start_time = $3::time
         AND st.group_id != $4
       LIMIT 1`,
      [locationId, dayOfWeek, startTime, groupId]
    );
    if (roomConflict.rows[0]) {
      return NextResponse.json(
        { message: `Sala zajęta: ${roomConflict.rows[0].name}, ${roomConflict.rows[0].start_time}` },
        { status: 409 }
      );
    }

    const groupRow = await queryDb<{ school_id: string; school_year_id: string | null }>(
      `SELECT school_id, school_year_id FROM groups WHERE id = $1 LIMIT 1`,
      [groupId]
    );
    const schoolId = groupRow.rows[0]?.school_id;
    const schoolYearId = groupRow.rows[0]?.school_year_id ?? null;

    await queryDb(
      `INSERT INTO schedule_templates (id, group_id, location_id, day_of_week, start_time, duration_min, school_year_id)
       VALUES ($1, $2, $3, $4, $5::time, $6, $7::uuid)`,
      [randomUUID(), groupId, locationId, dayOfWeek, startTime, durationMin, schoolYearId]
    );

    return NextResponse.json({ message: "Termin został dodany" });
  } catch (error) {
    console.error("POST schedule template error:", error);
    return NextResponse.json({ message: "Błąd dodawania terminu" }, { status: 500 });
  }
}
