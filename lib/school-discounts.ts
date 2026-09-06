import bcrypt from "bcryptjs";
import { createUser, findUserBySchoolAndEmail, queryDb } from "@/lib/db";
import {
  applyDiscountsToAmount,
  clampMaxDiscountPercent,
  DEFAULT_MAX_DISCOUNT_PERCENT,
  DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  MAX_DISCOUNT_PERCENT,
  hasIndividualPriceOverride,
  type DiscountKey,
} from "@/lib/discount-math";
import type { ComplimentaryCandidate, ComplimentaryParentRow } from "@/lib/complimentary-parent-list";
import { ensureChildrenFromEnrollmentRequests } from "@/lib/enrollment-sync";
import { formatPersonName } from "@/lib/format-person-name";
import { generateTempPassword } from "@/lib/password";
export {
  applyDiscountsToAmount,
  clampMaxDiscountPercent,
  DEFAULT_MAX_DISCOUNT_PERCENT,
  DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  MAX_DISCOUNT_PERCENT,
  hasIndividualPriceOverride,
  type DiscountKey,
};
export type { ComplimentaryCandidate, ComplimentaryParentRow };
export const ALL_DISCOUNT_KEYS: DiscountKey[] = [
  DISCOUNT_KEYS.LARGE_FAMILY_CARD,
  DISCOUNT_KEYS.SIBLING,
];
export type SchoolDiscountSettings = Record<DiscountKey, number> & {
  maxPercent: number;
};
const DEFAULT_SETTINGS: SchoolDiscountSettings = {
  LARGE_FAMILY_CARD: 0,
  SIBLING: 0,
  maxPercent: DEFAULT_MAX_DISCOUNT_PERCENT,
};
function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}
export function parseDiscountKey(raw: unknown): DiscountKey | null {
  const key = String(raw ?? "").trim().toUpperCase();
  return (ALL_DISCOUNT_KEYS as readonly string[]).includes(key) ? (key as DiscountKey) : null;
}
export function parseDiscountPercent(
  raw: unknown,
  maxPercent: number = DEFAULT_MAX_DISCOUNT_PERCENT
): number {
  if (raw == null || String(raw).trim() === "") return 0;
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  const cap = clampMaxDiscountPercent(maxPercent);
  return Math.min(cap, Math.max(0, parsed));
}
export async function getSchoolMaxDiscountPercent(schoolId: string): Promise<number> {
  const res = await queryDb<{ max_discount_percent: string | number | null }>(
    `SELECT max_discount_percent::text AS max_discount_percent
     FROM schools
     WHERE id = $1
     LIMIT 1`,
    [schoolId]
  );
  return clampMaxDiscountPercent(res.rows[0]?.max_discount_percent);
}
export async function setSchoolMaxDiscountPercent(
  schoolId: string,
  raw: unknown
): Promise<number> {
  const value = clampMaxDiscountPercent(raw);
  await queryDb(
    `UPDATE schools SET max_discount_percent = $2 WHERE id = $1`,
    [schoolId, value]
  );
  return value;
}
export async function getSchoolDiscountSettings(
  schoolId: string
): Promise<SchoolDiscountSettings> {
  const [maxPercent, res] = await Promise.all([
    getSchoolMaxDiscountPercent(schoolId),
    queryDb<{ discount_key: string; percent: string }>(
      `SELECT discount_key, percent::text
       FROM school_discount_settings
       WHERE school_id = $1`,
      [schoolId]
    ),
  ]);
  const settings: SchoolDiscountSettings = {
    ...DEFAULT_SETTINGS,
    maxPercent,
  };
  for (const row of res.rows) {
    const key = parseDiscountKey(row.discount_key);
    if (key) settings[key] = parseDiscountPercent(row.percent, maxPercent);
  }
  return settings;
}
export async function upsertSchoolDiscountSettings(
  schoolId: string,
  settings: Partial<SchoolDiscountSettings>
): Promise<SchoolDiscountSettings> {
  let maxPercent = await getSchoolMaxDiscountPercent(schoolId);
  if (settings.maxPercent != null) {
    maxPercent = await setSchoolMaxDiscountPercent(schoolId, settings.maxPercent);
  }
  for (const key of ALL_DISCOUNT_KEYS) {
    if (settings[key] == null) continue;
    const percent = parseDiscountPercent(settings[key], maxPercent);
    await queryDb(
      `INSERT INTO school_discount_settings (school_id, discount_key, percent, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (school_id, discount_key)
       DO UPDATE SET percent = EXCLUDED.percent, updated_at = NOW()`,
      [schoolId, key, percent]
    );
  }
  return getSchoolDiscountSettings(schoolId);
}
export async function isComplimentaryForParent(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<boolean> {
  const parentId = String(identity.parentId ?? "").trim();
  const parentEmail = normalizeEmail(identity.parentEmail);
  if (!parentId && !parentEmail) return false;
  const res = await queryDb<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM school_complimentary_parents scp
       WHERE scp.school_id = $1
         AND (
           ($2 <> '' AND scp.parent_id = $2)
           OR (
             $3 <> ''
             AND (
               LOWER(BTRIM(COALESCE(scp.parent_email, ''))) = $3
               OR EXISTS (
                 SELECT 1 FROM users u
                 WHERE u.id = scp.parent_id
                   AND LOWER(BTRIM(u.email::text)) = $3
               )
             )
           )
         )
     ) AS exists`,
    [schoolId, parentId, parentEmail]
  );
  return res.rows[0]?.exists === true;
}

/**
 * Wpisy complimentary tylko po e-mailu (bez parent_id) nie mają konta do impersonacji.
 * Podlinkuj istniejące konta albo utwórz konto rodzica ze zgłoszenia.
 */
export async function ensureComplimentaryParentUserAccounts(
  schoolId: string
): Promise<{ linked: number; created: number }> {
  const orphans = await queryDb<{
    id: string;
    parent_email: string;
  }>(
    `SELECT id, parent_email
     FROM school_complimentary_parents
     WHERE school_id = $1
       AND parent_id IS NULL
       AND BTRIM(COALESCE(parent_email, '')) <> ''`,
    [schoolId]
  );

  let linked = 0;
  let created = 0;

  for (const row of orphans.rows) {
    const email = normalizeEmail(row.parent_email);
    if (!email) continue;

    let parentUserId = (await findUserBySchoolAndEmail(schoolId, email))?.id ?? null;

    if (!parentUserId) {
      const enrollment = await queryDb<{
        parent_first_name: string;
        parent_last_name: string;
        parent_phone: string | null;
      }>(
        `SELECT parent_first_name, parent_last_name, parent_phone
         FROM enrollment_requests
         WHERE school_id = $1
           AND LOWER(BTRIM(parent_email::text)) = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId, email]
      );
      const er = enrollment.rows[0];
      if (!er) continue;

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const newUser = await createUser({
        email,
        passwordHash,
        firstName: formatPersonName(er.parent_first_name?.trim() || "Rodzic"),
        lastName: formatPersonName(er.parent_last_name?.trim() || ""),
        role: "PARENT",
        schoolId,
        phone: er.parent_phone ?? null,
        confirmed: false,
        accessLevel: "PENDING",
        mustChangePassword: true,
      });
      parentUserId = newUser.id;
      created += 1;
    } else {
      linked += 1;
    }

    await queryDb(
      `UPDATE enrollment_requests
       SET user_id = $1
       WHERE school_id = $2
         AND user_id IS NULL
         AND LOWER(BTRIM(parent_email::text)) = $3`,
      [parentUserId, schoolId, email]
    );

    await queryDb(
      `UPDATE school_complimentary_parents
       SET parent_id = $1, parent_email = NULL
       WHERE id = $2 AND school_id = $3`,
      [parentUserId, row.id, schoolId]
    );
  }

  return { linked, created };
}

