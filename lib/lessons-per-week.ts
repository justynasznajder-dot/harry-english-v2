export type LessonsPerWeek = 1 | 2;

export function normalizeLessonsPerWeek(raw: unknown): LessonsPerWeek | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (n === 1 || n === 2) return n;
  return null;
}

export function lessonsPerWeekLabel(value: LessonsPerWeek): string {
  return value === 1 ? "1× w tygodniu" : "2× w tygodniu";
}
