import { randomUUID } from "crypto";
import {
  Pool,
  types,
  type PoolClient,
  type QueryResultRow,
} from "pg";
import {
  childEnrollmentIdentityKey,
  DuplicateEnrollmentError,
} from "@/lib/enrollment-duplicate";
import { formatPersonName } from "@/lib/format-person-name";
import { phonesMatch } from "@/lib/phone";
import {
  allocateChildClientNumber,
  allocateParentClientNumber,
} from "@/lib/client-numbers";
import { pgDateToYmd } from "@/lib/school-timezone";

export { DuplicateEnrollmentError } from "@/lib/enrollment-duplicate";

/**
 * DATE z Postgresa jako string `YYYY-MM-DD` — bez Date o lokalnej północy,
 * która przy `toISOString()` cofa dzień w Europe/Warsaw.
 */
types.setTypeParser(types.builtins.DATE, (val) => val);

/** Domyślna szkoła z env — multi-tenant (pusty string gdy brak `SCHOOL_ID`). */
export const DEFAULT_SCHOOL_ID = process.env.SCHOOL_ID || "";

/**
 * Fragment SQL zamieniający `st.day_of_week` (1..7) na polską nazwę dnia.
 * Wymaga aliasu tabeli `st` (schedule_templates st). Używaj wszędzie tam,
 * gdzie składasz `schedule` z numeru dnia + godziny — żeby w UI/mailach
 * pojawiało się „Poniedziałek 16:00" zamiast „1 16:00".
 */
export const POLISH_DAY_FROM_ST_SQL = `
  CASE st.day_of_week
    WHEN 1 THEN 'Poniedziałek'
    WHEN 2 THEN 'Wtorek'
    WHEN 3 THEN 'Środa'
    WHEN 4 THEN 'Czwartek'
    WHEN 5 THEN 'Piątek'
    WHEN 6 THEN 'Sobota'
    WHEN 7 THEN 'Niedziela'
    ELSE CONCAT('Dzień ', st.day_of_week)
  END`;

/** Szkoła dla rejestracji i publicznych endpointów (np. produkcja harry-english.pl). */
export function getRegistrationSchoolId(): string {
  const raw = process.env.SCHOOL_ID?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_SCHOOL_ID;
}

/** Dozwolone wartości kolumny `users.role` (TEXT w PostgreSQL). */
export const USER_ROLES = [
  "ADMIN",
  "MANAGER",
  "TEACHER",
  "PARENT",
  "CHILD",
  "ACCOUNTANT",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function parseUserRole(raw: string | null | undefined): UserRole | null {
  if (raw == null || String(raw).trim() === "") return null;
  const u = String(raw).trim().toUpperCase();
  return (USER_ROLES as readonly string[]).includes(u) ? (u as UserRole) : null;
}

/** Poziom dostępu konta rodzica — uproszczony model (aktywacja konta). */
export type AccessLevel = "PENDING" | "ACTIVE";

/** Stan dziecka w procesie zapisu (`children.access_level`). */
export type ChildAccessLevel =
  | "NEW"
  | "PROPOSED"
  | "NEGOTIATING"
  | "ACCEPTED"
  | "SIGNED"
  | "COMPLETED"
  | "REJECTED";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
    const opts = u.searchParams.get("options") ?? "";
    if (!/TimeZone\s*=/i.test(opts)) {
      const tzOpt = "-c TimeZone=Europe/Warsaw";
      u.searchParams.set("options", opts ? `${opts} ${tzOpt}` : tzOpt);
    }
    const proto = url.startsWith("postgresql:") ? "postgresql:" : "postgres:";
    return `${proto}${u.toString().slice("http:".length)}`;
  } catch {
    return url;
  }
}

const connectionString = getConnectionString();

function pgNeedsSsl(url: string): boolean {
  try {
    const u = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
    const h = u.hostname.toLowerCase();
    return h !== "localhost" && h !== "127.0.0.1";
  } catch {
    return true;
  }
}

const pool = new Pool({
  connectionString,
  ssl: pgNeedsSsl(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

/** Dodatkowo na każdej nowej sesji (pasuje do ALTER DATABASE timezone). */
pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'Europe/Warsaw'").catch((err) => {
    console.error("SET TIME ZONE Europe/Warsaw failed:", err);
  });
});

export interface User {
  id: string;
  /** NULL wyłącznie dla roli ADMIN (globalny super admin). */
  school_id: string | null;
  email: string;
  password_hash: string;
  role: UserRole;
  access_level: AccessLevel;
  first_name: string;
  last_name: string;
  phone: string | null;
  active: boolean;
  confirmed: boolean;
  must_change_password: boolean;
  /** Stały numer klienta rodzica (5 cyfr), null dla innych ról / przed backfillem. */
  client_number: string | null;
  reset_token: string | null;
  reset_token_expiry: Date | null;
  resignation_date: Date | null;
  last_login: Date | null;
  created_at: Date;
}

export interface Child {
  id: string;
  school_id: string;
  parent_id: string;
  /** Stały numer dziecka: {parent}/{seq}, np. 00001/1 */
  client_number: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  avatar_url: string | null;
  xp_total: number;
  active: boolean;
  confirmed: boolean;
  enrollment_request_id: string | null;
  access_level: ChildAccessLevel;
  resignation_requested: boolean;
  resignation_reason: string | null;
  resignation_date: Date | null;
  created_at: Date;
  /** Indywidualne nadpisanie stawek (null = cennik grupy / zapis) */
  lesson_unit_price: string | null;
  monthly_unit_price: string | null;
  yearly_unit_price: string | null;
}

type UserRow = QueryResultRow & {
  id: string;
  school_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string | null;
  active: boolean;
  confirmed: boolean;
  must_change_password?: boolean;
  reset_token: string | null;
  reset_token_expiry: Date | null;
  resignation_date: Date | null;
  last_login: Date | null;
  created_at: Date;
};

let staffAdminEmailCache: Set<string> | null = null;
let staffManagerEmailCache: Set<string> | null = null;

/** Maile super admina — wymuszają rolę ADMIN przy błędnym `role` w DB. */
function staffAdminEmailSet(): Set<string> {
  if (staffAdminEmailCache) return staffAdminEmailCache;
  const raw =
    process.env.STAFF_ADMIN_EMAILS ??
    process.env.ADMIN_STAFF_EMAILS ??
    "";
  staffAdminEmailCache = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return staffAdminEmailCache;
}

