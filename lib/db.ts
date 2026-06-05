import { randomUUID } from "crypto";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import {
  childEnrollmentIdentityKey,
  DuplicateEnrollmentError,
} from "@/lib/enrollment-duplicate";
import { formatPersonName } from "@/lib/format-person-name";

export { DuplicateEnrollmentError } from "@/lib/enrollment-duplicate";

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
export const USER_ROLES = ["ADMIN", "MANAGER", "TEACHER", "PARENT", "CHILD"] as const;
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

/** @deprecated Stary model UI / API — mapowany na `UserRole` */
export type AccountType = "user" | "admin" | "lektor";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  throw new Error("DATABASE_URL is not set");
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

/** Cache kształtu bazy (legacy vs Prisma) — jedno zapytanie na proces. */
type DbShape = {
  userHasSchoolId: boolean;
  userHasRole: boolean;
  userHasPhone: boolean;
  userHasAccessLevel: boolean;
  userHasMustChangePassword: boolean;
  hasChildrenTable: boolean;
  childHasConfirmed: boolean;
  childHasEnrollmentRequestId: boolean;
  childHasPreferredLocationId: boolean;
  childHasAccessLevel: boolean;
  enrollmentHasRejectionComment: boolean;
  enrollmentHasRejectedAt: boolean;
};

/** Odświeżanie po migracjach — bez tego stary kształt (np. brak `access_level` w cache) daje błędne INSERT-y aż do restartu. */
const DB_SHAPE_CACHE_TTL_MS = 60_000;
let dbShapeCache: DbShape | null = null;
let dbShapeCacheAt = 0;

/** Testy / ręczne unieważnienie po migracji bez czekania na TTL. */
export function clearDbShapeCache(): void {
  dbShapeCache = null;
  dbShapeCacheAt = 0;
}

export async function getDbShape(): Promise<DbShape> {
  if (dbShapeCache != null && Date.now() - dbShapeCacheAt < DB_SHAPE_CACHE_TTL_MS) {
    return dbShapeCache;
  }
  const r = await pool.query<{
    user_has_school_id: boolean;
    user_has_role: boolean;
    user_has_phone: boolean;
    user_has_access_level: boolean;
    user_has_must_change_password: boolean;
    has_children: boolean;
    child_has_confirmed: boolean;
    child_has_enrollment_request_id: boolean;
    child_has_preferred_location_id: boolean;
    child_has_access_level: boolean;
    enrollment_has_rejection_comment: boolean;
    enrollment_has_rejected_at: boolean;
  }>(
    `SELECT
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'school_id'
       ) AS user_has_school_id,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
       ) AS user_has_role,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
       ) AS user_has_phone,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'access_level'
       ) AS user_has_access_level,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'must_change_password'
       ) AS user_has_must_change_password,
       EXISTS(
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'children'
       ) AS has_children,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'confirmed'
       ) AS child_has_confirmed,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'enrollment_request_id'
       ) AS child_has_enrollment_request_id,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'preferred_location_id'
       ) AS child_has_preferred_location_id,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'access_level'
       ) AS child_has_access_level,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'enrollment_requests' AND column_name = 'rejection_comment'
       ) AS enrollment_has_rejection_comment,
       EXISTS(
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'enrollment_requests' AND column_name = 'rejected_at'
       ) AS enrollment_has_rejected_at`
  );
  const row = r.rows[0];
  dbShapeCache = {
    userHasSchoolId: Boolean(row?.user_has_school_id),
    userHasRole: Boolean(row?.user_has_role),
    userHasPhone: Boolean(row?.user_has_phone),
    userHasAccessLevel: Boolean(row?.user_has_access_level),
    userHasMustChangePassword: Boolean(row?.user_has_must_change_password),
    hasChildrenTable: Boolean(row?.has_children),
    childHasConfirmed: Boolean(row?.child_has_confirmed),
    childHasEnrollmentRequestId: Boolean(row?.child_has_enrollment_request_id),
    childHasPreferredLocationId: Boolean(row?.child_has_preferred_location_id),
    childHasAccessLevel: Boolean(row?.child_has_access_level),
    enrollmentHasRejectionComment: Boolean(row?.enrollment_has_rejection_comment),
    enrollmentHasRejectedAt: Boolean(row?.enrollment_has_rejected_at),
  };
  dbShapeCacheAt = Date.now();
  return dbShapeCache;
}

