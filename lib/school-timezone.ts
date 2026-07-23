/**
 * Strefa czasowa miejsca działania szkoły (Ruda Śląska / Polska).
 * Lekcje w DB trzymamy jako `timestamp without time zone` = ścienna godzina szkolna.
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

/** YMD dnia lekcji w strefie szkoły (nie UTC z ISO). */
export function schoolYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: SCHOOL_TIMEZONE });
}

export function todayYmdSchool(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: SCHOOL_TIMEZONE });
}
