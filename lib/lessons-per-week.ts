export type LessonsPerWeek = 1 | 2;

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

/** Skaluje kwotę ratalną/jednorazową wg częstotliwości. PER_LESSON nie skalować. */
export function scaleAmountByLessonsPerWeek(
  amount: number | null | undefined,
  lessonsPerWeek: LessonsPerWeek | number | null | undefined
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const mult = lessonsPerWeekMultiplier(lessonsPerWeek);
  return Math.round(amount * mult * 100) / 100;
}
