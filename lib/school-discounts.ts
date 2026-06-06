import { queryDb } from "@/lib/db";
import {
  applyDiscountsToAmount,
  DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  type DiscountKey,
} from "@/lib/discount-math";
import type { ComplimentaryCandidate, ComplimentaryParentRow } from "@/lib/complimentary-parent-list";

export { applyDiscountsToAmount, DISCOUNT_KEYS, DISCOUNT_LABELS, type DiscountKey };
export type { ComplimentaryCandidate, ComplimentaryParentRow };

export const ALL_DISCOUNT_KEYS: DiscountKey[] = [
  DISCOUNT_KEYS.LARGE_FAMILY_CARD,
  DISCOUNT_KEYS.SIBLING,
];



export type SchoolDiscountSettings = Record<DiscountKey, number>;



const DEFAULT_SETTINGS: SchoolDiscountSettings = {

  LARGE_FAMILY_CARD: 0,

  SIBLING: 0,

};



function normalizeEmail(email: string | null | undefined): string {

  return String(email ?? "").trim().toLowerCase();

}



export function parseDiscountKey(raw: unknown): DiscountKey | null {

  const key = String(raw ?? "").trim().toUpperCase();

  return (ALL_DISCOUNT_KEYS as readonly string[]).includes(key) ? (key as DiscountKey) : null;

}



export function parseDiscountPercent(raw: unknown): number {

  if (raw == null || String(raw).trim() === "") return 0;

  const parsed = Number(String(raw).replace(",", "."));

  if (!Number.isFinite(parsed)) return 0;

  return Math.min(100, Math.max(0, parsed));

}



export async function getSchoolDiscountSettings(

  schoolId: string

): Promise<SchoolDiscountSettings> {

  const res = await queryDb<{ discount_key: string; percent: string }>(

    `SELECT discount_key, percent::text

     FROM school_discount_settings

     WHERE school_id = $1`,

    [schoolId]

  );

  const settings: SchoolDiscountSettings = { ...DEFAULT_SETTINGS };

  for (const row of res.rows) {

    const key = parseDiscountKey(row.discount_key);

    if (key) settings[key] = parseDiscountPercent(row.percent);

  }

  return settings;

}



export async function upsertSchoolDiscountSettings(

  schoolId: string,

  settings: Partial<SchoolDiscountSettings>

): Promise<SchoolDiscountSettings> {

  for (const key of ALL_DISCOUNT_KEYS) {

    if (settings[key] == null) continue;

    const percent = parseDiscountPercent(settings[key]);

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



export async function listComplimentaryParents(

  schoolId: string

): Promise<ComplimentaryParentRow[]> {

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

    return;

  }



  if (!parentEmail) {

    throw new Error("Wybierz rodzica lub podaj e-mail ze zgłoszenia");

  }



  const enrollmentRes = await queryDb<{ exists: boolean }>(

    `SELECT EXISTS (

       SELECT 1 FROM enrollment_requests

       WHERE school_id = $1

         AND LOWER(BTRIM(parent_email::text)) = $2

     ) AS exists`,

    [schoolId, parentEmail]

  );

  if (!enrollmentRes.rows[0]?.exists) {

    throw new Error("Brak zgłoszenia z tym adresem e-mail");

  }



  await queryDb(
    `INSERT INTO school_complimentary_parents (school_id, parent_email)
     SELECT $1, $2
     WHERE NOT EXISTS (
       SELECT 1 FROM school_complimentary_parents
       WHERE school_id = $1
         AND LOWER(BTRIM(COALESCE(parent_email, ''))) = $2
     )`,
    [schoolId, parentEmail]
  );

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

    return;

  }



  if (parentEmail) {

    await queryDb(

      `DELETE FROM school_complimentary_parents

       WHERE school_id = $1 AND LOWER(BTRIM(parent_email::text)) = $2`,

      [schoolId, parentEmail]

    );

  }

}