/** Maile zarządcy szkoły — wymuszają rolę MANAGER. */
function staffManagerEmailSet(): Set<string> {
  if (staffManagerEmailCache) return staffManagerEmailCache;
  const raw = process.env.STAFF_MANAGER_EMAILS ?? "";
  staffManagerEmailCache = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return staffManagerEmailCache;
}

/**
 * `STAFF_ADMIN_EMAILS` → ADMIN, `STAFF_MANAGER_EMAILS` → MANAGER (nadpisują kolumnę `role`),
 * potem parsowanie kolumny `role`.
 */
function resolveUserRoleFromRow(row: QueryResultRow): UserRole {
  const emailNorm =
    row.email != null ? String(row.email).trim().toLowerCase() : "";
  if (emailNorm && staffAdminEmailSet().has(emailNorm)) {
    return "ADMIN";
  }
  if (emailNorm && staffManagerEmailSet().has(emailNorm)) {
    return "MANAGER";
  }

  const raw = row.role != null ? String(row.role).trim() : "";
  const parsed = parseUserRole(raw);
  if (parsed) return parsed;

  return "PARENT";
}

type ChildRow = QueryResultRow & {
  id: string;
  school_id: string;
  parent_id: string;
  client_number?: string | null;
  first_name: string;
  last_name: string;
  birth_date: Date | string;
  avatar_url: string | null;
  xp_total: number;
  active: boolean;
  confirmed: boolean;
  enrollment_request_id: string | null;
  access_level?: string | null;
  resignation_requested: boolean;
  resignation_reason: string | null;
  resignation_date: Date | null;
  created_at: Date;
  lesson_unit_price?: string | number | null;
  monthly_unit_price?: string | number | null;
  yearly_unit_price?: string | number | null;
};

function mapUserRow(row: QueryResultRow): User {
  const role = resolveUserRoleFromRow(row);
  const rawSid = row.school_id as string | null | undefined;
  const hasSid = rawSid != null && String(rawSid).trim() !== "";
  const school_id = hasSid
    ? String(rawSid)
    : role === "ADMIN"
      ? null
      : DEFAULT_SCHOOL_ID;
  return {
    id: row.id as string,
    school_id,
    email: row.email as string,
    password_hash: row.password_hash as string,
    role,
    access_level: (row.access_level as AccessLevel | undefined) ?? "PENDING",
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    phone: row.phone != null ? (row.phone as string) : null,
    active: row.active === undefined ? true : Boolean(row.active),
    confirmed: Boolean(row.confirmed),
    must_change_password: Boolean(row.must_change_password),
    client_number:
      row.client_number != null && String(row.client_number).trim() !== ""
        ? String(row.client_number)
        : null,
    reset_token: row.reset_token != null ? (row.reset_token as string) : null,
    reset_token_expiry: (row.reset_token_expiry as Date | null) ?? null,
    resignation_date: (row.resignation_date as Date | null) ?? null,
    last_login: (row.last_login as Date | null) ?? null,
    created_at: row.created_at as Date,
  };
}

function birthDateToIso(d: Date | string): string {
  return pgDateToYmd(d) ?? String(d).slice(0, 10);
}

