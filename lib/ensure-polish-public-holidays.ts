import { randomUUID } from "crypto";
import { queryDb } from "@/lib/db";
import { listPolishPublicHolidays } from "@/lib/polish-public-holidays";

export type EnsurePolishPublicHolidaysResult = {
  inserted: number;
  lessonsCancelled: number;
  holidays: Array<{ name: string; date: string }>;
};

async function cancelScheduledLessonsInHolidayRange(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const cancelled = await queryDb<{ id: string }>(
    `UPDATE lessons l
     SET status = 'CANCELLED',
         cancellation_reason = COALESCE(NULLIF(TRIM(l.cancellation_reason), ''), 'Dzień wolny')
     FROM groups g
     WHERE l.group_id = g.id
       AND g.school_id = $1
       AND l.status = 'SCHEDULED'
       AND l.scheduled_at::date >= $2::date
       AND l.scheduled_at::date <= $3::date
     RETURNING l.id`,
    [schoolId, dateFrom, dateTo],
  );
  return cancelled.rowCount ?? 0;
}

/**
 * Idempotentnie dopina ustawowe święta PL do `school_holidays` (type=PUBLIC)
 * w zakresie roku szkolnego i anuluje zaplanowane zajęcia w tych dniach.
 *
 * `forceCancelScheduled` — anuluj też na już istniejących świętach PUBLIC
 * (używane przy generowaniu zajęć / ręcznym uzupełnieniu).
 */
export async function ensurePolishPublicHolidays(opts: {
  schoolId: string;
  schoolYearId: string;
  dateFrom: string;
  dateTo: string;
  forceCancelScheduled?: boolean;
}): Promise<EnsurePolishPublicHolidaysResult> {
  const { schoolId, schoolYearId, dateFrom, dateTo, forceCancelScheduled } = opts;
  const candidates = listPolishPublicHolidays(dateFrom, dateTo);
  if (candidates.length === 0) {
    return { inserted: 0, lessonsCancelled: 0, holidays: [] };
  }

  const existing = await queryDb<{ date_from: string; name: string }>(
    `SELECT date_from::text AS date_from, name
     FROM school_holidays
     WHERE school_id = $1
       AND type = 'PUBLIC'
       AND date_from = date_to
       AND date_from >= $2::date
       AND date_from <= $3::date
       AND (school_year_id = $4 OR school_year_id IS NULL)`,
    [schoolId, dateFrom, dateTo, schoolYearId],
  );

  const existingDates = new Set(
    existing.rows.map((r) => String(r.date_from).slice(0, 10)),
  );

  const toInsert = candidates.filter((h) => !existingDates.has(h.date));
  let inserted = 0;
  let lessonsCancelled = 0;
  const holidays: Array<{ name: string; date: string }> = [];

  for (const h of toInsert) {
    await queryDb(
      `INSERT INTO school_holidays (id, school_id, school_year_id, name, date_from, date_to, type, created_at)
       VALUES ($1, $2, $3, $4, $5::date, $5::date, 'PUBLIC', NOW())`,
      [randomUUID(), schoolId, schoolYearId, h.name, h.date],
    );
    inserted += 1;
    holidays.push({ name: h.name, date: h.date });
  }

  const datesToCancel = forceCancelScheduled
    ? candidates.map((h) => h.date)
    : toInsert.map((h) => h.date);

  for (const date of datesToCancel) {
    lessonsCancelled += await cancelScheduledLessonsInHolidayRange(
      schoolId,
      date,
      date,
    );
  }

  return { inserted, lessonsCancelled, holidays };
}

/**
 * Dla aktywnego (lub podanego) roku szkolnego szkoły — seed świąt państwowych.
 * Bezpieczne do wywoływania przed generowaniem zajęć / przy otwarciu kalendarza.
 */
export async function ensurePolishPublicHolidaysForSchoolYear(opts: {
  schoolId: string;
  schoolYearId?: string;
  forceCancelScheduled?: boolean;
}): Promise<EnsurePolishPublicHolidaysResult | null> {
  const { schoolId, forceCancelScheduled } = opts;

  const yearRes = opts.schoolYearId
    ? await queryDb<{ id: string; date_from: string; date_to: string }>(
        `SELECT id, date_from::text AS date_from, date_to::text AS date_to
         FROM school_years
         WHERE id = $1 AND school_id = $2
         LIMIT 1`,
        [opts.schoolYearId, schoolId],
      )
    : await queryDb<{ id: string; date_from: string; date_to: string }>(
        `SELECT id, date_from::text AS date_from, date_to::text AS date_to
         FROM school_years
         WHERE school_id = $1 AND active = TRUE
         LIMIT 1`,
        [schoolId],
      );

  const year = yearRes.rows[0];
  if (!year) return null;

  return ensurePolishPublicHolidays({
    schoolId,
    schoolYearId: year.id,
    dateFrom: String(year.date_from).slice(0, 10),
    dateTo: String(year.date_to).slice(0, 10),
    forceCancelScheduled,
  });
}
