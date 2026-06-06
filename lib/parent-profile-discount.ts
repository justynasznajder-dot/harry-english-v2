import { queryDb } from "@/lib/db";
import { upsertParentProfileForUser } from "@/lib/db";

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
