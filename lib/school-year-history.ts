import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

type DbLike = Pick<PoolClient, "query">;

export type SchoolYearCloseCounts = {
  lessonsCancelled: number;
  lessonsCompleted: number;
  groupsClosed: number;
  membershipsClosed: number;
  membershipsCarried: number;
  subscriptionsExpired: number;
  scheduleTemplatesDeactivated: number;
};

/** Materializuje statystyki lektorów dla danego roku szkolnego (upsert). */
export async function computeSchoolYearTeacherStats(
  client: DbLike,
  schoolId: string,
  schoolYearId: string
): Promise<number> {
  const teachers = await client.query<{ teacher_id: string }>(
    `SELECT DISTINCT teacher_id
     FROM (
       SELECT g.teacher_id
       FROM groups g
       JOIN group_students gs ON gs.group_id = g.id AND gs.school_year_id = $2
       WHERE g.school_id = $1
       UNION
       SELECT l.teacher_id
       FROM lessons l
       JOIN groups g ON g.id = l.group_id
       WHERE g.school_id = $1 AND l.school_year_id = $2
     ) t`,
    [schoolId, schoolYearId]
  );

  let upserted = 0;
  for (const { teacher_id: teacherId } of teachers.rows) {
    const stats = await client.query<{
      groups_count: number;
      students_count: number;
      lessons_scheduled: number;
      lessons_completed: number;
      lessons_cancelled: number;
      total_duration_min: number;
      attendance_marked_count: number;
    }>(
      `SELECT
         (SELECT COUNT(DISTINCT g.id)::int
          FROM groups g
          JOIN group_students gs ON gs.group_id = g.id AND gs.school_year_id = $2
          WHERE g.school_id = $1 AND g.teacher_id = $3) AS groups_count,
         (SELECT COUNT(DISTINCT gs.child_id)::int
          FROM group_students gs
          JOIN groups g ON g.id = gs.group_id
          WHERE g.school_id = $1 AND gs.school_year_id = $2 AND g.teacher_id = $3) AS students_count,
         (SELECT COUNT(*)::int FROM lessons l
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2 AND l.teacher_id = $3
            AND l.status = 'SCHEDULED') AS lessons_scheduled,
         (SELECT COUNT(*)::int FROM lessons l
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2 AND l.teacher_id = $3
            AND l.status = 'COMPLETED') AS lessons_completed,
         (SELECT COUNT(*)::int FROM lessons l
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2 AND l.teacher_id = $3
            AND l.status = 'CANCELLED') AS lessons_cancelled,
         (SELECT COALESCE(SUM(l.duration_min), 0)::int FROM lessons l
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2 AND l.teacher_id = $3
            AND l.status = 'COMPLETED') AS total_duration_min,
         (SELECT COUNT(a.id)::int FROM attendance a
          JOIN lessons l ON l.id = a.lesson_id
          JOIN groups g ON g.id = l.group_id
          WHERE g.school_id = $1 AND l.school_year_id = $2 AND l.teacher_id = $3) AS attendance_marked_count`,
      [schoolId, schoolYearId, teacherId]
    );
    const row = stats.rows[0];
    if (!row) continue;

    await client.query(
      `INSERT INTO school_year_teacher_stats (
         id, school_id, school_year_id, teacher_id,
         groups_count, students_count,
         lessons_scheduled, lessons_completed, lessons_cancelled,
         total_duration_min, attendance_marked_count, computed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (school_id, school_year_id, teacher_id)
       DO UPDATE SET
         groups_count = EXCLUDED.groups_count,
         students_count = EXCLUDED.students_count,
         lessons_scheduled = EXCLUDED.lessons_scheduled,
         lessons_completed = EXCLUDED.lessons_completed,
         lessons_cancelled = EXCLUDED.lessons_cancelled,
         total_duration_min = EXCLUDED.total_duration_min,
         attendance_marked_count = EXCLUDED.attendance_marked_count,
         computed_at = NOW()`,
      [
        randomUUID(),
        schoolId,
        schoolYearId,
        teacherId,
        row.groups_count,
        row.students_count,
        row.lessons_scheduled,
        row.lessons_completed,
        row.lessons_cancelled,
        row.total_duration_min,
        row.attendance_marked_count,
      ]
    );
    upserted += 1;
  }
  return upserted;
}

type MembershipCarryRow = {
  id: string;
  group_id: string;
  child_id: string;
  lesson_unit_price: string | null;
  monthly_unit_price: string | null;
  yearly_unit_price: string | null;
};

