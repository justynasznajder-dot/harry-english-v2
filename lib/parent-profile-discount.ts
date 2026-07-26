import { queryDb, upsertParentProfileForUser } from "@/lib/db";

export async function resolveParentUserIdForEnrollment(params: {
  schoolId: string;
  parentUserId?: string | null;
  parentEmail?: string | null;
}): Promise<string | null> {
  const directId = String(params.parentUserId ?? "").trim();
  if (directId && directId.includes("-")) {
    const check = await queryDb<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND school_id = $2 AND UPPER(role) = 'PARENT' LIMIT 1`,
      [directId, params.schoolId]
    );
    if (check.rows[0]?.id) return check.rows[0].id;
  }

  const email = String(params.parentEmail ?? "").trim().toLowerCase();
  if (!email) return null;

  const byEmail = await queryDb<{ id: string }>(
    `SELECT id FROM users
     WHERE school_id = $1 AND UPPER(role) = 'PARENT' AND LOWER(BTRIM(email::text)) = $2
     LIMIT 1`,
    [params.schoolId, email]
  );
  return byEmail.rows[0]?.id ?? null;
}

export async function getParentLargeFamilyCard(
  parentUserId: string
): Promise<boolean> {
  const res = await queryDb<{ discount_large_family: boolean }>(
    `SELECT COALESCE(discount_large_family, FALSE) AS discount_large_family
     FROM parent_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [parentUserId]
  );
  return res.rows[0]?.discount_large_family === true;
}

export async function setParentLargeFamilyCard(params: {
  schoolId: string;
  parentUserId: string;
  discountLargeFamily: boolean;
}): Promise<void> {
  await upsertParentProfileForUser({
    userId: params.parentUserId,
    schoolId: params.schoolId,
    discount_large_family: params.discountLargeFamily,
  });
}

/** Staging KDR na zgłoszeniach (przed kontem rodzica), po e-mailu. */
export async function setEnrollmentPendingLargeFamilyCard(params: {
  schoolId: string;
  parentEmail: string;
  discountLargeFamily: boolean;
}): Promise<number> {
  const email = String(params.parentEmail ?? "").trim().toLowerCase();
  if (!email) return 0;

  const res = await queryDb(
    `UPDATE enrollment_requests
     SET discount_large_family = $3
     WHERE school_id = $1
       AND LOWER(BTRIM(parent_email::text)) = $2
       AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'COMPLETED'`,
    [params.schoolId, email, params.discountLargeFamily]
  );
  return res.rowCount ?? 0;
}

/**
 * Po utworzeniu konta rodzica: przenieś staging KDR ze zgłoszeń na parent_profiles.
 * Zwraca true, gdy oznaczono KDR na profilu.
 */
export async function promotePendingLargeFamilyCardToParent(params: {
  schoolId: string;
  parentUserId: string;
  parentEmail: string;
}): Promise<boolean> {
  const email = String(params.parentEmail ?? "").trim().toLowerCase();
  if (!email) return false;

  const pending = await queryDb<{ has_kdr: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM enrollment_requests er
       WHERE er.school_id = $1
         AND er.discount_large_family = TRUE
         AND (
           er.user_id = $2
           OR LOWER(BTRIM(er.parent_email::text)) = $3
         )
     ) AS has_kdr`,
    [params.schoolId, params.parentUserId, email]
  );

  if (pending.rows[0]?.has_kdr !== true) return false;

  await setParentLargeFamilyCard({
    schoolId: params.schoolId,
    parentUserId: params.parentUserId,
    discountLargeFamily: true,
  });
  return true;
}
