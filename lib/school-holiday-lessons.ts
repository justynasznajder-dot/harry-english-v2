import { queryDb } from "@/lib/db";

export type HolidayLessonDeletionByGroup = {
  groupId: string;
  deletedCount: number;
};

export type DeleteScheduledLessonsInHolidayRangeResult = {
  deleted: number;
  byGroup: HolidayLessonDeletionByGroup[];
};

/**
 * Usuwa zajęcia szkoły w zakresie dat dnia wolnego:
 * - SCHEDULED
 * - CANCELLED z powodem „Dzień wolny” (stary flow anulowania)
 * COMPLETED zostają w historii. Czyści attendance / progress_notes.
 */
export async function deleteScheduledLessonsInHolidayRange(
  schoolId: string,
  dateFrom: string,
  dateTo: string,
): Promise<DeleteScheduledLessonsInHolidayRangeResult> {
  const scheduled = await queryDb<{ id: string; group_id: string }>(
    `SELECT l.id, l.group_id
     FROM lessons l
     INNER JOIN groups g ON g.id = l.group_id
     WHERE g.school_id = $1
       AND l.scheduled_at::date >= $2::date
       AND l.scheduled_at::date <= $3::date
       AND (
         l.status = 'SCHEDULED'
         OR (
           l.status = 'CANCELLED'
           AND COALESCE(l.cancellation_reason, '') ILIKE '%dzień wolny%'
         )
       )`,
    [schoolId, dateFrom, dateTo],
  );

  if (scheduled.rows.length === 0) {
    return { deleted: 0, byGroup: [] };
  }

  const ids = scheduled.rows.map((r) => r.id);
  const counts = new Map<string, number>();
  for (const row of scheduled.rows) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  await queryDb(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [ids]);
  await queryDb(`DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`, [ids]);
  const deleted = await queryDb<{ id: string }>(
    `DELETE FROM lessons
     WHERE id = ANY($1::text[])
       AND status = 'SCHEDULED'
     RETURNING id`,
    [ids],
  );

  return {
    deleted: deleted.rowCount ?? 0,
    byGroup: [...counts.entries()].map(([groupId, deletedCount]) => ({
      groupId,
      deletedCount,
    })),
  };
}
