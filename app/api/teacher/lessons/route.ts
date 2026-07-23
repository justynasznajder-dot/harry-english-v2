import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { isLektor, queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { sqlSchoolTimestampAsTimestamptz, toIsoUtc } from "@/lib/school-timezone";

async function ensureTeacherOwnsGroup(userId: string, groupId: string): Promise<boolean> {
  const res = await queryDb<{ id: string }>(
    `SELECT id FROM groups WHERE id = $1 AND teacher_id = $2 AND active = TRUE LIMIT 1`,
    [groupId, userId]
  );
  return Boolean(res.rows[0]);
}

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
  }
  if (!(await isLektor(userId))) {
    return NextResponse.json({ message: "Brak uprawnień lektora" }, { status: 403 });
  }

  const groupId = request.nextUrl.searchParams.get("groupId")?.trim();
  if (!groupId) {
    return NextResponse.json({ message: "Brak parametru groupId" }, { status: 400 });
  }
  if (!(await ensureTeacherOwnsGroup(userId, groupId))) {
    return NextResponse.json({ message: "Brak dostępu do grupy" }, { status: 403 });
  }

  try {
    await completePastScheduledLessons();

    const res = await queryDb<{
      id: string;
      scheduled_at: Date | string;
      duration_min: number;
      status: string;
      location_name: string | null;
    }>(
      `SELECT l.id,
              ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
              l.duration_min,
              l.status::text AS status,
              loc.name AS location_name
       FROM lessons l
       LEFT JOIN locations loc ON loc.id = l.location_id
       WHERE l.group_id = $1
         AND l.status IN ('SCHEDULED', 'COMPLETED')
       ORDER BY l.scheduled_at DESC
       LIMIT 100`,
      [groupId]
    );

    return NextResponse.json({
      lessons: res.rows.map((row) => ({
        id: row.id,
        scheduledAt: toIsoUtc(row.scheduled_at),
        durationMin: row.duration_min,
        status: row.status,
        locationName: row.location_name,
      })),
    });
  } catch (error) {
    console.error("GET /api/teacher/lessons:", error);
    return NextResponse.json({ message: "Błąd pobierania lekcji" }, { status: 500 });
  }
}
