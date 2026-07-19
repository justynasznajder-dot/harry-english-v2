const SEASON_RE = /^\d{4}\/\d{4}$/;

/** Walidacja etykiety rundy, np. "2025/2026" (drugi rok = pierwszy + 1). */
export function validateRenewalSeason(season: string): boolean {
  const trimmed = season.trim();
  if (!SEASON_RE.test(trimmed)) return false;
  const [start, end] = trimmed.split("/").map((y) => Number(y));
  return Number.isFinite(start) && Number.isFinite(end) && end === start + 1;
}

/** Domyślna etykieta kolejnego roku szkolnego (np. w marcu 2026 → "2026/2027"). */
export function suggestRenewalSeason(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "numeric",
  })
    .formatToParts(now)
    .reduce(
      (acc, p) => {
        if (p.type === "year") acc.year = Number(p.value);
        if (p.type === "month") acc.month = Number(p.value);
        return acc;
      },
      { year: 0, month: 0 }
    );
  const startYear = parts.month >= 8 ? parts.year + 1 : parts.year;
  return `${startYear}/${startYear + 1}`;
}
