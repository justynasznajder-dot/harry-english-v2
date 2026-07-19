import { queryDb } from "@/lib/db";
import { completePastScheduledLessons } from "@/lib/lesson-completion";

const TZ = "Europe/Warsaw";

export type SchoolYearScope = {
  id: string;
  school_id: string;
  name: string;
  date_from: string;
  date_to: string;
};

export type TeacherSettlementRow = {
  teacher_id: string;
  teacher_name: string;
  group_id: string;
  group_name: string;
  location_id: string;
  location_name: string;
  period_month: string;
  lessons_count: number;
  students_count: number;
  total_duration_min: number;
};

export type LocationSettlementRow = {
  location_id: string;
  location_name: string;
  teacher_id: string;
  teacher_name: string;
  period_month: string;
  lessons_count: number;
  total_duration_min: number;
};

export async function getSchoolYearScope(
  yearId: string,
  schoolId: string | null
): Promise<SchoolYearScope | null> {
  const res = await queryDb<SchoolYearScope>(
    schoolId
      ? `SELECT id, school_id, name, date_from::text, date_to::text
         FROM school_years WHERE id = $1 AND school_id = $2 LIMIT 1`
      : `SELECT id, school_id, name, date_from::text, date_to::text
         FROM school_years WHERE id = $1 LIMIT 1`,
    schoolId ? [yearId, schoolId] : [yearId]
  );
  return res.rows[0] ?? null;
}