function priceFieldToText(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function mapChildRow(row: ChildRow): Child {
  return {
    id: row.id,
    school_id: row.school_id,
    parent_id: row.parent_id,
    client_number:
      row.client_number != null && String(row.client_number).trim() !== ""
        ? String(row.client_number)
        : null,
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date: birthDateToIso(row.birth_date),
    avatar_url: row.avatar_url,
    xp_total: row.xp_total,
    active: row.active,
    confirmed: row.confirmed ?? false,
    enrollment_request_id: row.enrollment_request_id ?? null,
    access_level: (row.access_level as ChildAccessLevel | undefined) ?? "NEW",
    resignation_requested: row.resignation_requested,
    resignation_reason: row.resignation_reason,
    resignation_date: row.resignation_date,
    created_at: row.created_at,
    lesson_unit_price: priceFieldToText(row.lesson_unit_price),
    monthly_unit_price: priceFieldToText(row.monthly_unit_price),
    yearly_unit_price: priceFieldToText(row.yearly_unit_price),
  };
}

// --- Users ---

export async function getUserByEmail(email: string): Promise<User | null> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE LOWER(email::text) = LOWER($1::text)
       AND (
         school_id IS NOT DISTINCT FROM $2::text
         OR (role = 'ADMIN' AND school_id IS NULL)
       )
     ORDER BY
       CASE WHEN school_id IS NOT DISTINCT FROM $2::text THEN 0 ELSE 1 END
     LIMIT 1`,
    [email, getRegistrationSchoolId()]
  );
  return r.rows[0] ? mapUserRow(r.rows[0]) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return r.rows[0] ? mapUserRow(r.rows[0]) : null;
}

/** Tenant scope for admin panel APIs: MANAGER is bound to actor.school_id; ADMIN is global (no school filter on reads). */
export type ResolvedAdminPanelTenant =
  | { role: "MANAGER"; tenantSchoolId: string }
  | { role: "ADMIN"; tenantSchoolId: null };

/** Szkoła dla list użytkowników w panelu — manager: z konta; admin: env / rejestracja. */
export function resolveAdminUsersSchoolScope(
  tenant: ResolvedAdminPanelTenant
): string {
  if (tenant.role === "MANAGER") return tenant.tenantSchoolId;
  return getRegistrationSchoolId() || DEFAULT_SCHOOL_ID;
}

export async function resolveAdminPanelTenant(
  userId: string
): Promise<
  | { ok: true; tenant: ResolvedAdminPanelTenant }
  | { ok: false; status: number; message: string }
> {
  const actor = await getUserById(userId);
  if (!actor) {
    return { ok: false, status: 401, message: "Nie znaleziono użytkownika" };
  }
  if (actor.role === "MANAGER") {
    if (!actor.school_id) {
      return {
        ok: false,
        status: 400,
        message: "Konto zarządcy nie ma przypisanej szkoły.",
      };
    }
    return {
      ok: true,
      tenant: { role: "MANAGER", tenantSchoolId: actor.school_id },
    };
  }
  if (actor.role === "ADMIN") {
    return { ok: true, tenant: { role: "ADMIN", tenantSchoolId: null } };
  }
  return { ok: false, status: 403, message: "Brak uprawnień" };
}

export async function emailExists(
  email: string,
  schoolId: string = DEFAULT_SCHOOL_ID
): Promise<boolean> {
  const r = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM users
       WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
     ) AS exists`,
    [schoolId, email]
  );
  return Boolean(r.rows[0]?.exists);
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  /** Dla ADMIN można pominąć lub podać null (tylko ADMIN może mieć school_id NULL w bazie). */
  schoolId?: string | null;
  phone?: string | null;
  confirmed?: boolean;
  accessLevel?: AccessLevel;
  mustChangePassword?: boolean;
}): Promise<User> {
  const firstName = formatPersonName(data.firstName);
  const lastName = formatPersonName(data.lastName);
  const id = randomUUID();
  const role = data.role ?? "PARENT";
  const confirmed = data.confirmed ?? false;
  const accessLevel =
    data.accessLevel ?? (role === "PARENT" ? "PENDING" : "ACTIVE");
  const mustChangePassword = data.mustChangePassword ?? false;

  let insertSchoolId: string | null;
  if (role === "ADMIN") {
    const raw = data.schoolId;
    insertSchoolId =
      raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
  } else {
    if (data.schoolId == null || String(data.schoolId).trim() === "") {
      throw new Error("Brak identyfikatora szkoły — użytkownik musi należeć do szkoły");
    }
    insertSchoolId = String(data.schoolId).trim();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (insertSchoolId != null) {
      await ensureDefaultSchoolRow(client, insertSchoolId);
    }

    let clientNumber: string | null = null;
    if (role === "PARENT" && insertSchoolId != null) {
      clientNumber = await allocateParentClientNumber(client, insertSchoolId);
    }

    const r = await client.query<UserRow>(
      `INSERT INTO users (
         id, school_id, email, password_hash, role,
         first_name, last_name, phone, active, confirmed, access_level,
         client_number
       ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9, $10, $11)
       RETURNING *`,
      [
        id,
        insertSchoolId,
        data.email,
        data.passwordHash,
        role,
        firstName,
        lastName,
        data.phone ?? null,
        confirmed,
        accessLevel,
        clientNumber,
      ]
    );
    if (role === "PARENT" && insertSchoolId != null) {
      await insertParentProfileInTx(client, id, insertSchoolId, data.email);
    }
    if (mustChangePassword) {
      await client.query(
        `UPDATE users SET must_change_password = TRUE WHERE id = $1`,
        [id]
      );
      (r.rows[0] as UserRow).must_change_password = true;
    }
    await client.query("COMMIT");
    return mapUserRow(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateUser(
  userId: string,
  data: Partial<{
    first_name: string;
    last_name: string;
    email: string;
    role: UserRole;
    confirmed: boolean;
    phone: string | null;
  }>
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.first_name !== undefined) {
    sets.push(`first_name = $${i++}`);
    vals.push(formatPersonName(data.first_name));
  }
  if (data.last_name !== undefined) {
    sets.push(`last_name = $${i++}`);
    vals.push(formatPersonName(data.last_name));
  }
  if (data.email !== undefined) {
    sets.push(`email = $${i++}`);
    vals.push(data.email.toLowerCase());
  }
  if (data.role !== undefined) {
    sets.push(`role = $${i++}`);
    vals.push(data.role);
  }
  if (data.confirmed !== undefined) {
    sets.push(`confirmed = $${i++}`);
    vals.push(data.confirmed);
  }
  if (data.phone !== undefined) {
    sets.push(`phone = $${i++}`);
    vals.push(data.phone);
  }

  if (sets.length === 0) return false;

  vals.push(userId);
  const q = `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`;
  const r = await pool.query(q, vals);
  return (r.rowCount ?? 0) > 0;
}

export async function updateLastLogin(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET last_login = NOW() WHERE id = $1`,
    [userId]
  );
}

/** Znajdź użytkownika po (school_id, email). Używane przy „Wyślij propozycję" — sprawdzenie czy rodzic już ma konto. */
export async function findUserBySchoolAndEmail(
  schoolId: string,
  email: string
): Promise<User | null> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
     LIMIT 1`,
    [schoolId, email]
  );
  return r.rows[0] ? mapUserRow(r.rows[0]) : null;
}

/** Czyści flagę must_change_password po skutecznej zmianie hasła przez użytkownika. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET must_change_password = FALSE WHERE id = $1`,
    [userId]
  );
}

/** Aktualizuje hash hasła użytkownika. */
export async function updateUserPasswordHash(
  userId: string,
  passwordHash: string
): Promise<void> {
  await pool.query(
    `UPDATE users SET password_hash = $2 WHERE id = $1`,
    [userId, passwordHash]
  );
}

export async function getAllUsers(
  schoolId: string = DEFAULT_SCHOOL_ID
): Promise<User[]> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users WHERE school_id = $1 ORDER BY created_at DESC`,
    [schoolId]
  );
  return r.rows.map(mapUserRow);
}

export async function getUsersByRole(
  role: UserRole,
  schoolId: string = DEFAULT_SCHOOL_ID
): Promise<User[]> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE school_id = $1 AND role = $2
     ORDER BY created_at DESC`,
    [schoolId, role]
  );
  return r.rows.map(mapUserRow);
}

/**
 * @param tenantSchoolId Szkoła zakresu (np. managera). `undefined` → `DEFAULT_SCHOOL_ID`.
 *        `null` → tylko wiersz z `school_id IS NULL` (np. globalny ADMIN).
 */
