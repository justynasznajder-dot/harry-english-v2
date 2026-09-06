import { queryDb } from "@/lib/db";
import { sqlStudentAttendsLesson } from "@/lib/lessons-per-week";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

/** Umowa PER_LESSON — obecność tylko po ręcznym oznaczeniu przez lektora. */
const PER_LESSON_CONTRACT_EXISTS = `
  EXISTS (
    SELECT 1
    FROM contracts ct
    JOIN contract_children cc ON cc.contract_id = ct.id
    WHERE cc.child_id = c.id
      AND ct.payment_type = 'PER_LESSON'
      AND ct.status = 'SIGNED'
      AND ct.billing_exempt = FALSE
      AND (cc.group_id IS NULL OR cc.group_id = gs.group_id)
  )
`;

/**
 * Dla zakończonych zajęć wstawia PRESENT dzieciom BEZ umowy PER_LESSON
 * (miesięczna / roczna) — obecność z założenia.
 * Dzieci PER_LESSON nie dostają wpisu — lektor musi oznaczyć je ręcznie.
 * Nie nadpisuje ABSENT / EXCUSED / LATE / PRESENT.
 */
export async function ensureDefaultPresentAttendance(
  lessonIds: string[]
): Promise<number> {
  const ids = [...new Set(lessonIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;

  const res = await queryDb<{ lesson_id: string; child_id: string }>(
    `INSERT INTO attendance (lesson_id, child_id, status)
     SELECT l.id, c.id, 'PRESENT'::"AttendanceStatus"
     FROM lessons l
     JOIN groups g ON g.id = l.group_id
     JOIN group_students gs
       ON gs.group_id = l.group_id
      AND gs.left_at IS NULL
     JOIN children c ON c.id = gs.child_id AND c.active = TRUE
     WHERE l.id = ANY($1::text[])
       AND l.status = 'COMPLETED'
       AND ${sqlStudentAttendsLesson("gs", "g", "l")}
       AND NOT (${PER_LESSON_CONTRACT_EXISTS})
       AND NOT EXISTS (
         SELECT 1
         FROM attendance a
         WHERE a.lesson_id = l.id
           AND a.child_id = c.id
       )
     ON CONFLICT (lesson_id, child_id) DO NOTHING
     RETURNING lesson_id, child_id`,
    [ids]
  );
  return res.rowCount ?? 0;
}

/**
 * Uzupełnia brakujące PRESENT (tylko nie-PER_LESSON) na zakończonych zajęciach
 * z ostatnich `days` dni.
 */
export async function backfillDefaultPresentAttendance(
  days = 120,
  schoolId?: string | null
): Promise<number> {
  const params: unknown[] = [days];
  let schoolFilter = "";
  if (schoolId?.trim()) {
    params.push(schoolId.trim());
    schoolFilter = `AND l.school_id = $${params.length}`;
  }

  const res = await queryDb<{ id: string }>(
    `SELECT l.id
     FROM lessons l
     WHERE l.status = 'COMPLETED'
       AND l.scheduled_at >= (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
       ${schoolFilter}`,
    params
  );
  return ensureDefaultPresentAttendance(res.rows.map((row) => row.id));
}

/**
 * Ustawia COMPLETED dla zajęć SCHEDULED, których czas zakończenia minął.
 * Po zakończeniu oznacza domyślną obecność u dzieci bez rozliczenia PER_LESSON.
 */
export async function completePastScheduledLessons(): Promise<number> {
  const endsAt = `${sqlSchoolTimestampAsTimestamptz("scheduled_at")} + (duration_min * interval '1 minute')`;
  const res = await queryDb<{ id: string }>(
    `UPDATE lessons
     SET status = 'COMPLETED'
     WHERE status = 'SCHEDULED'
       AND (${endsAt}) <= NOW()
     RETURNING id`
  );
  const completedIds = res.rows.map((row) => row.id);
  if (completedIds.length > 0) {
    await ensureDefaultPresentAttendance(completedIds);
  }
  return res.rowCount ?? 0;
}