// --- Role mapping (legacy API ↔ DB) ---

export function userRoleToAccountType(role: UserRole): AccountType {
  if (role === "ADMIN" || role === "MANAGER") return "admin";
  if (role === "TEACHER") return "lektor";
  return "user";
}

export function accountTypeToUserRole(t: AccountType): UserRole {
  if (t === "admin") return "ADMIN";
  if (t === "lektor") return "TEACHER";
  return "PARENT";
}

export interface User {
  id: string;
  /** NULL wyłącznie dla roli ADMIN (globalny super admin). */
  school_id: string | null;
  email: string;
  password_hash: string;
  role: UserRole;
  access_level: AccessLevel;
  /** Uzupełniane przy odczycie — zgodność ze starym API */
  account_type: AccountType;
  first_name: string;
  last_name: string;
  phone: string | null;
  active: boolean;
  confirmed: boolean;
  must_change_password: boolean;
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
 * Przy migracji ze starego modelu: `account_type = admin|lektor` jest źródłem prawdy dla personelu,
 * nawet gdy kolumna `role` została błędnie ustawiona (np. PARENT).
 * Dodatkowo: `STAFF_ADMIN_EMAILS` → ADMIN, `STAFF_MANAGER_EMAILS` → MANAGER.
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

  const atRaw =
    row.account_type != null
      ? String(row.account_type).trim().toLowerCase()
      : "";
  if (atRaw === "admin") return "ADMIN";
  if (atRaw === "lektor") return "TEACHER";

  const raw = row.role != null ? String(row.role).trim() : "";
  if (raw) {
    const parsed = parseUserRole(raw);
    if (parsed) return parsed;
  }

  const at = row.account_type as AccountType | null | undefined;
  return accountTypeToUserRole((at as AccountType) || "user");
}

type ChildRow = QueryResultRow & {
  id: string;
  school_id: string;
  parent_id: string;
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
    account_type: userRoleToAccountType(role),
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    phone: row.phone != null ? (row.phone as string) : null,
    active: row.active === undefined ? true : Boolean(row.active),
    confirmed: Boolean(row.confirmed),
    must_change_password: Boolean(row.must_change_password),
    reset_token: row.reset_token != null ? (row.reset_token as string) : null,
    reset_token_expiry: (row.reset_token_expiry as Date | null) ?? null,
    resignation_date: (row.resignation_date as Date | null) ?? null,
    last_login: (row.last_login as Date | null) ?? null,
    created_at: row.created_at as Date,
  };
}