export async function deleteUser(
  userId: string,
  tenantSchoolId?: string | null
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schoolScope =
      tenantSchoolId === undefined ? DEFAULT_SCHOOL_ID : tenantSchoolId;
    if (schoolScope != null) {
      await client.query(
        `UPDATE children
         SET active = FALSE, resignation_date = COALESCE(resignation_date, NOW())
         WHERE parent_id = $1 AND school_id = $2 AND active = TRUE`,
        [userId, schoolScope]
      );
    }
    const u =
      schoolScope === null
        ? await client.query(
            `UPDATE users
             SET active = FALSE, resignation_date = NOW()
             WHERE id = $1 AND school_id IS NULL
             RETURNING id`,
            [userId]
          )
        : await client.query(
            `UPDATE users
             SET active = FALSE, resignation_date = NOW()
             WHERE id = $1 AND school_id = $2
             RETURNING id`,
            [userId, schoolScope]
          );
    await client.query("COMMIT");
    return (u.rowCount ?? 0) > 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** @param tenantSchoolId Jak w `deleteUser`. */
export async function restoreUser(
  userId: string,
  tenantSchoolId?: string | null
): Promise<boolean> {
  const schoolScope =
    tenantSchoolId === undefined ? DEFAULT_SCHOOL_ID : tenantSchoolId;
  const r =
    schoolScope === null
      ? await pool.query(
          `UPDATE users
           SET active = TRUE, resignation_date = NULL
           WHERE id = $1 AND school_id IS NULL
           RETURNING id`,
          [userId]
        )
      : await pool.query(
          `UPDATE users
           SET active = TRUE, resignation_date = NULL
           WHERE id = $1 AND school_id = $2
           RETURNING id`,
          [userId, schoolScope]
        );
  return (r.rowCount ?? 0) > 0;
}

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const r = await pool.query<QueryResultRow>(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const row = r.rows[0];
    if (!row) return false;
    return resolveUserRoleFromRow(row) === "ADMIN";
  } catch {
    return false;
  }
}

/** Panel szkoły (`/api/admin/*`, `AdminPortal`) — super admin lub zarządca szkoły. */
export async function canAccessSchoolAdminApis(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  if (!u) return false;
  return u.role === "ADMIN" || u.role === "MANAGER";
}

export async function setResetToken(
  email: string,
  token: string,
  expiry: Date
): Promise<void> {
  const tenant = getRegistrationSchoolId();
  await pool.query(
    `UPDATE users
     SET reset_token = $1, reset_token_expiry = $2
     WHERE LOWER(email::text) = LOWER($4::text)
       AND (
         school_id IS NOT DISTINCT FROM $3::text
         OR (role = 'ADMIN' AND school_id IS NULL)
       )`,
    [token, expiry, tenant, email]
  );
}

export async function setResetTokenByUserId(
  userId: string,
  token: string,
  expiry: Date
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE users
     SET reset_token = $1, reset_token_expiry = $2
     WHERE id = $3
     RETURNING id`,
    [token, expiry, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function clearResetTokenByUserId(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET reset_token = NULL,
         reset_token_expiry = NULL
     WHERE id = $1`,
    [userId]
  );
}

export async function getUserByResetToken(token: string): Promise<User | null> {
  const r = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE reset_token = $1
       AND reset_token_expiry IS NOT NULL
       AND reset_token_expiry > NOW()
     LIMIT 1`,
    [token]
  );
  return r.rows[0] ? mapUserRow(r.rows[0]) : null;
}

export async function resetPassword(
  token: string,
  newPasswordHash: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         reset_token = NULL,
         reset_token_expiry = NULL,
         must_change_password = FALSE
     WHERE reset_token = $2
       AND reset_token_expiry IS NOT NULL
       AND reset_token_expiry > NOW()
     RETURNING id`,
    [newPasswordHash, token]
  );
  return (r.rowCount ?? 0) > 0;
}

// --- Children ---

