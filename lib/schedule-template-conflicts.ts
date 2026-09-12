import { queryDb } from "@/lib/db";

export type ScheduleOverlapConflict = {
  groupName: string;
  startTime: string;
  durationMin: number;
  endTime: string;
};

function normalizeTimeToHhMmSs(raw: string): string {
  const t = String(raw ?? "").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t.slice(0, 8);
}

function formatHhMm(raw: string): string {
  return String(raw ?? "").slice(0, 5);
}

function addMinutesToHhMm(startHhMmSs: string, durationMin: number): string {
  const [h, m] = startHhMmSs.split(":").map(Number);
  const total = h * 60 + m + durationMin;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Nakładanie się terminów nauczyciela (ten sam dzień tygodnia).
 * Uwzględnia zajęcia, które zaczęły się wcześniej i jeszcze trwają
 * (np. 16:10–16:50 vs 16:20–17:00).
 */
export async function findTeacherScheduleOverlap(opts: {
  schoolId: string;
  groupId: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  excludeTemplateId?: string | null;
}): Promise<ScheduleOverlapConflict | null> {
  const startTime = normalizeTimeToHhMmSs(opts.startTime);
  const durationMin = Number(opts.durationMin);
  if (!Number.isFinite(durationMin) || durationMin < 1) return null;

  const res = await queryDb<{
    name: string;
    start_time: string;
    duration_min: number;
  }>(
    `SELECT g.name,
            TO_CHAR(st.start_time, 'HH24:MI:SS') AS start_time,
            st.duration_min
     FROM schedule_templates st
     JOIN groups g ON g.id = st.group_id AND g.school_id = $1
     WHERE g.teacher_id IS NOT NULL
       AND g.teacher_id = (
         SELECT teacher_id FROM groups WHERE id = $2 AND school_id = $1
       )
       AND st.active = TRUE
       AND g.active = TRUE
       AND g.deleted_at IS NULL
       AND st.day_of_week = $3
       AND ($6::text IS NULL OR st.id <> $6)
       AND st.start_time < ($4::time + make_interval(mins => $5))
       AND $4::time < (st.start_time + make_interval(mins => st.duration_min))
     ORDER BY st.start_time
     LIMIT 1`,
    [
      opts.schoolId,
      opts.groupId,
      opts.dayOfWeek,
      startTime,
      durationMin,
      opts.excludeTemplateId ?? null,
    ],
  );

  const row = res.rows[0];
  if (!row) return null;
  const start = formatHhMm(row.start_time);
  return {
    groupName: row.name,
    startTime: start,
    durationMin: Number(row.duration_min) || 0,
    endTime: addMinutesToHhMm(normalizeTimeToHhMmSs(row.start_time), Number(row.duration_min) || 0),
  };
}

/** Nakładanie się terminów w tej samej lokalizacji (sala). */
export async function findLocationScheduleOverlap(opts: {
  schoolId: string;
  groupId: string;
  locationId: string;
  dayOfWeek: number;
  startTime: string;
  durationMin: number;
  excludeTemplateId?: string | null;
}): Promise<ScheduleOverlapConflict | null> {
  const startTime = normalizeTimeToHhMmSs(opts.startTime);
  const durationMin = Number(opts.durationMin);
  if (!Number.isFinite(durationMin) || durationMin < 1) return null;

  const res = await queryDb<{
    name: string;
    start_time: string;
    duration_min: number;
  }>(
    `SELECT g.name,
            TO_CHAR(st.start_time, 'HH24:MI:SS') AS start_time,
            st.duration_min
     FROM schedule_templates st
     JOIN groups g ON g.id = st.group_id AND g.school_id = $1
     WHERE st.location_id = $2
       AND st.active = TRUE
       AND g.active = TRUE
       AND g.deleted_at IS NULL
       AND st.day_of_week = $3
       AND ($6::text IS NULL OR st.id <> $6)
       AND st.start_time < ($4::time + make_interval(mins => $5))
       AND $4::time < (st.start_time + make_interval(mins => st.duration_min))
     ORDER BY st.start_time
     LIMIT 1`,
    [
      opts.schoolId,
      opts.locationId,
      opts.dayOfWeek,
      startTime,
      durationMin,
      opts.excludeTemplateId ?? null,
    ],
  );

  const row = res.rows[0];
  if (!row) return null;
  const start = formatHhMm(row.start_time);
  return {
    groupName: row.name,
    startTime: start,
    durationMin: Number(row.duration_min) || 0,
    endTime: addMinutesToHhMm(normalizeTimeToHhMmSs(row.start_time), Number(row.duration_min) || 0),
  };
}

export function formatScheduleOverlapMessage(
  kind: "teacher" | "location",
  conflict: ScheduleOverlapConflict,
): string {
  const range = `${conflict.startTime}–${conflict.endTime}`;
  if (kind === "teacher") {
    return `Nauczyciel zajęty: ${conflict.groupName} (${range}). Termin nachodzi na zajęcia, które już trwają lub zaczynają się w tym samym czasie.`;
  }
  return `Sala zajęta: ${conflict.groupName} (${range}). Termin nachodzi na inne zajęcia w tej lokalizacji.`;
}