function birthDateToIso(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mapChildRow(row: ChildRow): Child {
  return {
    id: row.id,
    school_id: row.school_id,
    parent_id: row.parent_id,
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
  };
}

// --- Users ---

export async function getUserByEmail(email: string): Promise<User | null> {
  const shape = await getDbShape();
  const r = shape.userHasSchoolId
    ? await pool.query<UserRow>(
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
      )
    : await pool.query<UserRow>(
        `SELECT * FROM users
         WHERE LOWER(email::text) = LOWER($1::text)
         LIMIT 1`,
        [email]
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
  const shape = await getDbShape();
  const r = shape.userHasSchoolId
    ? await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM users
           WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
         ) AS exists`,
        [schoolId, email]
      )
    : await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM users
           WHERE LOWER(email::text) = LOWER($1::text)
         ) AS exists`,
        [email]
      );
  return Boolean(r.rows[0]?.exists);
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  accountType?: AccountType;
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
  const role =
    data.role ??
    (data.accountType != null
      ? accountTypeToUserRole(data.accountType)
      : "PARENT");
  const confirmed = data.confirmed ?? false;
  const accessLevel =
    data.accessLevel ?? (role === "PARENT" ? "PENDING" : "ACTIVE");
  const mustChangePassword = data.mustChangePassword ?? false;
  const shape = await getDbShape();

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

    if (shape.userHasSchoolId && insertSchoolId != null) {
      await ensureDefaultSchoolRow(client, insertSchoolId);
    }

    if (shape.userHasRole) {
      let r: QueryResult<UserRow>;
      if (shape.userHasAccessLevel) {
        r = shape.userHasPhone
          ? await client.query<UserRow>(
              `INSERT INTO users (
               id, school_id, email, password_hash, role,
               first_name, last_name, phone, active, confirmed, access_level
             ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9, $10)
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
              ]
            )
          : await client.query<UserRow>(
              `INSERT INTO users (
               id, school_id, email, password_hash, role,
               first_name, last_name, active, confirmed, access_level
             ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, TRUE, $8, $9)
             RETURNING *`,
              [
                id,
                insertSchoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                confirmed,
                accessLevel,
              ]
            );
      } else {
        r = shape.userHasPhone
          ? await client.query<UserRow>(
              `INSERT INTO users (
               id, school_id, email, password_hash, role,
               first_name, last_name, phone, active, confirmed
             ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9)
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
              ]
            )
          : await client.query<UserRow>(
              `INSERT INTO users (
               id, school_id, email, password_hash, role,
               first_name, last_name, active, confirmed
             ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, TRUE, $8)
             RETURNING *`,
              [
                id,
                insertSchoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                confirmed,
              ]
            );
      }
      if (role === "PARENT" && insertSchoolId != null) {
        await insertParentProfileInTx(client, id, insertSchoolId);
      }
      if (mustChangePassword && shape.userHasMustChangePassword) {
        await client.query(
          `UPDATE users SET must_change_password = TRUE WHERE id = $1`,
          [id]
        );
        (r.rows[0] as UserRow).must_change_password = true;
      }
      await client.query("COMMIT");
      return mapUserRow(r.rows[0]);
    }

    const legacyType = userRoleToAccountType(role);
    const r = await client.query<UserRow>(
      `INSERT INTO users (
       id, email, password_hash, account_type,
       first_name, last_name, confirmed, active
     ) VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, TRUE)
     RETURNING *`,
      [
        id,
        data.email,
        data.passwordHash,
        legacyType,
        firstName,
        lastName,
        confirmed,
      ]
    );
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
    account_type: AccountType;
    confirmed: boolean;
    phone: string | null;
  }>
): Promise<boolean> {
  const shape = await getDbShape();
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
    if (shape.userHasRole) {
      sets.push(`role = $${i++}`);
      vals.push(data.role);
    } else {
      sets.push(`account_type = $${i++}`);
      vals.push(userRoleToAccountType(data.role));
    }
  } else if (data.account_type !== undefined) {
    if (shape.userHasRole) {
      sets.push(`role = $${i++}`);
      vals.push(accountTypeToUserRole(data.account_type));
    } else {
      sets.push(`account_type = $${i++}`);
      vals.push(data.account_type);
    }
  }
  if (data.confirmed !== undefined) {
    sets.push(`confirmed = $${i++}`);
    vals.push(data.confirmed);
  }
  if (data.phone !== undefined && shape.userHasPhone) {
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
  const shape = await getDbShape();
  const r = shape.userHasSchoolId
    ? await pool.query<UserRow>(
        `SELECT * FROM users
         WHERE school_id = $1 AND LOWER(email::text) = LOWER($2::text)
         LIMIT 1`,
        [schoolId, email]
      )
    : await pool.query<UserRow>(
        `SELECT * FROM users
         WHERE LOWER(email::text) = LOWER($1::text)
         LIMIT 1`,
        [email]
      );
  return r.rows[0] ? mapUserRow(r.rows[0]) : null;
}