export async function createChild(data: {
  schoolId?: string;
  parentId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  avatarUrl?: string | null;
  accessLevel?: ChildAccessLevel;
}): Promise<Child> {
  const firstName = formatPersonName(data.firstName);
  const lastName = formatPersonName(data.lastName);
  const id = randomUUID();
  const schoolId = data.schoolId ?? DEFAULT_SCHOOL_ID;
  const accessLevel = data.accessLevel ?? "NEW";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const childClientNumber = await allocateChildClientNumber(
      client,
      schoolId,
      data.parentId
    );
    const r = await client.query<ChildRow>(
      `INSERT INTO children (
         id, school_id, parent_id, client_number, first_name, last_name, birth_date,
         avatar_url, confirmed, access_level
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, FALSE, $9)
       RETURNING *`,
      [
        id,
        schoolId,
        data.parentId,
        childClientNumber,
        firstName,
        lastName,
        data.birthDate.slice(0, 10),
        data.avatarUrl ?? null,
        accessLevel,
      ]
    );
    await client.query("COMMIT");
    return mapChildRow(r.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Gdy w `users` jest `school_id` (FK do `schools`), rejestracja wymaga istniejącego rekordu szkoły.
 * Brak seeda w repo — tworzymy domyślną szkołę idempotentnie przed pierwszym rodzicem.
 */
type PgQueryable = Pick<Pool, "query">;

async function ensureDefaultSchoolRow(
  executor: PgQueryable | PoolClient,
  schoolId: string
): Promise<void> {
  // Osobne $1 / $3 dla id i slug — ten sam parametr dwa razy daje błąd „text vs varchar” przy $1, gdy kolumny mają różne typy.
  await executor.query(
    `INSERT INTO schools (id, name, slug, timezone, active)
     VALUES ($1, $2, $3, 'Europe/Warsaw', TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [schoolId, "Harry English", schoolId]
  );
}

/** Pusty profil rodzica — to samo co INSERT w specyfikacji rejestracji (transakcja z `users`). */
async function insertParentProfileInTx(
  client: PoolClient,
  userId: string,
  schoolId: string,
  parentEmail?: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO parent_profiles (id, user_id, school_id, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())`,
    [userId, schoolId]
  );

  const email = String(parentEmail ?? "").trim().toLowerCase();
  if (!email) return;

  // Staging KDR ze zgłoszeń → profil przy tworzeniu konta.
  await client.query(
    `UPDATE parent_profiles pp
     SET discount_large_family = TRUE,
         updated_at = NOW()
     WHERE pp.user_id = $1
       AND EXISTS (
         SELECT 1
         FROM enrollment_requests er
         WHERE er.school_id = $2
           AND er.discount_large_family = TRUE
           AND LOWER(BTRIM(er.parent_email::text)) = $3
       )`,
    [userId, schoolId, email]
  );
}

export type ParentProfile = {
  id: string;
  user_id: string;
  school_id: string;
  address: string | null;
  city: string | null;
  zip_code: string | null;
  company_name: string | null;
  nip: string | null;
  pesel: string | null;
  discount_large_family: boolean;
  created_at: Date;
  updated_at: Date;
};

const PARENT_PROFILE_SELECT = `id, user_id, school_id, address, city, zip_code,
  company_name, nip, pesel, discount_large_family, created_at, updated_at`;

export async function getParentProfileByUserId(userId: string): Promise<ParentProfile | null> {
  const r = await pool.query<ParentProfile>(
    `SELECT ${PARENT_PROFILE_SELECT}
     FROM parent_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

/**
 * Aktualizuje profil rodzica; jeśli brak wiersza (np. dane sprzed migracji), tworzy go.
 */
export async function upsertParentProfileForUser(params: {
  userId: string;
  schoolId: string;
  address?: string | null;
  city?: string | null;
  zip_code?: string | null;
  company_name?: string | null;
  nip?: string | null;
  pesel?: string | null;
  discount_large_family?: boolean;
}): Promise<ParentProfile | null> {
  const { userId, schoolId } = params;
  const existing = await getParentProfileByUserId(userId);
  const address = params.address !== undefined ? params.address : existing?.address ?? null;
  const city = params.city !== undefined ? params.city : existing?.city ?? null;
  const zip =
    params.zip_code !== undefined
      ? params.zip_code != null
        ? String(params.zip_code).slice(0, 10)
        : null
      : existing?.zip_code ?? null;
  const company_name =
    params.company_name !== undefined ? params.company_name : existing?.company_name ?? null;
  const nip =
    params.nip !== undefined
      ? params.nip != null
        ? String(params.nip).slice(0, 20)
        : null
      : existing?.nip ?? null;
  const pesel =
    params.pesel !== undefined
      ? params.pesel != null
        ? String(params.pesel).slice(0, 11)
        : null
      : existing?.pesel ?? null;
  const discount_large_family =
    params.discount_large_family !== undefined
      ? params.discount_large_family
      : existing?.discount_large_family ?? false;

  const updated = await pool.query<ParentProfile>(
    `UPDATE parent_profiles
     SET address = $2, city = $3, zip_code = $4,
         company_name = $5, nip = $6, pesel = $7,
         discount_large_family = $8,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING ${PARENT_PROFILE_SELECT}`,
    [userId, address, city, zip, company_name, nip, pesel, discount_large_family]
  );
  if (updated.rows[0]) return updated.rows[0];

  await pool.query(
    `INSERT INTO parent_profiles (
       id, user_id, school_id, address, city, zip_code,
       company_name, nip, pesel, discount_large_family, created_at, updated_at
     )
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
    [userId, schoolId, address, city, zip, company_name, nip, pesel, discount_large_family]
  );
  return getParentProfileByUserId(userId);
}

/**
 * Blokada edycji danych do umowy — tylko w aktywnym roku szkolnym.
 * Lock gdy jest ≥1 dziecko ACCEPTED i każde ma już SIGNED w bieżącym roku.
 * Umowy z zamkniętych lat / bez school_year_id nie blokują. Brak ACCEPTED = odblokowane.
 */
export async function parentHasGeneratedContract(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user?.school_id) return false;

  const activeYear = await getActiveSchoolYear(user.school_id);
  const yearId = activeYear?.id ? String(activeYear.id) : null;
  if (!yearId) return false;

  const r = await pool.query<{ locked: boolean }>(
    `SELECT (
       EXISTS (
         SELECT 1
         FROM children ch
         WHERE ch.parent_id = $1
           AND ch.school_id = $2
           AND ch.active = TRUE
           AND UPPER(BTRIM(COALESCE(ch.access_level::text, ''))) = 'ACCEPTED'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM children ch
         WHERE ch.parent_id = $1
           AND ch.school_id = $2
           AND ch.active = TRUE
           AND UPPER(BTRIM(COALESCE(ch.access_level::text, ''))) = 'ACCEPTED'
           AND NOT EXISTS (
             SELECT 1
             FROM contract_children cc
             JOIN contracts ct ON ct.id = cc.contract_id
             WHERE cc.child_id = ch.id
               AND ct.parent_id = $1
               AND ct.school_id = $2
               AND ct.status = 'SIGNED'
               AND ct.school_year_id = $3
           )
       )
     ) AS locked`,
    [userId, user.school_id, yearId]
  );
  return Boolean(r.rows[0]?.locked);
}

/**
 * Gdy zgłoszenie ma inne imię/nazwisko niż konto (np. drugi rodzic na tym samym emailu),
 * zsynchronizuj `users` ze zgłoszenia — o ile nie ma już podpisanej umowy.
 */
export async function syncParentIdentityFromEnrollments(
  parentId: string
): Promise<{ firstName: string; lastName: string; phone: string | null } | null> {
  if (await parentHasGeneratedContract(parentId)) return null;

  const userRes = await pool.query<{
    id: string;
    school_id: string | null;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  }>(
    `SELECT id, school_id, email, first_name, last_name, phone
     FROM users WHERE id = $1 AND role = 'PARENT' LIMIT 1`,
    [parentId]
  );
  const user = userRes.rows[0];
  if (!user?.school_id) return null;

  const erRes = await pool.query<{
    parent_first_name: string;
    parent_last_name: string;
    parent_phone: string | null;
  }>(
    `SELECT parent_first_name, parent_last_name, parent_phone
     FROM enrollment_requests
     WHERE school_id = $1
       AND (
         user_id = $2
         OR LOWER(parent_email::text) = LOWER($3::text)
       )
       AND UPPER(BTRIM(COALESCE(status::text, ''))) NOT IN ('COMPLETED', 'REJECTED')
     ORDER BY created_at ASC
     LIMIT 1`,
    [user.school_id, parentId, user.email]
  );
  const er = erRes.rows[0];
  if (!er) return null;

  const firstName = formatPersonName(er.parent_first_name?.trim() || user.first_name);
  const lastName = formatPersonName(er.parent_last_name?.trim() || user.last_name);
  const phone = er.parent_phone?.trim() || user.phone;

  if (
    firstName === user.first_name &&
    lastName === user.last_name &&
    (phone ?? null) === (user.phone ?? null)
  ) {
    return { firstName, lastName, phone };
  }

  await updateUser(parentId, {
    first_name: firstName,
    last_name: lastName,
    phone: phone ?? null,
  });

  return { firstName, lastName, phone };
}

async function activeEnrollmentChildExists(
  client: PoolClient,
  params: {
    schoolId: string;
    parentEmail: string;
    firstName: string;
    lastName: string;
    birthDate: string;
  }
): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM enrollment_requests
       WHERE school_id = $1
         AND LOWER(BTRIM(parent_email::text)) = $2
         AND LOWER(BTRIM(child_first_name::text)) = LOWER($3)
         AND LOWER(BTRIM(child_last_name::text)) = LOWER($4)
         AND child_birth_date = $5::date
         AND UPPER(BTRIM(COALESCE(status::text, ''))) NOT IN ('COMPLETED', 'REJECTED')
     ) AS ok`,
    [
      params.schoolId,
      params.parentEmail.trim().toLowerCase(),
      params.firstName.trim(),
      params.lastName.trim(),
      params.birthDate.slice(0, 10),
    ]
  );
  return Boolean(r.rows[0]?.ok);
}

type EnrollmentRequestChildInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  preferredLocationId?: string | null;
};

async function insertEnrollmentRequestsInTx(
  client: PoolClient,
  params: {
    schoolId: string;
    userId: string | null;
    parentEmail: string;
    parentFirstName: string;
    parentLastName: string;
    parentPhone: string | null;
    children: EnrollmentRequestChildInput[];
  }
): Promise<number> {
  const seenInBatch = new Set<string>();
  let created = 0;

  for (const ch of params.children) {
    const childFirst = formatPersonName(ch.firstName);
    const childLast = formatPersonName(ch.lastName);
    const childBirth = ch.birthDate.slice(0, 10);
    const batchKey = childEnrollmentIdentityKey(childFirst, childLast, childBirth);

    if (seenInBatch.has(batchKey)) {
      throw new DuplicateEnrollmentError(`${childFirst} ${childLast}`, "batch");
    }
    seenInBatch.add(batchKey);

    const alreadySubmitted = await activeEnrollmentChildExists(client, {
      schoolId: params.schoolId,
      parentEmail: params.parentEmail,
      firstName: childFirst,
      lastName: childLast,
      birthDate: childBirth,
    });
    if (alreadySubmitted) {
      throw new DuplicateEnrollmentError(`${childFirst} ${childLast}`, "existing");
    }

    const locId = String(ch.preferredLocationId ?? "").trim() || null;

    await client.query(
      `INSERT INTO enrollment_requests (
         id,
         school_id,
         parent_first_name,
         parent_last_name,
         parent_email,
         parent_phone,
         child_first_name,
         child_last_name,
         child_birth_date,
         preferred_location,
         preferred_days,
         notes,
         status,
         user_id,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, NULL, NULL, 'NEW', $11, NOW()
       )`,
      [
        randomUUID(),
        params.schoolId,
        params.parentFirstName,
        params.parentLastName,
        params.parentEmail,
        params.parentPhone,
        childFirst,
        childLast,
        childBirth,
        locId,
        params.userId,
      ]
    );
    created += 1;
  }

  return created;
}

export type ExistingEnrollmentParent = {
  parentFirstName: string;
  parentLastName: string;
  parentPhone: string | null;
  userId: string | null;
};

/** Najstarsze zgłoszenie na dany e-mail w szkole — tożsamość rodzica (mail = klucz). */
export async function findExistingPublicEnrollmentParent(
  schoolId: string,
  email: string
): Promise<ExistingEnrollmentParent | null> {
  const parentEmail = String(email).trim().toLowerCase();
  if (!schoolId?.trim() || !parentEmail) return null;

  const r = await pool.query<{
    parent_first_name: string;
    parent_last_name: string;
    parent_phone: string | null;
    user_id: string | null;
  }>(
    `SELECT parent_first_name, parent_last_name, parent_phone, user_id
     FROM enrollment_requests
     WHERE school_id = $1
       AND LOWER(BTRIM(parent_email::text)) = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [schoolId, parentEmail]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    parentFirstName: formatPersonName(row.parent_first_name),
    parentLastName: formatPersonName(row.parent_last_name),
    parentPhone: row.parent_phone?.trim() || null,
    userId: row.user_id?.trim() || null,
  };
}

