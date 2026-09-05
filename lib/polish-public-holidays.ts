/**
 * Ustawowe dni wolne od pracy w Polsce (święta państwowe).
 * Daty stałe + ruchome (Wielkanoc, Poniedziałek Wielkanocny, Boże Ciało).
 */

export type PolishPublicHoliday = {
  name: string;
  date: string; // YYYY-MM-DD
};

/** Algorytm Meeusa/Jonesa/Butchera — Niedziela Wielkanocna (kalendarz gregoriański). */
export function easterSundayYmd(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Wszystkie ustawowe święta w danym roku kalendarzowym. */
export function polishPublicHolidaysForYear(year: number): PolishPublicHoliday[] {
  const easter = easterSundayYmd(year);
  return [
    { name: "Nowy Rok", date: `${year}-01-01` },
    { name: "Święto Trzech Króli", date: `${year}-01-06` },
    { name: "Niedziela Wielkanocna", date: easter },
    { name: "Poniedziałek Wielkanocny", date: addDaysYmd(easter, 1) },
    { name: "Święto Pracy", date: `${year}-05-01` },
    { name: "Święto Narodowe Trzeciego Maja", date: `${year}-05-03` },
    { name: "Boże Ciało", date: addDaysYmd(easter, 60) },
    { name: "Wniebowzięcie Najświętszej Maryi Panny", date: `${year}-08-15` },
    { name: "Wszystkich Świętych", date: `${year}-11-01` },
    { name: "Narodowe Święto Niepodległości", date: `${year}-11-11` },
    { name: "Boże Narodzenie", date: `${year}-12-25` },
    { name: "Drugi dzień Bożego Narodzenia", date: `${year}-12-26` },
  ];
}

/**
 * Święta państwowe przecinające zakres [dateFrom, dateTo] (włącznie).
 * Zakres może obejmować kilka lat kalendarzowych (rok szkolny).
 */
export function listPolishPublicHolidays(
  dateFrom: string,
  dateTo: string,
): PolishPublicHoliday[] {
  const fromY = Number(dateFrom.slice(0, 4));
  const toY = Number(dateTo.slice(0, 4));
  if (!Number.isFinite(fromY) || !Number.isFinite(toY) || fromY > toY) return [];

  const out: PolishPublicHoliday[] = [];
  for (let y = fromY; y <= toY; y += 1) {
    for (const h of polishPublicHolidaysForYear(y)) {
      if (h.date >= dateFrom && h.date <= dateTo) out.push(h);
    }
  }
  return out;
}