/** Czyści flagę must_change_password po skutecznej zmianie hasła przez użytkownika. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  const shape = await getDbShape();
  if (!shape.userHasMustChangePassword) return;
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
  const shape = await getDbShape();
  const r = shape.userHasSchoolId
    ? await pool.query<UserRow>(
        `SELECT * FROM users WHERE school_id = $1 ORDER BY created_at DESC`,
        [schoolId]
      )
    : await pool.query<UserRow>(`SELECT * FROM users ORDER BY created_at DESC`);
  return r.rows.map(mapUserRow);
}

export async function getUsersByRole(
  role: UserRole,
  schoolId: string = DEFAULT_SCHOOL_ID
): Promise<User[]> {
  const shape = await getDbShape();
  const r =
    shape.userHasRole && shape.userHasSchoolId
      ? await pool.query<UserRow>(
          `SELECT * FROM users
           WHERE school_id = $1 AND role = $2
           ORDER BY created_at DESC`,
          [schoolId, role]
        )
      : shape.userHasRole
        ? await pool.query<UserRow>(
            `SELECT * FROM users
             WHERE role = $1
             ORDER BY created_at DESC`,
            [role]
          )
        : await pool.query<UserRow>(
            `SELECT * FROM users
             WHERE account_type = $1
             ORDER BY created_at DESC`,
            [userRoleToAccountType(role)]
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
  const shape = await getDbShape();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (shape.hasChildrenTable && tenantSchoolId != null) {
      await client.query(
        `UPDATE children
         SET active = FALSE, resignation_date = COALESCE(resignation_date, NOW())
         WHERE parent_id = $1 AND school_id = $2 AND active = TRUE`,
        [userId, tenantSchoolId]
      );
    }
    const schoolScope =
      tenantSchoolId === undefined ? DEFAULT_SCHOOL_ID : tenantSchoolId;
    const u = shape.userHasSchoolId
      ? schoolScope === null
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
          )
      : await client.query(
          `UPDATE users
           SET active = FALSE, resignation_date = NOW()
           WHERE id = $1
           RETURNING id`,
          [userId]
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
  const shape = await getDbShape();
  const schoolScope =
    tenantSchoolId === undefined ? DEFAULT_SCHOOL_ID : tenantSchoolId;
  const r = shape.userHasSchoolId
    ? schoolScope === null
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
        )
    : await pool.query(
        `UPDATE users
         SET active = TRUE, resignation_date = NULL
         WHERE id = $1
         RETURNING id`,
        [userId]
      );
  return (r.rowCount ?? 0) > 0;
}

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const shape = await getDbShape();
    if (shape.userHasRole) {
      const r = await pool.query<QueryResultRow>(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const row = r.rows[0];
      if (!row) return false;
      return resolveUserRoleFromRow(row) === "ADMIN";
    }
    const r = await pool.query<{ account_type: string }>(
      `SELECT account_type FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return r.rows[0]?.account_type === "admin";
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
  const shape = await getDbShape();
  if (shape.userHasSchoolId) {
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
  } else {
    await pool.query(
      `UPDATE users
       SET reset_token = $1, reset_token_expiry = $2
       WHERE LOWER(email::text) = LOWER($3::text)`,
      [token, expiry, email]
    );
  }
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
  const shape = await getDbShape();
  const mustChangeSet = shape.userHasMustChangePassword
    ? `, must_change_password = FALSE`
    : "";
  const r = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         reset_token = NULL,
         reset_token_expiry = NULL${mustChangeSet}
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
  const shape = await getDbShape();
  const firstName = formatPersonName(data.firstName);
  const lastName = formatPersonName(data.lastName);
  const id = randomUUID();
  const schoolId = data.schoolId ?? DEFAULT_SCHOOL_ID;
  const accessLevel = data.accessLevel ?? "NEW";

  if (shape.hasChildrenTable) {
    const cols = [
      "id",
      "school_id",
      "parent_id",
      "first_name",
      "last_name",
      "birth_date",
      "avatar_url",
    ];
    const vals: unknown[] = [
      id,
      schoolId,
      data.parentId,
      firstName,
      lastName,
      data.birthDate.slice(0, 10),
      data.avatarUrl ?? null,
    ];
    if (shape.childHasConfirmed) {
      cols.push("confirmed");
      vals.push(false);
    }
    if (shape.childHasAccessLevel) {
      cols.push("access_level");
      vals.push(accessLevel);
    }
    const placeholders = vals
      .map((_, i) => {
        const col = cols[i];
        return col === "birth_date" ? `$${i + 1}::date` : `$${i + 1}`;
      })
      .join(", ");
    const r = await pool.query<ChildRow>(
      `INSERT INTO children (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return mapChildRow(r.rows[0]);
  }

  throw new Error("Brak tabeli children w bazie");
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
  schoolId: string
): Promise<void> {
  await client.query(
    `INSERT INTO parent_profiles (id, user_id, school_id, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $2, NOW(), NOW())`,
    [userId, schoolId]
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
  created_at: Date;
  updated_at: Date;
};

const PARENT_PROFILE_SELECT = `id, user_id, school_id, address, city, zip_code,
  company_name, nip, pesel, created_at, updated_at`;

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

  const updated = await pool.query<ParentProfile>(
    `UPDATE parent_profiles
     SET address = $2, city = $3, zip_code = $4,
         company_name = $5, nip = $6, pesel = $7,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING ${PARENT_PROFILE_SELECT}`,
    [userId, address, city, zip, company_name, nip, pesel]
  );
  if (updated.rows[0]) return updated.rows[0];

  await pool.query(
    `INSERT INTO parent_profiles (
       id, user_id, school_id, address, city, zip_code,
       company_name, nip, pesel, created_at, updated_at
     )
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [userId, schoolId, address, city, zip, company_name, nip, pesel]
  );
  return getParentProfileByUserId(userId);
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
       WHERE school_id::text = $1
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

/** Publiczne zgłoszenie dziecka — tylko wiersze `enrollment_requests`, bez konta w `users` i bez `children`. */
export async function insertPublicEnrollmentRequests(data: {
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  children: Array<{
    firstName: string;
    lastName: string;
    birthDate: string;
    preferredLocationId?: string | null;
  }>;
}): Promise<void> {
  const hasTable = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'enrollment_requests'
     ) AS exists`
  );
  if (!hasTable.rows[0]?.exists) {
    throw new Error("Brak tabeli enrollment_requests w bazie danych");
  }

  const shape = await getDbShape();
  const schoolId = data.schoolId?.trim();
  if (!schoolId) {
    throw new Error("Brak schoolId — zgłoszenie wymaga SCHOOL_ID");
  }

  const parentEmail = String(data.email).trim().toLowerCase();
  const parentPhone = data.phone?.trim() || null;
  const parentFirstName = formatPersonName(data.firstName);
  const parentLastName = formatPersonName(data.lastName);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (shape.userHasSchoolId) {
      await ensureDefaultSchoolRow(client, schoolId);
    }

    const seenInBatch = new Set<string>();

    for (const ch of data.children) {
      const childFirst = formatPersonName(ch.firstName);
      const childLast = formatPersonName(ch.lastName);
      const childBirth = ch.birthDate.slice(0, 10);
      const batchKey = childEnrollmentIdentityKey(childFirst, childLast, childBirth);

      if (seenInBatch.has(batchKey)) {
        throw new DuplicateEnrollmentError(`${childFirst} ${childLast}`, "batch");
      }
      seenInBatch.add(batchKey);

      const alreadySubmitted = await activeEnrollmentChildExists(client, {
        schoolId,
        parentEmail,
        firstName: childFirst,
        lastName: childLast,
        birthDate: childBirth,
      });
      if (alreadySubmitted) {
        throw new DuplicateEnrollmentError(`${childFirst} ${childLast}`, "existing");
      }

      /* Lokalizacja jest w `enrollment_requests` — nie uzależnij od kształtu tabeli `children`. */
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
           $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, NULL, NULL, 'NEW', NULL, NOW()
         )`,
        [
          randomUUID(),
          schoolId,
          parentFirstName,
          parentLastName,
          parentEmail,
          parentPhone,
          childFirst,
          childLast,
          ch.birthDate.slice(0, 10),
          locId,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Rodzic + dzieci w jednej transakcji (rejestracja). */
export async function createParentUserWithChildren(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  /** Wymagane — zwykle `process.env.SCHOOL_ID` / `getRegistrationSchoolId()`; rodzic nigdy bez szkoły. */
  schoolId: string;
  phone?: string | null;
  parentPhone?: string | null;
  confirmed?: boolean;
  accessLevel?: AccessLevel;
  createEnrollmentRequests?: boolean;
  children: Array<{
    firstName: string;
    lastName: string;
    birthDate: string;
    preferredLocationId?: string | null;
  }>;
}): Promise<{ user: User; children: Child[] }> {
  const shape = await getDbShape();
  const schoolId = data.schoolId?.trim();
  if (!schoolId) {
    throw new Error("Brak schoolId — rejestracja rodzica wymaga SCHOOL_ID");
  }
  const userId = randomUUID();
  const role: UserRole = "PARENT";
  const confirmed = data.confirmed ?? false;
  const accessLevel = data.accessLevel ?? "PENDING";
  const shouldCreateEnrollmentRequests = data.createEnrollmentRequests ?? false;
  const parentPhone = data.parentPhone ?? data.phone ?? null;
  const firstName = formatPersonName(data.firstName);
  const lastName = formatPersonName(data.lastName);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (shape.userHasSchoolId) {
      await ensureDefaultSchoolRow(client, schoolId);
    }

    let ur: QueryResult<UserRow>;
    if (shape.userHasRole) {
      if (shape.userHasAccessLevel) {
        ur = shape.userHasPhone
          ? await client.query<UserRow>(
              `INSERT INTO users (
                 id, school_id, email, password_hash, role,
                 first_name, last_name, phone, active, confirmed, access_level
               ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9, $10)
               RETURNING *`,
              [
                userId,
                schoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                data.phone ?? null,
                confirmed,
                accessLevel,
              ]
            )
          : await client.query<UserRow>(
              `INSERT INTO users (
                 id, school_id, email, password_hash, role,
                 first_name, last_name, active, confirmed, access_level
               ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, TRUE, $8, $9)
               RETURNING *`,
              [
                userId,
                schoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                confirmed,
                accessLevel,
              ]
            );
      } else {
        ur = shape.userHasPhone
          ? await client.query<UserRow>(
              `INSERT INTO users (
                 id, school_id, email, password_hash, role,
                 first_name, last_name, phone, active, confirmed
               ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, $8, TRUE, $9)
               RETURNING *`,
              [
                userId,
                schoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                data.phone ?? null,
                confirmed,
              ]
            )
          : await client.query<UserRow>(
              `INSERT INTO users (
                 id, school_id, email, password_hash, role,
                 first_name, last_name, active, confirmed
               ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7, TRUE, $8)
               RETURNING *`,
              [
                userId,
                schoolId,
                data.email,
                data.passwordHash,
                role,
                firstName,
                lastName,
                confirmed,
              ]
            );
      }
    } else {
      ur = await client.query<UserRow>(
        `INSERT INTO users (
           id, email, password_hash, account_type,
           first_name, last_name, confirmed, active
         ) VALUES ($1, LOWER($2), $3, 'user', $4, $5, $6, TRUE)
         RETURNING *`,
        [
          userId,
          data.email,
          data.passwordHash,
          firstName,
          lastName,
          confirmed,
        ]
      );
    }

    if (shape.userHasRole) {
      await insertParentProfileInTx(client, userId, schoolId);
    }

    const children: Child[] = [];
    if (shape.hasChildrenTable) {
      for (const ch of data.children) {
        const childFirstName = formatPersonName(ch.firstName);
        const childLastName = formatPersonName(ch.lastName);
        const cid = randomUUID();
        const cr = shape.childHasConfirmed
          ? await client.query<ChildRow>(
              `INSERT INTO children (
                 id, school_id, parent_id, first_name, last_name, birth_date, avatar_url, active, confirmed
               ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, TRUE, FALSE)
               RETURNING *`,
              [
                cid,
                schoolId,
                userId,
                childFirstName,
                childLastName,
                ch.birthDate.slice(0, 10),
                null,
              ]
            )
          : await client.query<ChildRow>(
              `INSERT INTO children (
                 id, school_id, parent_id, first_name, last_name, birth_date, avatar_url, active
               ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, TRUE)
               RETURNING *`,
              [
                cid,
                schoolId,
                userId,
                childFirstName,
                childLastName,
                ch.birthDate.slice(0, 10),
                null,
              ]
            );
        if (
          shape.childHasPreferredLocationId &&
          ch.preferredLocationId != null &&
          String(ch.preferredLocationId).trim() !== ""
        ) {
          await client.query(
            `UPDATE children
             SET preferred_location_id = $1
             WHERE id = $2 AND school_id = $3`,
            [String(ch.preferredLocationId).trim(), cid, schoolId]
          );
        }
        const mappedChild = mapChildRow(cr.rows[0]);
        children.push(mappedChild);
        if (shouldCreateEnrollmentRequests) {
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
              schoolId,
              firstName,
              lastName,
              String(data.email).trim().toLowerCase(),
              parentPhone,
              mappedChild.first_name,
              mappedChild.last_name,
              mappedChild.birth_date,
              ch.preferredLocationId != null && String(ch.preferredLocationId).trim() !== ""
                ? String(ch.preferredLocationId).trim()
                : null,
              userId,
            ]
          );
        }
      }
    } else {
      throw new Error("Brak tabeli children — nie można zapisać dzieci.");
    }

    await client.query("COMMIT");
    return { user: mapUserRow(ur.rows[0]), children };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getChildrenByParentId(parentId: string): Promise<Child[]> {
  const shape = await getDbShape();
  if (shape.hasChildrenTable) {
    const r = await pool.query<ChildRow>(
      `SELECT * FROM children
       WHERE parent_id = $1 AND school_id = $2
       ORDER BY created_at ASC`,
      [parentId, DEFAULT_SCHOOL_ID]
    );
    return r.rows.map(mapChildRow);
  }
  return [];
}