/** Publiczne zgłoszenie dziecka — tylko wiersze `enrollment_requests`, bez konta w `users` i bez `children`. */
export async function insertPublicEnrollmentRequests(data: {
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  children: EnrollmentRequestChildInput[];
  /** Gdy rodzic potwierdził powiązanie z istniejącym kontem. */
  userId?: string | null;
}): Promise<{ reusedExistingParent: boolean; keptExistingPhone: boolean }> {
  const hasTable = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'enrollment_requests'
     ) AS exists`
  );
  if (!hasTable.rows[0]?.exists) {
    throw new Error("Brak tabeli enrollment_requests w bazie danych");
  }

  const schoolId = data.schoolId?.trim();
  if (!schoolId) {
    throw new Error("Brak schoolId — zgłoszenie wymaga SCHOOL_ID");
  }

  const parentEmail = String(data.email).trim().toLowerCase();
  let parentPhone = data.phone?.trim() || null;
  let parentFirstName = formatPersonName(data.firstName);
  let parentLastName = formatPersonName(data.lastName);
  let userId = data.userId?.trim() || null;
  let reusedExistingParent = false;
  let keptExistingPhone = false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDefaultSchoolRow(client, schoolId);

    const existingRes = await client.query<{
      parent_first_name: string;
      parent_last_name: string;
      parent_phone: string | null;
      user_id: string | null;
    }>(
      `SELECT parent_first_name, parent_last_name, parent_phone, user_id
       FROM enrollment_requests
       WHERE school_id = $1
         AND LOWER(BTRIM(parent_email::text)) = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [schoolId, parentEmail]
    );
    const existing = existingRes.rows[0];
    if (existing) {
      reusedExistingParent = true;
      parentFirstName = formatPersonName(existing.parent_first_name);
      parentLastName = formatPersonName(existing.parent_last_name);
      const existingPhone = existing.parent_phone?.trim() || null;
      if (existingPhone) {
        keptExistingPhone = Boolean(parentPhone) && !phonesMatch(existingPhone, parentPhone);
        parentPhone = existingPhone;
      }
      userId = userId || existing.user_id?.trim() || null;

      await client.query(
        `UPDATE enrollment_requests
         SET parent_first_name = $3,
             parent_last_name = $4,
             parent_phone = $5,
             user_id = COALESCE(NULLIF(BTRIM(user_id), ''), $6::text)
         WHERE school_id = $1
           AND LOWER(BTRIM(parent_email::text)) = $2
           AND (
             parent_first_name IS DISTINCT FROM $3
             OR parent_last_name IS DISTINCT FROM $4
             OR parent_phone IS DISTINCT FROM $5
             OR (
               NULLIF(BTRIM(user_id), '') IS NULL
               AND $6::text IS NOT NULL
             )
           )`,
        [schoolId, parentEmail, parentFirstName, parentLastName, parentPhone, userId]
      );
    }

    await insertEnrollmentRequestsInTx(client, {
      schoolId,
      userId,
      parentEmail,
      parentFirstName,
      parentLastName,
      parentPhone,
      children: data.children,
    });
    await client.query("COMMIT");
    return { reusedExistingParent, keptExistingPhone };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Panel admina: konto rodzica + zgłoszenia enrollment (bez rekordów `children`). */