export async function listComplimentaryParents(
  schoolId: string
): Promise<ComplimentaryParentRow[]> {
  await ensureComplimentaryParentUserAccounts(schoolId);

  const res = await queryDb<{
    id: string;
    parent_id: string | null;
    parent_email: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>(
    `SELECT
       scp.id,
       scp.parent_id,
       scp.parent_email,
       COALESCE(u.first_name, er.parent_first_name, '') AS first_name,
       COALESCE(u.last_name, er.parent_last_name, '') AS last_name,
       COALESCE(u.email, scp.parent_email, er.parent_email, '') AS email
     FROM school_complimentary_parents scp
     LEFT JOIN users u ON u.id = scp.parent_id
     LEFT JOIN LATERAL (
       SELECT parent_first_name, parent_last_name, parent_email
       FROM enrollment_requests er
       WHERE er.school_id = scp.school_id
         AND (
           (scp.parent_email IS NOT NULL AND LOWER(BTRIM(er.parent_email::text)) = LOWER(BTRIM(scp.parent_email)))
           OR (scp.parent_id IS NOT NULL AND er.user_id = scp.parent_id)
         )
       ORDER BY er.created_at DESC
       LIMIT 1
     ) er ON TRUE
     WHERE scp.school_id = $1
     ORDER BY COALESCE(u.last_name, er.parent_last_name, ''), COALESCE(u.first_name, er.parent_first_name, '')`,
    [schoolId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    source: row.parent_id ? "USER" : "ENROLLMENT",
    parentId: row.parent_id,
    parentEmail: row.parent_email,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    email: row.email ?? "",
  }));
}
export async function listComplimentaryCandidates(
  schoolId: string
): Promise<ComplimentaryCandidate[]> {
  const usersRes = await queryDb<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.email
     FROM users u
     WHERE u.school_id = $1
       AND UPPER(u.role) = 'PARENT'
       AND u.active = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM school_complimentary_parents scp
         WHERE scp.school_id = $1
           AND (
             scp.parent_id = u.id
             OR LOWER(BTRIM(COALESCE(scp.parent_email, ''))) = LOWER(BTRIM(u.email::text))
           )
       )
     ORDER BY u.last_name, u.first_name`,
    [schoolId]
  );
  const enrollmentRes = await queryDb<{
    parent_email: string;
    parent_first_name: string;
    parent_last_name: string;
  }>(
    `SELECT
       LOWER(BTRIM(er.parent_email::text)) AS email_key,
       MAX(er.parent_email) AS parent_email,
       MAX(er.parent_first_name) AS parent_first_name,
       MAX(er.parent_last_name) AS parent_last_name
     FROM enrollment_requests er
     WHERE er.school_id = $1
       AND BTRIM(COALESCE(er.parent_email::text, '')) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM school_complimentary_parents scp
         WHERE scp.school_id = $1
           AND (
             LOWER(BTRIM(COALESCE(scp.parent_email, ''))) = LOWER(BTRIM(er.parent_email::text))
             OR EXISTS (
               SELECT 1 FROM users u
               WHERE u.id = scp.parent_id
                 AND LOWER(BTRIM(u.email::text)) = LOWER(BTRIM(er.parent_email::text))
             )
           )
       )
       AND NOT EXISTS (
         SELECT 1 FROM users u
         WHERE u.school_id = $1
           AND UPPER(u.role) = 'PARENT'
           AND u.active = TRUE
           AND LOWER(BTRIM(u.email::text)) = LOWER(BTRIM(er.parent_email::text))
       )
     GROUP BY LOWER(BTRIM(er.parent_email::text))
     ORDER BY MAX(er.parent_last_name), MAX(er.parent_first_name)`,
    [schoolId]
  );
  const users: ComplimentaryCandidate[] = usersRes.rows.map((row) => ({
    key: `user:${row.id}`,
    source: "USER",
    parentId: row.id,
    parentEmail: null,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
  }));
  const enrollments: ComplimentaryCandidate[] = enrollmentRes.rows.map((row) => ({
    key: `enrollment:${normalizeEmail(row.parent_email)}`,
    source: "ENROLLMENT",
    parentId: null,
    parentEmail: row.parent_email,
    firstName: row.parent_first_name,
    lastName: row.parent_last_name,
    email: row.parent_email,
  }));
  return [...users, ...enrollments];
}
export async function addComplimentaryParent(
  schoolId: string,
  input: { parentId?: string | null; parentEmail?: string | null }
): Promise<void> {
  const parentId = String(input.parentId ?? "").trim();
  const parentEmail = normalizeEmail(input.parentEmail);
  if (parentId) {
    const userRes = await queryDb<{ id: string; role: string; email: string }>(
      `SELECT id, role, email FROM users WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [parentId, schoolId]
    );
    const user = userRes.rows[0];
    if (!user || String(user.role).toUpperCase() !== "PARENT") {
      throw new Error("Wybrany użytkownik nie jest rodzicem tej szkoły");
    }
    await queryDb(
      `INSERT INTO school_complimentary_parents (school_id, parent_id)
       SELECT $1, $2
       WHERE NOT EXISTS (
         SELECT 1 FROM school_complimentary_parents
         WHERE school_id = $1 AND parent_id = $2
       )`,
      [schoolId, parentId]
    );
    const userEmail = normalizeEmail(user.email);
    if (userEmail) {
      await queryDb(
        `DELETE FROM school_complimentary_parents
         WHERE school_id = $1
           AND LOWER(BTRIM(COALESCE(parent_email, ''))) = $2`,
        [schoolId, userEmail]
      );
      await queryDb(
        `UPDATE enrollment_requests
         SET user_id = $1
         WHERE school_id = $2
           AND user_id IS NULL
           AND LOWER(BTRIM(parent_email::text)) = $3`,
        [parentId, schoolId, userEmail]
      );
    }
    // Włączenie trybu bez opłat → karty dzieci ze zgłoszeń (bez czekania na grupę).
    await ensureChildrenFromEnrollmentRequests(schoolId, parentId);
    return;
  }
  if (!parentEmail) {
    throw new Error("Wybierz rodzica lub podaj e-mail ze zgłoszenia");
  }
  const existingUserRes = await queryDb<{ id: string }>(
    `SELECT id FROM users
     WHERE school_id = $1
       AND UPPER(role) = 'PARENT'
       AND active = TRUE
       AND LOWER(BTRIM(email::text)) = $2
     LIMIT 1`,
    [schoolId, parentEmail]
  );
  const existingUserId = existingUserRes.rows[0]?.id;
  if (existingUserId) {
    await addComplimentaryParent(schoolId, { parentId: existingUserId });
    return;
  }

  const enrollmentRes = await queryDb<{
    parent_first_name: string;
    parent_last_name: string;
    parent_phone: string | null;
  }>(
    `SELECT parent_first_name, parent_last_name, parent_phone
     FROM enrollment_requests
     WHERE school_id = $1
       AND LOWER(BTRIM(parent_email::text)) = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [schoolId, parentEmail]
  );
  const enrollment = enrollmentRes.rows[0];
  if (!enrollment) {
    throw new Error("Brak zgłoszenia z tym adresem e-mail");
  }

  // Utwórz konto rodzica od razu — inaczej nie widać go na liście użytkowników / impersonacji.
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const newUser = await createUser({
    email: parentEmail,
    passwordHash,
    firstName: formatPersonName(enrollment.parent_first_name?.trim() || "Rodzic"),
    lastName: formatPersonName(enrollment.parent_last_name?.trim() || ""),
    role: "PARENT",
    schoolId,
    phone: enrollment.parent_phone ?? null,
    confirmed: false,
    accessLevel: "PENDING",
    mustChangePassword: true,
  });

  await queryDb(
    `UPDATE enrollment_requests
     SET user_id = $1
     WHERE school_id = $2
       AND user_id IS NULL
       AND LOWER(BTRIM(parent_email::text)) = $3`,
    [newUser.id, schoolId, parentEmail]
  );

  await addComplimentaryParent(schoolId, { parentId: newUser.id });
}
export async function removeComplimentaryParent(
  schoolId: string,
  input: { id?: string | null; parentId?: string | null; parentEmail?: string | null }
): Promise<void> {
  const id = String(input.id ?? "").trim();
  const parentId = String(input.parentId ?? "").trim();
  const parentEmail = normalizeEmail(input.parentEmail);
  if (id) {
    await queryDb(
      `DELETE FROM school_complimentary_parents WHERE school_id = $1 AND id = $2`,
      [schoolId, id]
    );
    return;
  }
  if (parentId) {
    await queryDb(
      `DELETE FROM school_complimentary_parents WHERE school_id = $1 AND parent_id = $2`,
      [schoolId, parentId]
    );
    await queryDb(
      `DELETE FROM school_complimentary_parents scp
       WHERE scp.school_id = $1
         AND BTRIM(COALESCE(scp.parent_email, '')) <> ''
         AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = $2
             AND LOWER(BTRIM(u.email::text)) = LOWER(BTRIM(scp.parent_email))
         )`,
      [schoolId, parentId]
    );
    return;
  }
  if (parentEmail) {
    await queryDb(
      `DELETE FROM school_complimentary_parents
       WHERE school_id = $1 AND LOWER(BTRIM(parent_email::text)) = $2`,
      [schoolId, parentEmail]
    );
    await queryDb(
      `DELETE FROM school_complimentary_parents scp
       WHERE scp.school_id = $1
         AND scp.parent_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = scp.parent_id
             AND LOWER(BTRIM(u.email::text)) = $2
         )`,
      [schoolId, parentEmail]
    );
  }
}