function monthEndYmd(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const last = new Date(y, m, 0);
  const mm = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${last.getFullYear()}-${mm}-${dd}`;
}

/** Zajęcia COMPLETED: lektor × grupa × lokalizacja × miesiąc + liczba uczniów zapisanych na koniec miesiąca. */
export async function fetchTeacherSettlement(
  year: SchoolYearScope,
  periodMonth?: string
): Promise<TeacherSettlementRow[]> {
  await completePastScheduledLessons();

  const params: unknown[] = [year.school_id, year.id, year.date_from, year.date_to];
  let monthClause = "";
  if (periodMonth) {
    params.push(`${periodMonth}-01`);
    params.push(monthEndYmd(periodMonth));
    monthClause = `
      AND (l.scheduled_at AT TIME ZONE '${TZ}')::date >= $5::date
      AND (l.scheduled_at AT TIME ZONE '${TZ}')::date <= $6::date`;
  }

  const lessons = await queryDb<{
    teacher_id: string;
    teacher_first_name: string;
    teacher_last_name: string;
    group_id: string;
    group_name: string;
    location_id: string;
    location_name: string;
    period_month: string;
    lessons_count: number;
    total_duration_min: number;
  }>(
    `SELECT
       l.teacher_id,
       u.first_name AS teacher_first_name,
       u.last_name AS teacher_last_name,
       l.group_id,
       g.name AS group_name,
       l.location_id,
       loc.name AS location_name,
       to_char(date_trunc('month', l.scheduled_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS period_month,
       COUNT(*)::int AS lessons_count,
       COALESCE(SUM(l.duration_min), 0)::int AS total_duration_min
     FROM lessons l
     JOIN groups g ON g.id = l.group_id
     JOIN users u ON u.id = l.teacher_id
     JOIN locations loc ON loc.id = l.location_id
     WHERE g.school_id = $1
       AND l.school_year_id = $2
       AND l.status = 'COMPLETED'
       AND (l.scheduled_at AT TIME ZONE '${TZ}')::date >= $3::date
       AND (l.scheduled_at AT TIME ZONE '${TZ}')::date <= $4::date
       ${monthClause}
     GROUP BY l.teacher_id, u.first_name, u.last_name, l.group_id, g.name,
              l.location_id, loc.name, period_month
     ORDER BY period_month DESC, u.last_name, u.first_name, g.name, loc.name`,
    params
  );

  if (lessons.rows.length === 0) return [];

  const months = [...new Set(lessons.rows.map((r) => r.period_month))];
  const studentCounts = await fetchGroupStudentCountsByMonth(
    year.school_id,
    year.id,
    months
  );

  return lessons.rows.map((row) => ({
    teacher_id: row.teacher_id,
    teacher_name: `${row.teacher_first_name} ${row.teacher_last_name}`.trim(),
    group_id: row.group_id,
    group_name: row.group_name,
    location_id: row.location_id,
    location_name: row.location_name,
    period_month: row.period_month,
    lessons_count: row.lessons_count,
    students_count: studentCounts.get(`${row.group_id}:${row.period_month}`) ?? 0,
    total_duration_min: row.total_duration_min,
  }));
}

/** Uczniowie zapisani do grupy na ostatni dzień miesiąca (w ramach roku szkolnego). */
async function fetchGroupStudentCountsByMonth(
  schoolId: string,
  schoolYearId: string,
  periodMonths: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const pm of periodMonths) {
    const monthEnd = monthEndYmd(pm);
    const res = await queryDb<{ group_id: string; students_count: number }>(
      `SELECT gs.group_id, COUNT(DISTINCT gs.child_id)::int AS students_count
       FROM group_students gs
       WHERE gs.school_id = $1
         AND gs.school_year_id = $2
         AND gs.enrolled_at <= $3::date
         AND (gs.left_at IS NULL OR gs.left_at > $3::date)
       GROUP BY gs.group_id`,
      [schoolId, schoolYearId, monthEnd]
    );
    for (const row of res.rows) {
      map.set(`${row.group_id}:${pm}`, row.students_count);
    }
  }
  return map;
}

/** Zajęcia COMPLETED per lokalizacja × lektor × miesiąc. */
export async function fetchLocationSettlement(
  year: SchoolYearScope,
  periodMonth?: string
): Promise<LocationSettlementRow[]> {
  await completePastScheduledLessons();

  const params: unknown[] = [year.school_id, year.id, year.date_from, year.date_to];
  let monthClause = "";
  if (periodMonth) {
    params.push(`${periodMonth}-01`);
    params.push(monthEndYmd(periodMonth));
    monthClause = `
      AND (l.scheduled_at AT TIME ZONE '${TZ}')::date >= $5::date
      AND (l.scheduled_at AT TIME ZONE '${TZ}')::date <= $6::date`;
  }

  const res = await queryDb<{
    location_id: string;
    location_name: string;
    teacher_id: string;
    teacher_first_name: string;
    teacher_last_name: string;
    period_month: string;
    lessons_count: number;
    total_duration_min: number;
  }>(
    `SELECT
       l.location_id,
       loc.name AS location_name,
       l.teacher_id,
       u.first_name AS teacher_first_name,
       u.last_name AS teacher_last_name,
       to_char(date_trunc('month', l.scheduled_at AT TIME ZONE '${TZ}'), 'YYYY-MM') AS period_month,
       COUNT(*)::int AS lessons_count,
       COALESCE(SUM(l.duration_min), 0)::int AS total_duration_min
     FROM lessons l
     JOIN groups g ON g.id = l.group_id
     JOIN locations loc ON loc.id = l.location_id
     JOIN users u ON u.id = l.teacher_id
     WHERE g.school_id = $1
       AND l.school_year_id = $2
       AND l.status = 'COMPLETED'
       AND (l.scheduled_at AT TIME ZONE '${TZ}')::date >= $3::date
       AND (l.scheduled_at AT TIME ZONE '${TZ}')::date <= $4::date
       ${monthClause}
     GROUP BY l.location_id, loc.name, l.teacher_id, u.first_name, u.last_name, period_month
     ORDER BY period_month DESC, loc.name, u.last_name, u.first_name`,
    params
  );

  return res.rows.map((row) => ({
    location_id: row.location_id,
    location_name: row.location_name,
    teacher_id: row.teacher_id,
    teacher_name: `${row.teacher_first_name} ${row.teacher_last_name}`.trim(),
    period_month: row.period_month,
    lessons_count: row.lessons_count,
    total_duration_min: row.total_duration_min,
  }));
}

export function summarizeTeacherRows(rows: TeacherSettlementRow[]) {
  const byTeacher = new Map<
    string,
    { teacher_id: string; teacher_name: string; lessons_count: number; total_duration_min: number }
  >();
  for (const row of rows) {
    const cur = byTeacher.get(row.teacher_id) ?? {
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      lessons_count: 0,
      total_duration_min: 0,
    };
    cur.lessons_count += row.lessons_count;
    cur.total_duration_min += row.total_duration_min;
    byTeacher.set(row.teacher_id, cur);
  }
  return [...byTeacher.values()].sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, "pl"));
}

export function summarizeLocationRows(rows: LocationSettlementRow[]) {
  const byLocation = new Map<
    string,
    { location_id: string; location_name: string; lessons_count: number; total_duration_min: number }
  >();
  for (const row of rows) {
    const cur = byLocation.get(row.location_id) ?? {
      location_id: row.location_id,
      location_name: row.location_name,
      lessons_count: 0,
      total_duration_min: 0,
    };
    cur.lessons_count += row.lessons_count;
    cur.total_duration_min += row.total_duration_min;
    byLocation.set(row.location_id, cur);
  }
  return [...byLocation.values()].sort((a, b) => a.location_name.localeCompare(b.location_name, "pl"));
}
