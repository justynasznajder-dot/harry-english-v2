import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { getDbShape, queryDb } from "@/lib/db";

/** Ustawia `users.access_level` rodzica: ACTIVE gdy ma aktywne dziecko SIGNED/COMPLETED, inaczej PENDING. */
export async function syncParentUserAccessLevel(parentId: string): Promise<void> {
  const shape = await getDbShape();
  if (!shape.userHasAccessLevel) return;

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
  const shape = await getDbShape();
  if (!shape.hasChildrenTable || !shape.childHasAccessLevel) return;

  await queryDb(
    `UPDATE children
     SET access_level = $2
     WHERE enrollment_request_id = $1`,
    [enrollmentRequestId, accessLevel]
  );
}
