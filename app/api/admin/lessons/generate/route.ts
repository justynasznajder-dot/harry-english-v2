import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { canAccessSchoolAdminApis, DEFAULT_SCHOOL_ID, getActiveSchoolYear, queryDb } from "@/lib/db";

function tokenToUserId(token: string): string | null {
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] || null;
  } catch {
    return null;
  }
}

async function ensureAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return false;
  const userId = tokenToUserId(token);
  if (!userId) return false;
  return canAccessSchoolAdminApis(userId);
}

function nextDateForWeekday(base: Date, dayOfWeek: number): Date {
  const current = ((base.getDay() + 6) % 7) + 1;
  const diff = (dayOfWeek - current + 7) % 7;
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  return d;
}

function dateOnlyYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdFromDb(v: string | Date): string {
  if (typeof v === "string") return v.slice(0, 10);
  return dateOnlyYmd(new Date(v));
}

function isDayInHolidayRanges(
  day: Date,
  rows: { date_from: string | Date; date_to: string | Date }[]
): boolean {
  const ds = dateOnlyYmd(day);
  for (const r of rows) {
    const from = ymdFromDb(r.date_from);
    const to = ymdFromDb(r.date_to);
    if (from <= ds && to >= ds) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (!(await ensureAdmin(request))) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { groupId, dateFrom, dateTo } = body as { groupId?: string; dateFrom?: string; dateTo?: string };
    if (!groupId || !dateFrom || !dateTo) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const groupRes = await queryDb<{ teacher_id: string | null; school_id: string }>(
      `SELECT teacher_id, school_id FROM groups WHERE id = $1 LIMIT 1`,
      [groupId]
    );
    const gRow = groupRes.rows[0];
    const teacherId = gRow?.teacher_id ?? null;
    if (!teacherId) return NextResponse.json({ message: "Grupa nie ma przypisanego nauczyciela" }, { status: 400 });

    const schoolId = gRow?.school_id ?? DEFAULT_SCHOOL_ID;
    const activeYear = await getActiveSchoolYear(schoolId);
    if (!activeYear) {
      return NextResponse.json({ message: "Brak aktywnego roku szkolnego" }, { status: 400 });
    }

    const yFrom = ymdFromDb((activeYear as { date_from: string | Date }).date_from);
    const yTo = ymdFromDb((activeYear as { date_to: string | Date }).date_to);
    const yearId = String((activeYear as { id: string }).id);

    if (dateFrom < yFrom || dateTo > yTo) {
      return NextResponse.json(
        {
          message: `Daty poza zakresem aktywnego roku szkolnego (${yFrom} - ${yTo})`,
        },
        { status: 400 }
      );
    }

    const holidays = await queryDb<{ date_from: string; date_to: string }>(
      `SELECT date_from::text, date_to::text
       FROM school_holidays
       WHERE school_id = $1
         AND (school_year_id::text = $2 OR school_year_id IS NULL)
         AND date_from <= $3::date
         AND date_to >= $4::date`,
      [schoolId, yearId, dateTo, dateFrom]
    );

    const templates = await queryDb<{
      day_of_week: number;
      start_time: string;
      duration_min: number;
      location_id: string;
    }>(
      `SELECT day_of_week, start_time::text, duration_min, location_id
       FROM schedule_templates
       WHERE group_id = $1`,
      [groupId]
    );

    const from = new Date(dateFrom + "T12:00:00");
    const to = new Date(dateTo + "T12:00:00");
    let created = 0;

    for (const st of templates.rows) {
      let d = nextDateForWeekday(from, st.day_of_week);
      while (d <= to) {
        if (isDayInHolidayRanges(d, holidays.rows)) {
          d.setDate(d.getDate() + 7);
          continue;
        }
        const [hh, mm] = st.start_time.slice(0, 5).split(":").map(Number);
        const scheduled = new Date(d);
        scheduled.setHours(hh, mm, 0, 0);
        const iso = scheduled.toISOString();

        const exists = await queryDb<{ id: string }>(
          `SELECT id FROM lessons WHERE group_id = $1 AND scheduled_at = $2::timestamp LIMIT 1`,
          [groupId, iso]
        );
        if (!exists.rows[0]) {
          await queryDb(
            `INSERT INTO lessons (
              id, group_id, teacher_id, location_id, scheduled_at, duration_min, status, created_at, school_year_id
             ) VALUES ($1, $2, $3, $4, $5::timestamp, $6, 'SCHEDULED', NOW(), $7::uuid)`,
            [randomUUID(), groupId, teacherId, st.location_id, iso, st.duration_min, yearId]
          );
          created += 1;
        }
        d.setDate(d.getDate() + 7);
      }
    }

    return NextResponse.json({ created, message: `Wygenerowano ${created} zajęć` });
  } catch (error) {
    console.error("POST lessons/generate error:", error);
    return NextResponse.json({ message: "Błąd generowania zajęć" }, { status: 500 });
  }
}
