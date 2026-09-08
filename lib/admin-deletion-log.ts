import { randomUUID } from "crypto";
import { queryDb } from "@/lib/db";

export const ADMIN_DELETION_ACTIONS = [
  "HOLIDAY_LESSON_PURGE",
  "HOLIDAY_DELETE",
  "LESSON_DELETE",
  "LESSONS_FUTURE_DELETE",
] as const;

export type AdminDeletionAction = (typeof ADMIN_DELETION_ACTIONS)[number];

export type WriteAdminDeletionLogInput = {
  schoolId: string;
  actorUserId?: string | null;
  action: AdminDeletionAction;
  summary: string;
  payload: Record<string, unknown>;
};

/**
 * Best-effort audit log przy hard-delete.
 * Błąd zapisu nie przerywa operacji — tylko log w konsoli.
 */
export async function writeAdminDeletionLog(
  input: WriteAdminDeletionLogInput,
): Promise<void> {
  try {
    await queryDb(
      `INSERT INTO admin_deletion_logs (
         id, school_id, actor_user_id, action, summary, payload, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
      [
        randomUUID(),
        input.schoolId,
        input.actorUserId ?? null,
        input.action,
        input.summary,
        JSON.stringify(input.payload ?? {}),
      ],
    );
  } catch (error) {
    console.error("writeAdminDeletionLog failed:", error);
  }
}