export async function createParentUserWithEnrollmentRequests(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  schoolId: string;
  phone?: string | null;
  confirmed?: boolean;
  accessLevel?: AccessLevel;
  children: EnrollmentRequestChildInput[];
}): Promise<{ user: User; enrollmentCount: number }> {
  const schoolId = data.schoolId?.trim();
  if (!schoolId) {
    throw new Error("Brak schoolId — rejestracja rodzica wymaga SCHOOL_ID");
  }
  if (!Array.isArray(data.children) || data.children.length === 0) {
    throw new Error("Wymagane co najmniej jedno dziecko");
  }

  const userId = randomUUID();
  const role: UserRole = "PARENT";
  const confirmed = data.confirmed ?? false;
  const accessLevel = data.accessLevel ?? "PENDING";
  const parentPhone = data.phone?.trim() || null;
  const parentFirstName = formatPersonName(data.firstName);
  const parentLastName = formatPersonName(data.lastName);
  const parentEmail = String(data.email).trim().toLowerCase();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDefaultSchoolRow(client, schoolId);

    const clientNumber = await allocateParentClientNumber(client, schoolId);

    const ur = await client.query<UserRow>(
      `INSERT INTO users (
         id, school_id, email, password_hash, role,
         first_name, last_name, phone, active, confirmed, access_level,
         client_number
       ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        schoolId,
        data.email,
        data.passwordHash,
        role,
        parentFirstName,
        parentLastName,
        parentPhone,
        confirmed,
        accessLevel,
        clientNumber,
      ]
    );

    await insertParentProfileInTx(client, userId, schoolId, parentEmail);

    const enrollmentCount = await insertEnrollmentRequestsInTx(client, {
      schoolId,
      userId,
      parentEmail,
      parentFirstName,
      parentLastName,
      parentPhone,
      children: data.children,
    });

    await client.query("COMMIT");
    return { user: mapUserRow(ur.rows[0]), enrollmentCount };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Panel admina: zgłoszenie enrollment dla istniejącego rodzica (bez rekordu `children`). */
export async function insertEnrollmentRequestsForParent(data: {
  parentId: string;
  children: EnrollmentRequestChildInput[];
}): Promise<{ enrollmentCount: number }> {
  if (!Array.isArray(data.children) || data.children.length === 0) {
    throw new Error("Wymagane co najmniej jedno dziecko");
  }

  const parentRes = await pool.query<{
    id: string;
    school_id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    role: string;
  }>(
    `SELECT id, school_id, email, first_name, last_name, phone, role
     FROM users WHERE id = $1 LIMIT 1`,
    [data.parentId]
  );
  const parent = parentRes.rows[0];
  if (!parent || parent.role !== "PARENT" || !parent.school_id) {
    throw new Error("Rodzic nie istnieje lub nie ma przypisanej szkoły");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDefaultSchoolRow(client, parent.school_id);
    const enrollmentCount = await insertEnrollmentRequestsInTx(client, {
      schoolId: parent.school_id,
      userId: parent.id,
      parentEmail: String(parent.email).trim().toLowerCase(),
      parentFirstName: formatPersonName(parent.first_name),
      parentLastName: formatPersonName(parent.last_name),
      parentPhone: parent.phone?.trim() || null,
      children: data.children,
    });
    await client.query("COMMIT");
    return { enrollmentCount };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getChildrenByParentId(parentId: string): Promise<Child[]> {
  const r = await pool.query<ChildRow>(
    `SELECT c.*
     FROM children c
     JOIN users u ON u.id = c.parent_id
     WHERE c.parent_id = $1
       AND c.school_id IS NOT DISTINCT FROM u.school_id
     ORDER BY c.created_at ASC`,
    [parentId]
  );
  return r.rows.map(mapChildRow);
}

export async function getChildById(childId: string): Promise<Child | null> {
  const r = await pool.query<ChildRow>(
    `SELECT * FROM children WHERE id = $1 LIMIT 1`,
    [childId]
  );
  return r.rows[0] ? mapChildRow(r.rows[0]) : null;
}

export async function getChildByIdForSchool(
  childId: string,
  schoolId: string
): Promise<Child | null> {
  const r = await pool.query<ChildRow>(
    `SELECT * FROM children WHERE id = $1 AND school_id = $2 LIMIT 1`,
    [childId, schoolId]
  );
  return r.rows[0] ? mapChildRow(r.rows[0]) : null;
}

export async function getAllChildren(): Promise<Child[]> {
  const r = await pool.query<ChildRow>(
    `SELECT * FROM children WHERE school_id = $1 ORDER BY created_at DESC`,
    [DEFAULT_SCHOOL_ID]
  );
  return r.rows.map(mapChildRow);
}

export async function updateChild(
  childId: string,
  schoolId: string,
  data: Partial<{
    first_name: string;
    last_name: string;
    birth_date: string;
    avatar_url: string | null;
    xp_total: number;
    active: boolean;
    confirmed: boolean;
    enrollment_request_id: string | null;
    resignation_requested: boolean;
    resignation_reason: string | null;
    resignation_date: Date | string | null;
    lesson_unit_price: number | null;
    monthly_unit_price: number | null;
    yearly_unit_price: number | null;
  }>
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.first_name !== undefined) {
    sets.push(`first_name = $${i++}`);
    vals.push(formatPersonName(data.first_name));
  }
  if (data.last_name !== undefined) {
    sets.push(`last_name = $${i++}`);
    vals.push(formatPersonName(data.last_name));
  }
  if (data.birth_date !== undefined) {
    sets.push(`birth_date = $${i++}::date`);
    vals.push(data.birth_date.slice(0, 10));
  }
  if (data.avatar_url !== undefined) {
    sets.push(`avatar_url = $${i++}`);
    vals.push(data.avatar_url);
  }
  if (data.xp_total !== undefined) {
    sets.push(`xp_total = $${i++}`);
    vals.push(data.xp_total);
  }
  if (data.active !== undefined) {
    sets.push(`active = $${i++}`);
    vals.push(data.active);
  }
  if (data.confirmed !== undefined) {
    sets.push(`confirmed = $${i++}`);
    vals.push(data.confirmed);
  }
  if (data.enrollment_request_id !== undefined) {
    sets.push(`enrollment_request_id = $${i++}`);
    vals.push(data.enrollment_request_id);
  }
  if (data.resignation_requested !== undefined) {
    sets.push(`resignation_requested = $${i++}`);
    vals.push(data.resignation_requested);
  }
  if (data.resignation_reason !== undefined) {
    sets.push(`resignation_reason = $${i++}`);
    vals.push(data.resignation_reason);
  }
  if (data.resignation_date !== undefined) {
    sets.push(`resignation_date = $${i++}`);
    vals.push(
      data.resignation_date === null
        ? null
        : typeof data.resignation_date === "string"
          ? data.resignation_date
          : data.resignation_date.toISOString()
    );
  }
  if (data.lesson_unit_price !== undefined) {
    sets.push(`lesson_unit_price = $${i++}`);
    vals.push(data.lesson_unit_price);
  }
  if (data.monthly_unit_price !== undefined) {
    sets.push(`monthly_unit_price = $${i++}`);
    vals.push(data.monthly_unit_price);
  }
  if (data.yearly_unit_price !== undefined) {
    sets.push(`yearly_unit_price = $${i++}`);
    vals.push(data.yearly_unit_price);
  }

  if (sets.length === 0) return false;

  vals.push(childId, schoolId);
  const q = `UPDATE children SET ${sets.join(", ")} WHERE id = $${i} AND school_id = $${i + 1} RETURNING id`;
  const r = await pool.query(q, vals);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteChild(childId: string, schoolId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = await client.query<{ parent_id: string }>(
      `SELECT parent_id FROM children WHERE id = $1 AND school_id = $2`,
      [childId, schoolId]
    );
    if (q.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    const parentId = q.rows[0].parent_id;

    const u = await client.query(
      `UPDATE children
       SET active = FALSE, resignation_date = COALESCE(resignation_date, NOW())
       WHERE id = $1 AND school_id = $2
       RETURNING id`,
      [childId, schoolId]
    );
    if ((u.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const cnt = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM children
       WHERE parent_id = $1 AND school_id = $2 AND active = TRUE`,
      [parentId, schoolId]
    );
    const activeChildren = parseInt(cnt.rows[0]?.c ?? "0", 10);
    if (activeChildren === 0) {
      await client.query(
        `UPDATE users
         SET active = FALSE, resignation_date = NOW()
         WHERE id = $1 AND school_id = $2`,
        [parentId, schoolId]
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function restoreChild(childId: string, schoolId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = await client.query<{ parent_id: string }>(
      `SELECT parent_id FROM children WHERE id = $1 AND school_id = $2`,
      [childId, schoolId]
    );
    if (q.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    const parentId = q.rows[0].parent_id;

    const u = await client.query(
      `UPDATE children
       SET active = TRUE, resignation_date = NULL
       WHERE id = $1 AND school_id = $2
       RETURNING id`,
      [childId, schoolId]
    );
    if ((u.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const p = await client.query<{ active: boolean }>(
      `SELECT active FROM users WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [parentId, schoolId]
    );
    if (p.rows[0] && p.rows[0].active === false) {
      await client.query(
        `UPDATE users SET active = TRUE, resignation_date = NULL WHERE id = $1 AND school_id = $2`,
        [parentId, schoolId]
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function requestChildResignation(
  childId: string,
  parentUserId: string,
  reason: string
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE children c
     SET resignation_requested = TRUE,
         resignation_reason = $1,
         resignation_date = COALESCE(c.resignation_date, NOW())
     FROM users u
     WHERE c.id = $2
       AND c.parent_id = $3
       AND u.id = c.parent_id
       AND c.school_id IS NOT DISTINCT FROM u.school_id
       AND c.active = TRUE
     RETURNING c.id`,
    [reason, childId, parentUserId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function isLektor(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  return u?.role === "TEACHER";
}

export async function hasElevatedPermissions(userId: string): Promise<boolean> {
  const u = await getUserById(userId);
  if (!u) return false;
  return (
    u.role === "ADMIN" ||
    u.role === "MANAGER" ||
    u.role === "TEACHER"
  );
}

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Aktywny rok szkolny szkoły (max. jeden dzięki indeksowi częściowemu). */
export async function getActiveSchoolYear(schoolId: string): Promise<QueryResultRow | null> {
  const result = await pool.query(
    `SELECT id, school_id, name,
            date_from::date::text AS date_from,
            date_to::date::text AS date_to,
            active, created_at
     FROM school_years
     WHERE school_id = $1 AND active = TRUE
     LIMIT 1`,
    [schoolId]
  );
  return result.rows[0] ?? null;
}

/** Jedna transakcja `pg` (BEGIN / COMMIT / ROLLBACK). */
export async function runPgTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await work(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Sesyjny advisory lock (para hashtext) — blokuje równoległe wykonanie tej samej
 * operacji na innych połączeniach puli (np. cron + ręczne generowanie faktury).
 */
export async function withPgAdvisoryLock<T>(
  namespace: string,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1), hashtext($2))`, [namespace, key]);
    try {
      return await work();
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1), hashtext($2))`, [
        namespace,
        key,
      ]);
    }
  } finally {
    client.release();
  }
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
) {
  return pool.query<T>(text, values);
}
