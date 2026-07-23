import { queryDb } from "@/lib/db";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

/**
 * Ustawia COMPLETED dla zajęć SCHEDULED, których czas zakończenia minął
 * (scheduled_at + duration_min w czasie szkoły). CANCELLED bez zmian.
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
  return res.rowCount ?? 0;
}
