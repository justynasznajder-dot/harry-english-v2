/** Pomocnicze operacje na datach YMD (tydzień pon–nd). */

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Poniedziałek tygodnia zawierającego podany YMD. */
export function mondayOfWeekContaining(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay(); // 0=nd
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return toYmd(d);
}