export async function getChildById(childId: string): Promise<Child | null> {
  const shape = await getDbShape();
  if (!shape.hasChildrenTable) return null;
  const r = await pool.query<ChildRow>(
    `SELECT * FROM children WHERE id = $1 LIMIT 1`,
    [childId]
  );
  return r.rows[0] ? mapChildRow(r.rows[0]) : null;
}

export async function getAllChildren(): Promise<Child[]> {
  const shape = await getDbShape();
  if (!shape.hasChildrenTable) return [];
  const r = await pool.query<ChildRow>(
    `SELECT * FROM children WHERE school_id = $1 ORDER BY created_at DESC`,
    [DEFAULT_SCHOOL_ID]
  );
  return r.rows.map(mapChildRow);
}

export async function updateChild(
  childId: string,
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
  }>
): Promise<boolean> {
  const shape = await getDbShape();

  if (shape.hasChildrenTable) {
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
    if (data.confirmed !== undefined && shape.childHasConfirmed) {
      sets.push(`confirmed = $${i++}`);
      vals.push(data.confirmed);
    }
    if (data.enrollment_request_id !== undefined && shape.childHasEnrollmentRequestId) {
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

    if (sets.length === 0) return false;

    vals.push(childId);
    const q = `UPDATE children SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`;
    const r = await pool.query(q, vals);
    return (r.rowCount ?? 0) > 0;
  }

  return false;
}

export async function deleteChild(childId: string): Promise<boolean> {
  const shape = await getDbShape();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (shape.hasChildrenTable) {
      const q = await client.query<{ parent_id: string }>(
        `SELECT parent_id FROM children WHERE id = $1 AND school_id = $2`,
        [childId, DEFAULT_SCHOOL_ID]
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
        [childId, DEFAULT_SCHOOL_ID]
      );
      if ((u.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      const cnt = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM children
         WHERE parent_id = $1 AND school_id = $2 AND active = TRUE`,
        [parentId, DEFAULT_SCHOOL_ID]
      );
      const activeChildren = parseInt(cnt.rows[0]?.c ?? "0", 10);
      if (activeChildren === 0) {
        if (shape.userHasSchoolId) {
          await client.query(
            `UPDATE users
             SET active = FALSE, resignation_date = NOW()
             WHERE id = $1 AND school_id = $2`,
            [parentId, DEFAULT_SCHOOL_ID]
          );
        } else {
          await client.query(
            `UPDATE users
             SET active = FALSE, resignation_date = NOW()
             WHERE id = $1`,
            [parentId]
          );
        }
      }
    } else {
      await client.query("ROLLBACK");
      return false;
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

export async function restoreChild(childId: string): Promise<boolean> {
  const shape = await getDbShape();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (shape.hasChildrenTable) {
      const q = await client.query<{ parent_id: string }>(
        `SELECT parent_id FROM children WHERE id = $1`,
        [childId]
      );
      if (q.rows.length === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      const parentId = q.rows[0].parent_id;

      const u = await client.query(
        `UPDATE children
         SET active = TRUE, resignation_date = NULL
         WHERE id = $1
         RETURNING id`,
        [childId]
      );
      if ((u.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      const p = await client.query<{ active: boolean }>(
        `SELECT active FROM users WHERE id = $1 LIMIT 1`,
        [parentId]
      );
      if (p.rows[0] && p.rows[0].active === false) {
        await client.query(
          `UPDATE users SET active = TRUE, resignation_date = NULL WHERE id = $1`,
          [parentId]
        );
      }
    } else {
      await client.query("ROLLBACK");
      return false;
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
  const shape = await getDbShape();
  if (!shape.hasChildrenTable) return false;
  const r = await pool.query(
    `UPDATE children
     SET resignation_requested = TRUE,
         resignation_reason = $1
     WHERE id = $2 AND parent_id = $3 AND school_id = $4
     RETURNING id`,
    [reason, childId, parentUserId, DEFAULT_SCHOOL_ID]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function getUsersByAccountType(
  accountType: AccountType
): Promise<User[]> {
  return getUsersByRole(accountTypeToUserRole(accountType));
}

export async function updateAccountType(
  userId: string,
  newAccountType: AccountType
): Promise<boolean> {
  return updateUser(userId, { account_type: newAccountType });
}

export async function updateAccountTypeByEmail(
  email: string,
  newAccountType: AccountType
): Promise<boolean> {
  const shape = await getDbShape();
  const r = shape.userHasRole
    ? shape.userHasSchoolId
      ? await pool.query(
          `UPDATE users SET role = $1
           WHERE school_id = $2 AND LOWER(email::text) = LOWER($3::text)
           RETURNING id`,
          [accountTypeToUserRole(newAccountType), DEFAULT_SCHOOL_ID, email]
        )
      : await pool.query(
          `UPDATE users SET role = $1
           WHERE LOWER(email::text) = LOWER($2::text)
           RETURNING id`,
          [accountTypeToUserRole(newAccountType), email]
        )
    : await pool.query(
        `UPDATE users SET account_type = $1
         WHERE LOWER(email::text) = LOWER($2::text)
         RETURNING id`,
        [newAccountType, email]
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

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
) {
  return pool.query<T>(text, values);
}
