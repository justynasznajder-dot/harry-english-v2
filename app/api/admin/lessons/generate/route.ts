import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { assertGroupInSchool, requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

const TZ = "Europe/Warsaw";

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
  rows: { date_from: string | Date; date_to: string | Date }[],
): boolean {
  const ds = dateOnlyYmd(day);
  for (const r of rows) {
    const from = ymdFromDb(r.date_from);
    const to = ymdFromDb(r.date_to);
    if (from <= ds && to >= ds) return true;
  }
  return false;
}

function buildGenerateMessage(opts: { created: number; retroactive: boolean }): string {
  const { created, retroactive } = opts;
  if (created === 0) {
    return "Wszystkie zajęcia w tym zakresie już istnieją w kalendarzu.";
  }
  let message = `Wygenerowano ${created} zajęć (status: zaplanowane).`;
  if (retroactive) {
    message +=
      " Uwaga: generowano zajęcia wstecznie — minione terminy też trafią do kalendarza jako zaplanowane i można je anulować.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId, dateFrom, dateTo } = body as { groupId?: string; dateFrom?: string; dateTo?: string };
    if (!groupId || !dateFrom || !dateTo) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const teacherId = group.teacherId;
    if (!teacherId) {
      return NextResponse.json({ message: "Grupa nie ma przypisanego nauczyciela" }, { status: 400 });
    }

    const schoolId = ctx.schoolId;
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
        { status: 400 },
      );
    }

    const todayRes = await queryDb<{ today: string }>(
      `SELECT (NOW() AT TIME ZONE '${TZ}')::date::text AS today`,
    );
    const todayYmd = todayRes.rows[0]?.today ?? dateOnlyYmd(new Date());
    const retroactive = dateFrom < todayYmd;

    const holidays = await queryDb<{ date_from: string; date_to: string }>(
      `SELECT date_from::text, date_to::text
       FROM school_holidays
       WHERE school_id = $1
         AND (school_year_id = $2 OR school_year_id IS NULL)
         AND date_from <= $3::date
         AND date_to >= $4::date`,
      [schoolId, yearId, dateTo, dateFrom],
    );

    const templates = await queryDb<{
      id: string;
      day_of_week: number;
      start_time: string;
      duration_min: number;
      location_id: string;
    }>(
      `SELECT id, day_of_week, start_time::text, duration_min, location_id
       FROM schedule_templates
       WHERE group_id = $1`,
      [groupId],
    );

    const from = new Date(dateFrom + "T12:00:00");
    const to = new Date(dateTo + "T12:00:00");
    let created = 0;

    for (const st of templates.rows) {
      let d = nextDateForWeekday(from, st.day_of_week);
      const startTime = st.start_time.slice(0, 8);
      while (d <= to) {
        if (isDayInHolidayRanges(d, holidays.rows)) {
          d.setDate(d.getDate() + 7);
          continue;
        }
        const dateStr = dateOnlyYmd(d);

        const exists = await queryDb<{ id: string }>(
          `SELECT id FROM lessons
           WHERE group_id = $1
             AND scheduled_at = (($2::date + $3::time) AT TIME ZONE '${TZ}')
           LIMIT 1`,
          [groupId, dateStr, startTime],
        );
        if (!exists.rows[0]) {
          await queryDb(
            `INSERT INTO lessons (
              id, group_id, teacher_id, location_id, scheduled_at, duration_min, status, created_at, school_year_id, schedule_template_id
             ) VALUES (
              $1, $2, $3, $4,
              (($5::date + $6::time) AT TIME ZONE '${TZ}'),
              $7, 'SCHEDULED', NOW(), $8, $9
             )`,
            [
              randomUUID(),
              groupId,
              teacherId,
              st.location_id,
              dateStr,
              startTime,
              st.duration_min,
              yearId,
              st.id,
            ],
          );
          created += 1;
        }
        d.setDate(d.getDate() + 7);
      }
    }

    const message = buildGenerateMessage({ created, retroactive });

    return NextResponse.json({
      created,
      retroactive,
      message,
    });
  } catch (error) {
    console.error("POST lessons/generate error:", error);
    return NextResponse.json({ message: "Błąd generowania zajęć" }, { status: 500 });
  }
}
