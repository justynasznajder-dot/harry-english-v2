import { queryDb } from "@/lib/db";

/**
 * Ustawia COMPLETED dla zajęć SCHEDULED, których czas zakończenia minął
 * (scheduled_at + duration_min). CANCELLED i inne statusy bez zmian.
 */
export async function completePastScheduledLessons(): Promise<number> {
  const res = await queryDb<{ id: string }>(
    `UPDATE lessons
     SET status = 'COMPLETED'
     WHERE status = 'SCHEDULED'
       AND (scheduled_at + (duration_min * interval '1 minute')) <= NOW()
     RETURNING id`
  );
  return res.rowCount ?? 0;
}
