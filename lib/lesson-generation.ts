import { randomUUID } from "crypto";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { SCHOOL_TIMEZONE, sqlSchoolWallTimestamp } from "@/lib/school-timezone";

const TZ = SCHOOL_TIMEZONE;

/**
 * SQL EXISTS: grupa ma przyszły termin z potwierdzonego harmonogramu aktywnego roku
 * (z pominięciem dni wolnych), dla którego nie ma jeszcze wpisu w `lessons`.
 * `groupIdSql` / `schoolIdSql` — wyrażenia SQL, np. `g.id`, `g.school_id`.
 */
export function sqlExistsUnfilledFutureScheduleSlot(
  groupIdSql: string,
  schoolIdSql: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM school_years sy_gap
    JOIN schedule_templates st_gap
      ON st_gap.group_id = ${groupIdSql}
     AND st_gap.active = TRUE
     AND st_gap.school_year_id = sy_gap.id
    CROSS JOIN LATERAL generate_series(
      GREATEST(sy_gap.date_from, (NOW() AT TIME ZONE '${TZ}')::date),
      sy_gap.date_to,
      interval '1 day'
    ) AS d_gap(day)
    WHERE sy_gap.school_id = ${schoolIdSql}
      AND sy_gap.active = TRUE
      AND st_gap.day_of_week = EXTRACT(ISODOW FROM d_gap.day)::int
      AND ((d_gap.day::date + st_gap.start_time) AT TIME ZONE '${TZ}') > NOW()
      AND NOT EXISTS (
        SELECT 1 FROM school_holidays h_gap
        WHERE h_gap.school_id = ${schoolIdSql}
          AND (h_gap.school_year_id = sy_gap.id OR h_gap.school_year_id IS NULL)
          AND h_gap.date_from <= d_gap.day::date
          AND h_gap.date_to >= d_gap.day::date
      )
      AND NOT EXISTS (
        SELECT 1 FROM lessons l_gap
        WHERE l_gap.group_id = ${groupIdSql}
          AND l_gap.scheduled_at = (d_gap.day::date + st_gap.start_time)
      )
  )`;
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

export function buildGenerateLessonsMessage(opts: {
  created: number;
  retroactive: boolean;
}): string {
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

export type GenerateLessonsForGroupResult = {
  created: number;
  retroactive: boolean;
  message: string;
};

export type GenerateLessonsSkipReason =
  | "NO_TEACHER"
  | "NO_ACTIVE_YEAR"
  | "NO_TEMPLATES"
  | "RANGE_OUTSIDE_YEAR"
  | "EMPTY_RANGE";

export type GenerateLessonsOutcome =
  | ({ ok: true } & GenerateLessonsForGroupResult)
  | { ok: false; reason: GenerateLessonsSkipReason; message: string };

/**
 * Tworzy brakujące zajęcia z aktywnych szablonów harmonogramu w podanym zakresie.
 * Idempotentne: pomija terminy, które już istnieją (ten sam group_id + scheduled_at).
 */
export async function generateLessonsForGroup(opts: {
  schoolId: string;
  groupId: string;
  teacherId: string;
  dateFrom: string;
  dateTo: string;
  /** Tylko szablony już przypięte do tego roku (cron / auto po potwierdzeniu). */
  onlyConfirmedForSchoolYearId?: string;
}): Promise<GenerateLessonsOutcome> {
  const { schoolId, groupId, teacherId, dateFrom, dateTo } = opts;

  const activeYear = await getActiveSchoolYear(schoolId);
  if (!activeYear) {
    return { ok: false, reason: "NO_ACTIVE_YEAR", message: "Brak aktywnego roku szkolnego" };
  }

  const yFrom = ymdFromDb((activeYear as { date_from: string | Date }).date_from);
  const yTo = ymdFromDb((activeYear as { date_to: string | Date }).date_to);
  const yearId = String((activeYear as { id: string }).id);

  if (dateFrom < yFrom || dateTo > yTo) {
    return {
      ok: false,
      reason: "RANGE_OUTSIDE_YEAR",
      message: `Daty poza zakresem aktywnego roku szkolnego (${yFrom} - ${yTo})`,
    };
  }

  if (dateFrom > dateTo) {
    return { ok: false, reason: "EMPTY_RANGE", message: "Nieprawidłowy zakres dat" };
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
    opts.onlyConfirmedForSchoolYearId
      ? `SELECT id, day_of_week, start_time::text, duration_min, location_id
         FROM schedule_templates
         WHERE group_id = $1 AND active = TRUE AND school_year_id = $2`
      : `SELECT id, day_of_week, start_time::text, duration_min, location_id
         FROM schedule_templates
         WHERE group_id = $1 AND active = TRUE`,
    opts.onlyConfirmedForSchoolYearId
      ? [groupId, opts.onlyConfirmedForSchoolYearId]
      : [groupId],
  );

  if (templates.rows.length === 0) {
    return {
      ok: false,
      reason: "NO_TEMPLATES",
      message: opts.onlyConfirmedForSchoolYearId
        ? "Brak potwierdzonego harmonogramu na aktywny rok szkolny"
        : "Brak aktywnych terminów w harmonogramie",
    };
  }

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

      const wallTs = sqlSchoolWallTimestamp(2, 3);
      const exists = await queryDb<{ id: string }>(
        `SELECT id FROM lessons
         WHERE group_id = $1
           AND scheduled_at = ${wallTs}
         LIMIT 1`,
        [groupId, dateStr, startTime],
      );
      if (!exists.rows[0]) {
        await queryDb(
          `INSERT INTO lessons (
            school_id, id, group_id, teacher_id, location_id, scheduled_at, duration_min, status, created_at, school_year_id, schedule_template_id
           ) VALUES (
            $1, $2, $3, $4, $5,
            ${sqlSchoolWallTimestamp(6, 7)},
            $8, 'SCHEDULED', NOW(), $9, $10
           )`,
          [
            schoolId,
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

  const message = buildGenerateLessonsMessage({ created, retroactive });
  return { ok: true, created, retroactive, message };
}

/**
 * Dopełnia zajęcia od dziś (lub początku roku, jeśli później) do końca aktywnego roku.
 * Tylko z harmonogramu potwierdzonego na aktywny rok — bez generowania wstecznego.
 * Używane przez cron i po potwierdzeniu/zapisie terminu.
 */
export async function ensureLessonsThroughActiveSchoolYear(opts: {
  schoolId: string;
  groupId: string;
  teacherId: string | null;
}): Promise<GenerateLessonsOutcome> {
  const { schoolId, groupId, teacherId } = opts;
  if (!teacherId) {
    return {
      ok: false,
      reason: "NO_TEACHER",
      message: "Grupa nie ma przypisanego nauczyciela",
    };
  }

  const activeYear = await getActiveSchoolYear(schoolId);
  if (!activeYear) {
    return { ok: false, reason: "NO_ACTIVE_YEAR", message: "Brak aktywnego roku szkolnego" };
  }

  const yearId = String((activeYear as { id: string }).id);
  const yFrom = ymdFromDb((activeYear as { date_from: string | Date }).date_from);
  const yTo = ymdFromDb((activeYear as { date_to: string | Date }).date_to);

  const todayRes = await queryDb<{ today: string }>(
    `SELECT (NOW() AT TIME ZONE '${TZ}')::date::text AS today`,
  );
  const todayYmd = todayRes.rows[0]?.today ?? dateOnlyYmd(new Date());
  const dateFrom = todayYmd > yFrom ? todayYmd : yFrom;

  if (dateFrom > yTo) {
    return {
      ok: true,
      created: 0,
      retroactive: false,
      message: "Aktywny rok szkolny już się zakończył — brak zajęć do wygenerowania.",
    };
  }

  return generateLessonsForGroup({
    schoolId,
    groupId,
    teacherId,
    dateFrom,
    dateTo: yTo,
    onlyConfirmedForSchoolYearId: yearId,
  });
}

/**
 * Przypina aktywne terminy grupy do aktywnego roku (= potwierdzenie) i generuje zajęcia.
 * Manager powinien wcześniej uzupełnić dni wolne.
 */
export async function confirmScheduleAndGenerateLessons(opts: {
  schoolId: string;
  groupId: string;
  teacherId: string | null;
}): Promise<GenerateLessonsOutcome & { templatesConfirmed?: number }> {
  const { schoolId, groupId, teacherId } = opts;
  const activeYear = await getActiveSchoolYear(schoolId);
  if (!activeYear) {
    return { ok: false, reason: "NO_ACTIVE_YEAR", message: "Brak aktywnego roku szkolnego" };
  }
  if (!teacherId) {
    return { ok: false, reason: "NO_TEACHER", message: "Grupa nie ma przypisanego nauczyciela" };
  }

  const yearId = String((activeYear as { id: string }).id);
  const updated = await queryDb<{ id: string }>(
    `UPDATE schedule_templates
     SET school_year_id = $2
     WHERE group_id = $1
       AND active = TRUE
       AND school_id = $3
     RETURNING id`,
    [groupId, yearId, schoolId],
  );

  if (updated.rows.length === 0) {
    return { ok: false, reason: "NO_TEMPLATES", message: "Brak aktywnych terminów w harmonogramie" };
  }

  const result = await ensureLessonsThroughActiveSchoolYear({
    schoolId,
    groupId,
    teacherId,
  });
  if (!result.ok) return result;
  return { ...result, templatesConfirmed: updated.rows.length };
}

export type LessonBackfillBatchResult = {
  schoolsProcessed: number;
  groupsProcessed: number;
  created: number;
  skipped: number;
  errors: Array<{ schoolId: string; groupId: string; message: string }>;
};

/**
 * Cron: dopełnia brakujące zajęcia TYLKO dla grup z harmonogramem potwierdzonym
 * na aktywny rok szkolny. Nie rusza grup w trakcie konfiguracji nowego roku.
 */
export async function backfillMissingLessonsForAllSchools(): Promise<LessonBackfillBatchResult> {
  const groupsRes = await queryDb<{
    id: string;
    school_id: string;
    teacher_id: string | null;
  }>(
    `SELECT DISTINCT g.id, g.school_id, g.teacher_id
     FROM groups g
     JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
     JOIN schools s ON s.id = g.school_id AND s.active = TRUE
     JOIN school_years sy ON sy.id = st.school_year_id
       AND sy.school_id = g.school_id
       AND sy.active = TRUE
     WHERE g.active = TRUE
       AND g.teacher_id IS NOT NULL
     ORDER BY g.school_id, g.id`,
  );

  let created = 0;
  let skipped = 0;
  const errors: LessonBackfillBatchResult["errors"] = [];
  const schools = new Set<string>();

  for (const group of groupsRes.rows) {
    schools.add(group.school_id);
    try {
      const result = await ensureLessonsThroughActiveSchoolYear({
        schoolId: group.school_id,
        groupId: group.id,
        teacherId: group.teacher_id,
      });
      if (!result.ok) {
        skipped += 1;
        if (result.reason !== "NO_TEMPLATES" && result.reason !== "NO_ACTIVE_YEAR") {
          errors.push({
            schoolId: group.school_id,
            groupId: group.id,
            message: result.message,
          });
        }
        continue;
      }
      created += result.created;
      if (result.created === 0) skipped += 1;
    } catch (error) {
      errors.push({
        schoolId: group.school_id,
        groupId: group.id,
        message: error instanceof Error ? error.message : "Błąd generowania",
      });
    }
  }

  return {
    schoolsProcessed: schools.size,
    groupsProcessed: groupsRes.rows.length,
    created,
    skipped,
    errors,
  };
}
