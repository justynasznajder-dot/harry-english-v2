import { randomUUID } from "crypto";
import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { queryDb } from "@/lib/db";

/** Ustawia `users.access_level` rodzica: ACTIVE gdy ma aktywne dziecko SIGNED/COMPLETED, inaczej PENDING. */
export async function syncParentUserAccessLevel(parentId: string): Promise<void> {
  await queryDb(
    `UPDATE users
     SET access_level = CASE
       WHEN EXISTS (
         SELECT 1 FROM children
         WHERE parent_id = $1
           AND active = TRUE
           AND UPPER(BTRIM(COALESCE(access_level::text, ''))) IN ('SIGNED', 'COMPLETED')
       ) THEN 'ACTIVE'
       ELSE 'PENDING'
     END
     WHERE id = $1
       AND role = 'PARENT'`,
    [parentId]
  );
}

/** Synchronizuje `children.access_level` dla dzieci powiązanych ze zgłoszeniem enrollment. */
export async function syncChildrenAccessLevelForEnrollment(
  enrollmentRequestId: string,
  accessLevel: EnrollmentStatus
): Promise<void> {
  await queryDb(
    `UPDATE children
     SET access_level = $2
     WHERE enrollment_request_id = $1`,
    [enrollmentRequestId, accessLevel]
  );
}

/** Dodaje dziecko do grupy (`group_students`), jeśli nie jest już aktywnie przypisane. */
export async function enrollChildInGroup(
  childId: string,
  groupId: string
): Promise<boolean> {
  if (!groupId) return false;

  const active = await queryDb<{ id: string }>(
    `SELECT id FROM group_students
     WHERE group_id = $1 AND child_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [groupId, childId]
  );
  if (active.rows[0]) return false;

  const groupRow = await queryDb<{ school_year_id: string | null }>(
    `SELECT school_year_id FROM groups WHERE id = $1 LIMIT 1`,
    [groupId]
  );
  if (!groupRow.rows[0]) return false;
  const schoolYearId = groupRow.rows[0].school_year_id;

  const prior = await queryDb<{ id: string }>(
    `SELECT id FROM group_students
     WHERE group_id = $1 AND child_id = $2
     LIMIT 1`,
    [groupId, childId]
  );
  if (prior.rows[0]) {
    await queryDb(
      `UPDATE group_students
       SET left_at = NULL, enrolled_at = NOW(), school_year_id = $2
       WHERE id = $1`,
      [prior.rows[0].id, schoolYearId]
    );
  } else {
    await queryDb(
      `INSERT INTO group_students (id, group_id, child_id, enrolled_at, school_year_id)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [randomUUID(), groupId, childId, schoolYearId]
    );
  }
  return true;
}

/** Przypisuje wszystkie dzieci ze zgłoszenia do proponowanej grupy. */
export async function enrollChildrenForEnrollmentRequest(
  enrollmentRequestId: string
): Promise<void> {
  const res = await queryDb<{ child_id: string; group_id: string | null }>(
    `SELECT c.id AS child_id, er.proposed_group_id AS group_id
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     WHERE c.enrollment_request_id = $1`,
    [enrollmentRequestId]
  );
  for (const row of res.rows) {
    if (row.group_id) {
      await enrollChildInGroup(row.child_id, row.group_id);
    }
  }
}