/** Tworzy/otwiera członkostwa na nextYearId na podstawie zamkniętych wierszy (ten sam group_id). */
async function carryMembershipRowsToYear(
  client: DbLike,
  schoolId: string,
  nextYearId: string,
  memberships: MembershipCarryRow[]
): Promise<number> {
  let membershipsCarried = 0;
  for (const m of memberships) {
    const already = await client.query<{ id: string }>(
      `SELECT id FROM group_students
       WHERE child_id = $1
         AND school_year_id = $2
         AND left_at IS NULL
       LIMIT 1`,
      [m.child_id, nextYearId]
    );
    if (already.rows[0]) continue;

    const prior = await client.query<{ id: string; left_at: string | null }>(
      `SELECT id, left_at::text FROM group_students
       WHERE group_id = $1 AND child_id = $2 AND school_year_id IS NOT DISTINCT FROM $3
       LIMIT 1`,
      [m.group_id, m.child_id, nextYearId]
    );
    if (prior.rows[0]) {
      if (prior.rows[0].left_at == null) continue;
      await client.query(
        `UPDATE group_students
         SET left_at = NULL,
             enrolled_at = CURRENT_DATE,
             school_id = $2,
             lesson_unit_price = $3,
             monthly_unit_price = $4,
             yearly_unit_price = $5
         WHERE id = $1`,
        [
          prior.rows[0].id,
          schoolId,
          m.lesson_unit_price,
          m.monthly_unit_price,
          m.yearly_unit_price,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO group_students (
           id, school_id, group_id, child_id, enrolled_at, school_year_id,
           lesson_unit_price, monthly_unit_price, yearly_unit_price
         ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, $6, $7, $8)`,
        [
          randomUUID(),
          schoolId,
          m.group_id,
          m.child_id,
          nextYearId,
          m.lesson_unit_price,
          m.monthly_unit_price,
          m.yearly_unit_price,
        ]
      );
    }
    membershipsCarried += 1;
  }
  return membershipsCarried;
}

/**
 * Przenosi wszystkie otwarte członkostwa szkoły na nowy rok (zamyka stare left_at).
 * Używane gdy tworzony jest aktywny rok po luce bez aktywnego roku.
 */
export async function attachOpenMembershipsToYear(
  client: DbLike,
  schoolId: string,
  nextYearId: string,
  leftAtDate: string
): Promise<{ membershipsClosed: number; membershipsCarried: number }> {
  const memberships = await client.query<MembershipCarryRow>(
    `UPDATE group_students gs
     SET left_at = $2::date
     FROM groups g
     WHERE gs.group_id = g.id
       AND g.school_id = $1
       AND gs.left_at IS NULL
       AND gs.school_year_id IS DISTINCT FROM $3
     RETURNING gs.id, gs.group_id, gs.child_id,
               gs.lesson_unit_price::text, gs.monthly_unit_price::text, gs.yearly_unit_price::text`,
    [schoolId, leftAtDate, nextYearId]
  );
  const membershipsCarried = await carryMembershipRowsToYear(
    client,
    schoolId,
    nextYearId,
    memberships.rows
  );
  return {
    membershipsClosed: memberships.rowCount ?? 0,
    membershipsCarried,
  };
}

/**
 * Kroki zamknięcia roku szkolnego (bez dezaktywacji school_years).
 * Grupy szkoły pozostają aktywne.
 * Jeśli jest nextYearId — członkostwa zamykanego roku dostają left_at i są przenoszone
 * na ten sam group_id w kolejnym roku (pomijane, gdy dziecko ma już zapis, np. z odnowienia).
 * Bez kolejnego roku — dzieci zostają w grupach (left_at bez zmian).
 */
export async function runSchoolYearCloseSteps(
  client: DbLike,
  schoolId: string,
  yearId: string,
  dateTo: string,
  nextYearId?: string | null
): Promise<SchoolYearCloseCounts> {
  let membershipsClosed = 0;
  let membershipsCarried = 0;

  if (nextYearId) {
    const memberships = await client.query<MembershipCarryRow>(
      `UPDATE group_students gs
       SET left_at = $3::date
       FROM groups g
       WHERE gs.group_id = g.id
         AND g.school_id = $1
         AND gs.school_year_id = $2
         AND gs.left_at IS NULL
       RETURNING gs.id, gs.group_id, gs.child_id,
                 gs.lesson_unit_price::text, gs.monthly_unit_price::text, gs.yearly_unit_price::text`,
      [schoolId, yearId, dateTo]
    );
    membershipsClosed = memberships.rowCount ?? 0;
    membershipsCarried = await carryMembershipRowsToYear(
      client,
      schoolId,
      nextYearId,
      memberships.rows
    );
  }

  const completedLessons = await client.query(
    `UPDATE lessons l
     SET status = 'COMPLETED'
     FROM groups g
     WHERE l.group_id = g.id
       AND g.school_id = $1
       AND l.school_year_id = $2
       AND l.status = 'SCHEDULED'
       AND (${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} + (l.duration_min * interval '1 minute')) <= NOW()
     RETURNING l.id`,
    [schoolId, yearId]
  );

  const lessons = await client.query(
    `UPDATE lessons l
     SET status = 'CANCELLED'
     FROM groups g
     WHERE l.group_id = g.id
       AND g.school_id = $1
       AND l.school_year_id = $2
       AND l.status = 'SCHEDULED'
       AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
     RETURNING l.id`,
    [schoolId, yearId]
  );

  // Harmonogramy należą do grupy szkoły — nie dezaktywujemy ich przy zamknięciu roku.

  const subs = await client.query(
    `UPDATE subscriptions s
     SET status = 'EXPIRED'
     WHERE s.school_id = $1
       AND s.status IN ('ACTIVE', 'PAUSED')
       AND s.school_year_id = $2
     RETURNING s.id`,
    [schoolId, yearId]
  );

  await computeSchoolYearTeacherStats(client, schoolId, yearId);

  return {
    lessonsCancelled: lessons.rowCount ?? 0,
    lessonsCompleted: completedLessons.rowCount ?? 0,
    groupsClosed: 0,
    membershipsClosed,
    membershipsCarried,
    subscriptionsExpired: subs.rowCount ?? 0,
    scheduleTemplatesDeactivated: 0,
  };
}
