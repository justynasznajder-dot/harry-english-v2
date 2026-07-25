/**
 * Strefa czasowa miejsca działania szkoły (Ruda Śląska / Polska).
 * Lekcje w DB trzymamy jako `timestamp without time zone` = ścienna godzina szkolna.
 *
 * Daty kalendarzowe (DATE / YYYY-MM-DD) ZAWSZE wyprowadzaj przez helpery z tego pliku —
 * nigdy przez `toISOString().slice(0,10)` (w Europe/Warsaw północ lokalna = poprzedni dzień UTC).
 */
export const SCHOOL_TIMEZONE = "Europe/Warsaw";

/** SQL: interpretuj kolumnę `timestamp` (czas szkolny) jako timestamptz. */
export function sqlSchoolTimestampAsTimestamptz(columnSql: string): string {
  return `(${columnSql} AT TIME ZONE '${SCHOOL_TIMEZONE}')`;
}

/** SQL: początek dnia YMD w strefie szkoły (timestamptz). */
export function sqlSchoolDayStart(paramIndex: number): string {
  return `($${paramIndex}::date AT TIME ZONE '${SCHOOL_TIMEZONE}')`;
}

/** SQL: początek dnia następnego po YMD (timestamptz, exclusive end). */
export function sqlSchoolDayEndExclusive(paramIndex: number): string {
  return `(($${paramIndex}::date + interval '1 day') AT TIME ZONE '${SCHOOL_TIMEZONE}')`;
}

/** SQL: data+godzina szkolna → wartość do kolumny `timestamp` (czas ścienny szkoły). */
export function sqlSchoolWallTimestamp(dateParam: number, timeParam: number): string {
  return `($${dateParam}::date + $${timeParam}::time)`;
}

export function toIsoUtc(value: Date | string | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const d = new Date(String(value));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return String(value);
}

export function formatInSchoolTz(
  iso: string,
  options: Intl.DateTimeFormatOptions
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", { timeZone: SCHOOL_TIMEZONE, ...options });
}

export function formatSchoolDateTime(iso: string): string {
  return formatInSchoolTz(iso, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSchoolDateTimeMedium(iso: string): string {
  return formatInSchoolTz(iso, { dateStyle: "medium", timeStyle: "short" });
}

export function formatSchoolTime(iso: string): string {
  return formatInSchoolTz(iso, { hour: "2-digit", minute: "2-digit" });
}

export function formatSchoolDateShort(iso: string): string {
  return formatInSchoolTz(iso, { dateStyle: "short", timeStyle: "short" });
}

export type WarsawYmdParts = { year: number; month: number; day: number };

/** Składowe dnia kalendarzowego w Europe/Warsaw. */
export function warsawYmdParts(date: Date = new Date()): WarsawYmdParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return {
    year: Number.isFinite(year) ? year : date.getUTCFullYear(),
    month: Number.isFinite(month) ? month : date.getUTCMonth() + 1,
    day: Number.isFinite(day) ? day : date.getUTCDate(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YMD dnia lekcji / chwili w strefie szkoły (nie UTC z ISO). */
export function schoolYmd(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) {
    return typeof iso === "string" ? iso.slice(0, 10) : "";
  }
  const { year, month, day } = warsawYmdParts(d);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function todayYmdSchool(): string {
  const { year, month, day } = warsawYmdParts();
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Kolumna PostgreSQL `DATE` / dzień kalendarzowy → `YYYY-MM-DD`.
 * Nie używaj `toISOString().slice(0,10)` — w Europe/Warsaw północ lokalna
 * staje się poprzednim dniem UTC (np. 2026-07-01 → 2026-06-30).
 */
export function pgDateToYmd(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return schoolYmd(value);
  }
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Miesiąc rozliczeniowy `YYYY-MM` w Europe/Warsaw. */
export function periodMonthKey(date: Date | string = new Date()): string {
  if (typeof date === "string") {
    const key = date.trim().slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(key)) return key;
    const ymd = pgDateToYmd(date);
    if (ymd) return ymd.slice(0, 7);
  }
  const { year, month } = warsawYmdParts(date as Date);
  return `${year}-${pad2(month)}`;
}

/** Pierwszy dzień miesiąca rozliczeniowego jako `YYYY-MM-01`. */
export function periodMonthStartYmd(date: Date | string = new Date()): string {
  return `${periodMonthKey(date)}-01`;
}

/**
 * Ostatni dzień miesiąca jako `YYYY-MM-DD`.
 * Wejście: Date, `YYYY-MM`, `YYYY-MM-DD` lub pg DATE.
 */
export function lastDayOfMonthYmd(periodOrDate: Date | string): string {
  const start = periodMonthStartYmd(periodOrDate);
  const [y, m] = start.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Dodaj dni do daty kalendarzowej (arytmetyka po YMD, bez dryfu strefy). */
export function addDaysYmd(ymd: string, days: number): string {
  const base = pgDateToYmd(ymd) ?? todayYmdSchool();
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Dodaj miesiące do daty kalendarzowej (zachowuje dzień, przycina do końca miesiąca). */
export function addMonthsYmd(ymd: string, months: number): string {
  const base = pgDateToYmd(ymd) ?? todayYmdSchool();
  const [y, m, d] = base.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const dt = new Date(Date.UTC(y, targetMonthIndex, day));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Date UTC o północy pierwszego dnia miesiąca szkolnego (do porównań / legacy API).
 * Preferuj stringi YMD przy zapisie do DB.
 */
export function firstDayOfMonthUtcDate(date: Date | string = new Date()): Date {
  const start = periodMonthStartYmd(date);
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
