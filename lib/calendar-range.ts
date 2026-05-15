/** Zakres widoczny w kalendarzu → inclusive YYYY-MM-DD w strefie szkoły (np. wyświetlanie nagłówków). */
export function visibleRangeToInclusiveYmd(
  start: Date,
  endExclusive: Date,
  timeZone: string,
): { fromYmd: string; toYmd: string } {
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const fromYmd = ymd(start);
  const lastInstant = new Date(endExclusive.getTime() - 1);
  const toYmd = ymd(lastInstant);
  return { fromYmd, toYmd };
}
