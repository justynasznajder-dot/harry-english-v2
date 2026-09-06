export type LessonsPerWeek = 1 | 2;

/** Bazowa liczba zajęć w roku przy 1× w tygodniu. */
export const BASE_TARGET_LESSONS_PER_YEAR = 33;

export function normalizeLessonsPerWeek(raw: unknown): LessonsPerWeek | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (n === 1 || n === 2) return n;
  return null;
}

export function lessonsPerWeekLabel(value: LessonsPerWeek): string {
  return value === 1 ? "1× w tygodniu" : "2× w tygodniu";
}

/** Mnożnik cennika: 2× w tygodniu = ×2 względem stawki bazowej (1×). */
export function lessonsPerWeekMultiplier(
  lessonsPerWeek: LessonsPerWeek | number | null | undefined
): LessonsPerWeek {
  return normalizeLessonsPerWeek(lessonsPerWeek) ?? 1;
}

/** Docelowa liczba zajęć grupy w roku: 33 × częstotliwość tygodniowa. */
export function defaultTargetLessonsPerYear(
  lessonsPerWeek: LessonsPerWeek | number | null | undefined
): number {
  return BASE_TARGET_LESSONS_PER_YEAR * lessonsPerWeekMultiplier(lessonsPerWeek);
}

/** Skaluje kwotę ratalną/jednorazową wg częstotliwości. PER_LESSON nie skalować. */
export function scaleAmountByLessonsPerWeek(
  amount: number | null | undefined,
  lessonsPerWeek: LessonsPerWeek | number | null | undefined
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const mult = lessonsPerWeekMultiplier(lessonsPerWeek);
  return Math.round(amount * mult * 100) / 100;
}

/**
 * SQL: czy członek grupy (`gs`) powinien być na liście obecności lekcji (`l`).
 * Wymaga aliasów `gs` (group_students), `g` (groups), `l` (lessons).
 * Dziecko 1× w grupie 2× tylko na terminie z `once_weekly_day`.
 */
export function sqlStudentAttendsLesson(
  gsAlias = "gs",
  gAlias = "g",
  lAlias = "l"
): string {
  return `(
    COALESCE(${gAlias}.lessons_per_week, 1) <= 1
    OR COALESCE(${gsAlias}.lessons_per_week, 2) >= 2
    OR ${lAlias}.schedule_template_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM schedule_templates st_ow
      WHERE st_ow.id = ${lAlias}.schedule_template_id
        AND st_ow.once_weekly_day = TRUE
    )
  )`;
}

/**
 * SQL: czy wiersz `schedule_templates` (alias `st`) ma być pokazany rodzicowi / w umowie
 * dla frekwencji dziecka. `studentLpwExpr` — np. `gs.lessons_per_week` lub `er.lessons_per_week`.
 * Wymaga aliasu `g` (groups).
 */
export function sqlScheduleTemplateVisibleForStudent(
  studentLpwExpr: string,
  gAlias = "g",
  stAlias = "st"
): string {
  return `(
    COALESCE(${gAlias}.lessons_per_week, 1) <= 1
    OR COALESCE((${studentLpwExpr}), 2) >= 2
    OR ${stAlias}.once_weekly_day = TRUE
  )`;
}

/**
 * Dla dziecka 1× w grupie 2× zostawia tylko termin oznaczony jako dzień 1×.
 * Gdy grupa jest 1× — wszystkie terminy (zwykle jeden).
 * Gdy dziecko 2× (lub brak oznaczenia) — wszystkie terminy.
 */
export function filterScheduleForStudentAttendance<
  T extends { once_weekly_day?: boolean | null },
>(
  rows: T[],
  opts: {
    groupLessonsPerWeek?: number | null;
    studentLessonsPerWeek?: number | null;
  }
): T[] {
  const groupLpw = normalizeLessonsPerWeek(opts.groupLessonsPerWeek) ?? 1;
  if (groupLpw <= 1) return rows;
  const studentLpw = normalizeLessonsPerWeek(opts.studentLessonsPerWeek) ?? 2;
  if (studentLpw >= 2) return rows;
  return rows.filter((r) => r.once_weekly_day === true);
}

