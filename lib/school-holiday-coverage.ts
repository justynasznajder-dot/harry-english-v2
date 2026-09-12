/**
 * Porównanie zakresu dnia wolnego (daty × grupy) — do preview i edycji.
 */

export type HolidayCoverageInput = {
  dateFrom: string;
  dateTo: string;
  /** null / puste przy „wszyscy” */
  groupIds: string[] | null;
  appliesToPreschool: boolean;
  appliesToSchool: boolean;
};

export function holidayCoversAllGroups(input: {
  appliesToPreschool: boolean;
  appliesToSchool: boolean;
  groupIds?: string[] | null;
}): boolean {
  if (input.appliesToPreschool && input.appliesToSchool) return true;
  const ids = input.groupIds ?? [];
  if (!input.appliesToPreschool && !input.appliesToSchool && ids.length === 0) return true;
  return false;
}

/** Efektywna lista grup: `null` = wszystkie grupy szkoły. */
export function effectiveHolidayGroupIds(input: {
  appliesToPreschool: boolean;
  appliesToSchool: boolean;
  groupIds?: string[] | null;
}): string[] | null {
  if (holidayCoversAllGroups(input)) return null;
  const ids = [...new Set((input.groupIds ?? []).filter(Boolean))];
  return ids.length > 0 ? ids : null;
}

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysYmd(ymd: string, days: number): string {
  const ms = parseYmd(ymd) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Części przedziału A, które nie leżą w B (oba domknięte). */
export function subtractDateRange(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): Array<{ from: string; to: string }> {
  if (!aFrom || !aTo || aFrom > aTo) return [];
  if (!bFrom || !bTo || bFrom > bTo || bTo < aFrom || bFrom > aTo) {
    return [{ from: aFrom, to: aTo }];
  }
  const out: Array<{ from: string; to: string }> = [];
  if (aFrom < bFrom) {
    const leftTo = addDaysYmd(bFrom, -1);
    if (aFrom <= leftTo) out.push({ from: aFrom, to: leftTo });
  }
  if (aTo > bTo) {
    const rightFrom = addDaysYmd(bTo, 1);
    if (rightFrom <= aTo) out.push({ from: rightFrom, to: aTo });
  }
  return out;
}

function groupInScope(groupId: string, scope: string[] | null): boolean {
  if (scope === null) return true;
  return scope.includes(groupId);
}

/**
 * Czy po edycji grupa traci choć jeden dzień pokrycia (do monitu „uzupełnić”).
 */
export function groupLosesHolidayCoverage(
  groupId: string,
  oldCov: HolidayCoverageInput,
  nextCov: HolidayCoverageInput,
): boolean {
  const oldIds = effectiveHolidayGroupIds(oldCov);
  const nextIds = effectiveHolidayGroupIds(nextCov);
  if (!groupInScope(groupId, oldIds)) return false;
  if (!groupInScope(groupId, nextIds)) return true;
  return (
    subtractDateRange(oldCov.dateFrom, oldCov.dateTo, nextCov.dateFrom, nextCov.dateTo)
      .length > 0
  );
}

/**
 * Czy (groupId, ymd) jest nowo objęte dniem wolnym (do monitu usuwania zajęć).
 */
export function isNewlyCoveredHolidayDay(
  groupId: string,
  ymd: string,
  oldCov: HolidayCoverageInput,
  nextCov: HolidayCoverageInput,
): boolean {
  const nextIds = effectiveHolidayGroupIds(nextCov);
  if (!groupInScope(groupId, nextIds)) return false;
  if (ymd < nextCov.dateFrom || ymd > nextCov.dateTo) return false;

  const oldIds = effectiveHolidayGroupIds(oldCov);
  if (!groupInScope(groupId, oldIds)) return true;
  if (ymd >= oldCov.dateFrom && ymd <= oldCov.dateTo) return false;
  return true;
}

export function holidayCoverageChanged(
  oldCov: HolidayCoverageInput,
  nextCov: HolidayCoverageInput,
): boolean {
  if (oldCov.dateFrom !== nextCov.dateFrom || oldCov.dateTo !== nextCov.dateTo) return true;
  const a = effectiveHolidayGroupIds(oldCov);
  const b = effectiveHolidayGroupIds(nextCov);
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  if (a.length !== b.length) return true;
  const setB = new Set(b);
  return a.some((id) => !setB.has(id));
}
