import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { getUserById, isLektor, queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { ensurePolishPublicHolidaysForSchoolYear } from "@/lib/ensure-polish-public-holidays";
import { listPolishPublicHolidays } from "@/lib/polish-public-holidays";
import { sqlSchoolTimestampAsTimestamptz, toIsoUtc } from "@/lib/school-timezone";

async function ensureTeacherOwnsGroup(userId: string, groupId: string): Promise<boolean> {
  const res = await queryDb<{ id: string }>(
    `SELECT id FROM groups WHERE id = $1 AND teacher_id = $2 AND active = TRUE LIMIT 1`,
    [groupId, userId]
  );
  return Boolean(res.rows[0]);
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

  const groupId = request.nextUrl.searchParams.get("groupId")?.trim() ?? "";
  const fromYmd = request.nextUrl.searchParams.get("from")?.trim() ?? "";
  const toYmd = request.nextUrl.searchParams.get("to")?.trim() ?? "";

  // Tryb tygodniowy: wszystkie lekcje lektora w zakresie from–to
  if (!groupId && fromYmd && toYmd) {
    if (!isYmd(fromYmd) || !isYmd(toYmd)) {
      return NextResponse.json(
        { message: "Parametry from i to muszą być w formacie RRRR-MM-DD" },
        { status: 400 }
      );
    }
    if (fromYmd > toYmd) {
      return NextResponse.json(
        { message: "Data „from” nie może być późniejsza niż „to”" },
        { status: 400 }
      );
    }

    try {
      await completePastScheduledLessons();

      const teacher = await getUserById(userId);
      const teacherSchoolId = teacher?.school_id ?? null;
      if (teacherSchoolId) {
        try {
          await ensurePolishPublicHolidaysForSchoolYear({ schoolId: teacherSchoolId });
        } catch (seedErr) {
          console.error("ensurePolishPublicHolidays on teacher/lessons:", seedErr);
        }
      }

      const [res, holidaysRes] = await Promise.all([
        queryDb<{
          id: string;
          scheduled_at: Date | string;
          duration_min: number;
          status: string;
          group_id: string;
          group_name: string;
          location_name: string | null;
        }>(
          `SELECT l.id,
                ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
                l.duration_min,
                l.status::text AS status,
                g.id AS group_id,
                g.name AS group_name,
                loc.name AS location_name
         FROM lessons l
         JOIN groups g ON g.id = l.group_id
         LEFT JOIN locations loc ON loc.id = l.location_id
         WHERE g.teacher_id = $1
           AND g.active = TRUE
           AND l.scheduled_at >= $2::date
           AND l.scheduled_at < ($3::date + interval '1 day')
           AND l.status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
         ORDER BY l.scheduled_at ASC, g.name ASC`,
          [userId, fromYmd, toYmd],
        ),
        teacherSchoolId
          ? queryDb<{
              id: string;
              name: string;
              date_from: string;
              date_to: string;
              type: string;
            }>(
              `SELECT h.id, h.name, h.date_from::text AS date_from, h.date_to::text AS date_to, h.type
               FROM school_holidays h
               INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.active = TRUE
               WHERE h.school_id = $1
                 AND h.date_to >= $2::date
                 AND h.date_from <= $3::date
                 AND (
                   h.school_year_id IS NULL
                   OR h.school_year_id = sy.id
                 )
               ORDER BY h.date_from ASC`,
              [teacherSchoolId, fromYmd, toYmd],
            )
          : Promise.resolve({ rows: [] as Array<{
              id: string;
              name: string;
              date_from: string;
              date_to: string;
              type: string;
            }> }),
      ]);

      const holidays = holidaysRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        dateFrom: String(row.date_from).slice(0, 10),
        dateTo: String(row.date_to).slice(0, 10),
        type: row.type,
      }));

      const coveredDates = new Set<string>();
      for (const h of holidays) {
        let ymd = h.dateFrom;
        while (ymd <= h.dateTo) {
          coveredDates.add(ymd);
          const [y, m, d] = ymd.split("-").map(Number);
          const next = new Date(Date.UTC(y, m - 1, d + 1));
          ymd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
        }
      }
      for (const h of listPolishPublicHolidays(fromYmd, toYmd)) {
        if (coveredDates.has(h.date)) continue;
        holidays.push({
          id: `pl-public-${h.date}`,
          name: h.name,
          dateFrom: h.date,
          dateTo: h.date,
          type: "PUBLIC",
        });
      }
      holidays.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

      return NextResponse.json({
        from: fromYmd,
        to: toYmd,
        lessons: res.rows.map((row) => ({
          id: row.id,
          scheduledAt: toIsoUtc(row.scheduled_at),
          durationMin: row.duration_min,
          status: row.status,
          groupId: row.group_id,
          groupName: row.group_name,
          locationName: row.location_name,
        })),
        holidays,
      });
    } catch (error) {
      console.error("GET /api/teacher/lessons (week):", error);
      return NextResponse.json({ message: "Błąd pobierania lekcji" }, { status: 500 });
    }
  }

  if (!groupId) {
    return NextResponse.json(
      { message: "Podaj groupId albo zakres from/to" },
      { status: 400 }
    );
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
