import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

type DbLike = Pick<PoolClient, "query">;

export type SchoolYearCloseCounts = {
  lessonsCancelled: number;
  lessonsCompleted: number;
  groupsClosed: number;
  membershipsClosed: number;
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
       WHERE g.school_id = $1 AND g.school_year_id = $2
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
         (SELECT COUNT(*)::int FROM groups g
          WHERE g.school_id = $1 AND g.school_year_id = $2 AND g.teacher_id = $3) AS groups_count,
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

/** Kroki zamknięcia roku szkolnego (bez dezaktywacji school_years). */
export async function runSchoolYearCloseSteps(
  client: DbLike,
  schoolId: string,
  yearId: string,
  dateTo: string
): Promise<SchoolYearCloseCounts> {
  const memberships = await client.query(
    `UPDATE group_students gs
     SET left_at = $3::date
     FROM groups g
     WHERE gs.group_id = g.id
       AND g.school_id = $1
       AND gs.school_year_id = $2
       AND gs.left_at IS NULL
     RETURNING gs.id`,
    [schoolId, yearId, dateTo]
  );

  const completedLessons = await client.query(
    `UPDATE lessons l
     SET status = 'COMPLETED'
     FROM groups g
     WHERE l.group_id = g.id
       AND g.school_id = $1
       AND g.school_year_id = $2
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
       AND g.school_year_id = $2
       AND l.status = 'SCHEDULED'
       AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
     RETURNING l.id`,
    [schoolId, yearId]
  );

  const scheduleTemplates = await client.query(
    `UPDATE schedule_templates st
     SET active = FALSE
     FROM groups g
     WHERE st.group_id = g.id
       AND g.school_id = $1
       AND g.school_year_id = $2
       AND st.active = TRUE
     RETURNING st.id`,
    [schoolId, yearId]
  );

  const groups = await client.query(
    `UPDATE groups
     SET active = FALSE
     WHERE school_id = $1 AND school_year_id = $2
     RETURNING id`,
    [schoolId, yearId]
  );

  const subs = await client.query(
    `UPDATE subscriptions s
     SET status = 'EXPIRED'
     WHERE s.school_id = $1
       AND s.status IN ('ACTIVE', 'PAUSED')
       AND (
         s.school_year_id = $2
         OR s.group_id IN (SELECT id FROM groups WHERE school_id = $1 AND school_year_id = $2)
       )
     RETURNING s.id`,
    [schoolId, yearId]
  );

  await computeSchoolYearTeacherStats(client, schoolId, yearId);

  return {
    lessonsCancelled: lessons.rowCount ?? 0,
    lessonsCompleted: completedLessons.rowCount ?? 0,
    groupsClosed: groups.rowCount ?? 0,
    membershipsClosed: memberships.rowCount ?? 0,
    subscriptionsExpired: subs.rowCount ?? 0,
    scheduleTemplatesDeactivated: scheduleTemplates.rowCount ?? 0,
  };
}
