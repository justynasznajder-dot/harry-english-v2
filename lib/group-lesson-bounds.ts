import { getActiveSchoolYear, queryDb } from "@/lib/db";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GroupLessonBoundsRow = {
  lessons_start_on: string | null;
  lessons_end_on: string | null;
};

export type EffectiveLessonRange = {
  yearId: string;
  yearFrom: string;
  yearTo: string;
  lessonsStartOn: string | null;
  lessonsEndOn: string | null;
  /** max(yearFrom, lessonsStartOn ?? yearFrom) */
  effectiveFrom: string;
  /** min(yearTo, lessonsEndOn ?? yearTo) */
  effectiveTo: string;
};

export function ymdSlice(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.slice(0, 10);
    return YMD_RE.test(s) ? s : null;
  }
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** „14 września 2026” */
export function formatPolishLongDate(ymd: string): string {
  const s = String(ymd).slice(0, 10);
  const parsed = new Date(`${s}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return s;
  return parsed.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function clampLessonRangeToBounds(opts: {
  dateFrom: string;
  dateTo: string;
  yearFrom: string;
  yearTo: string;
  lessonsStartOn?: string | null;
  lessonsEndOn?: string | null;
}): { dateFrom: string; dateTo: string } {
  const gFrom = ymdSlice(opts.lessonsStartOn) ?? opts.yearFrom;
  const gTo = ymdSlice(opts.lessonsEndOn) ?? opts.yearTo;
  const effectiveFrom = opts.dateFrom > gFrom ? opts.dateFrom : gFrom;
  const effectiveTo = opts.dateTo < gTo ? opts.dateTo : gTo;
  return { dateFrom: effectiveFrom, dateTo: effectiveTo };
}

export async function fetchGroupLessonBounds(
  groupId: string,
  schoolYearId: string,
): Promise<GroupLessonBoundsRow | null> {
  const res = await queryDb<{
    lessons_start_on: string | Date | null;
    lessons_end_on: string | Date | null;
  }>(
    `SELECT lessons_start_on::text AS lessons_start_on,
            lessons_end_on::text AS lessons_end_on
     FROM group_school_year_bounds
     WHERE group_id = $1 AND school_year_id = $2
     LIMIT 1`,
    [groupId, schoolYearId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    lessons_start_on: ymdSlice(row.lessons_start_on),
    lessons_end_on: ymdSlice(row.lessons_end_on),
  };
}

export async function resolveEffectiveLessonRange(opts: {
  schoolId: string;
  groupId: string;
  schoolYearId?: string | null;
}): Promise<EffectiveLessonRange | null> {
  let yearId = opts.schoolYearId ?? null;
  let yearFrom: string | null = null;
  let yearTo: string | null = null;

  if (yearId) {
    const yr = await queryDb<{
      id: string;
      date_from: string | Date;
      date_to: string | Date;
    }>(
      `SELECT id, date_from, date_to FROM school_years
       WHERE id = $1 AND school_id = $2
       LIMIT 1`,
      [yearId, opts.schoolId],
    );
    const row = yr.rows[0];
    if (!row) return null;
    yearId = row.id;
    yearFrom = ymdSlice(row.date_from);
    yearTo = ymdSlice(row.date_to);
  } else {
    const active = await getActiveSchoolYear(opts.schoolId);
    if (!active) return null;
    yearId = String((active as { id: string }).id);
    yearFrom = ymdSlice((active as { date_from: string | Date }).date_from);
    yearTo = ymdSlice((active as { date_to: string | Date }).date_to);
  }

  if (!yearId || !yearFrom || !yearTo) return null;

  const bounds = await fetchGroupLessonBounds(opts.groupId, yearId);
  const lessonsStartOn = bounds?.lessons_start_on ?? null;
  const lessonsEndOn = bounds?.lessons_end_on ?? null;
  const clamped = clampLessonRangeToBounds({
    dateFrom: yearFrom,
    dateTo: yearTo,
    yearFrom,
    yearTo,
    lessonsStartOn,
    lessonsEndOn,
  });

  return {
    yearId,
    yearFrom,
    yearTo,
    lessonsStartOn,
    lessonsEndOn,
    effectiveFrom: clamped.dateFrom,
    effectiveTo: clamped.dateTo,
  };
}

/**
 * Zapis granic dla aktywnego roku. Puste / null czyści daną stronę.
 * Wiersz usuwany, gdy obie daty są null.
 */
export async function upsertGroupLessonBounds(opts: {
  schoolId: string;
  groupId: string;
  schoolYearId: string;
  lessonsStartOn: string | null;
  lessonsEndOn: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const yearRes = await queryDb<{
    id: string;
    date_from: string | Date;
    date_to: string | Date;
  }>(
    `SELECT id, date_from, date_to FROM school_years
     WHERE id = $1 AND school_id = $2 AND active = TRUE
     LIMIT 1`,
    [opts.schoolYearId, opts.schoolId],
  );
  const year = yearRes.rows[0];
  if (!year) {
    return { ok: false, status: 400, message: "Brak aktywnego roku szkolnego" };
  }

  const groupRes = await queryDb<{ id: string }>(
    `SELECT id FROM groups
     WHERE id = $1 AND school_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [opts.groupId, opts.schoolId],
  );
  if (!groupRes.rows[0]) {
    return { ok: false, status: 404, message: "Nie znaleziono grupy" };
  }

  const yFrom = ymdSlice(year.date_from)!;
  const yTo = ymdSlice(year.date_to)!;
  const start = opts.lessonsStartOn ? ymdSlice(opts.lessonsStartOn) : null;
  const end = opts.lessonsEndOn ? ymdSlice(opts.lessonsEndOn) : null;

  if (opts.lessonsStartOn && !start) {
    return { ok: false, status: 400, message: "Nieprawidłowa data rozpoczęcia" };
  }
  if (opts.lessonsEndOn && !end) {
    return { ok: false, status: 400, message: "Nieprawidłowa data zakończenia" };
  }

  if (start && (start < yFrom || start > yTo)) {
    return {
      ok: false,
      status: 400,
      message: `Data rozpoczęcia musi mieścić się w roku szkolnym (${yFrom} – ${yTo})`,
    };
  }
  if (end && (end < yFrom || end > yTo)) {
    return {
      ok: false,
      status: 400,
      message: `Data zakończenia musi mieścić się w roku szkolnym (${yFrom} – ${yTo})`,
    };
  }

  const effectiveFrom = start ?? yFrom;
  const effectiveTo = end ?? yTo;
  if (effectiveFrom > effectiveTo) {
    return {
      ok: false,
      status: 400,
      message: "Data rozpoczęcia nie może być późniejsza niż data zakończenia",
    };
  }

  if (!start && !end) {
    await queryDb(
      `DELETE FROM group_school_year_bounds
       WHERE group_id = $1 AND school_year_id = $2`,
      [opts.groupId, opts.schoolYearId],
    );
    return { ok: true };
  }

  await queryDb(
    `INSERT INTO group_school_year_bounds (
       group_id, school_year_id, school_id, lessons_start_on, lessons_end_on, created_at
     ) VALUES ($1, $2, $3, $4::date, $5::date, NOW())
     ON CONFLICT (group_id, school_year_id) DO UPDATE SET
       lessons_start_on = EXCLUDED.lessons_start_on,
       lessons_end_on = EXCLUDED.lessons_end_on`,
    [opts.groupId, opts.schoolYearId, opts.schoolId, start, end],
  );
  return { ok: true };
}
