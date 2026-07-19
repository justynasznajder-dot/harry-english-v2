import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getRegistrationSchoolId, getUserById, queryDb } from "@/lib/db";

export const MESSAGE_ROLES = ["MANAGER", "TEACHER", "PARENT"] as const;
export type MessagePortalRole = (typeof MESSAGE_ROLES)[number];

export function isMessagePortalRole(role: string | undefined): role is MessagePortalRole {
  return MESSAGE_ROLES.includes(role as MessagePortalRole);
}

export type MessageUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  access_level?: string | null;
};

export type ThreadRootRow = {
  id: string;
  school_id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  content: string;
  sender_role: string;
  broadcast_id: string | null;
  read_at: Date | null;
  created_at: Date;
  sender_first_name: string;
  sender_last_name: string;
  sender_role_col: string;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_role_col: string;
  reply_count: string;
  unread_count: string;
  last_reply_at: Date | null;
};

export type ThreadMessageRow = {
  id: string;
  school_id: string;
  parent_message_id: string | null;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  content: string;
  sender_role: string;
  read_at: Date | null;
  created_at: Date;
  sender_first_name: string;
  sender_last_name: string;
  sender_role_col: string;
  sender_phone: string | null;
  recipient_first_name: string;
  recipient_last_name: string;
  recipient_role_col: string;
};

export async function requireMessageActor(userId: string) {
  const user = await getUserById(userId);
  if (!user) return { ok: false as const, status: 401, message: "Nieautoryzowany dostęp" };

  if (user.role === "ADMIN") {
    const schoolId = getRegistrationSchoolId();
    if (!schoolId) {
      return { ok: false as const, status: 400, message: "Brak konfiguracji szkoły (SCHOOL_ID)" };
    }
    return {
      ok: true as const,
      user: {
        id: user.id,
        role: "MANAGER" as MessagePortalRole,
        schoolId,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    };
  }

  if (!isMessagePortalRole(user.role)) {
    return { ok: false as const, status: 403, message: "Brak uprawnień do wiadomości" };
  }
  if (!user.school_id) {
    return { ok: false as const, status: 400, message: "Konto nie ma przypisanej szkoły" };
  }
  return {
    ok: true as const,
    user: {
      id: user.id,
      role: user.role as MessagePortalRole,
      schoolId: user.school_id,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  };
}

export function resolveParentIdForMessage(
  senderRole: MessagePortalRole,
  recipientRole: string,
  senderId: string,
  recipientId: string
): string | null {
  if (recipientRole === "PARENT") return recipientId;
  if (senderRole === "PARENT") return senderId;
  return null;
}

/** Root id wątku — parent_message_id wskazuje korzeń lub rekord jest korzeniem. */
export async function getThreadRootId(messageId: string): Promise<string | null> {
  const r = await queryDb<{ id: string; parent_message_id: string | null }>(
    `SELECT id, parent_message_id FROM messages WHERE id = $1 LIMIT 1`,
    [messageId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return row.parent_message_id ?? row.id;
}

export async function userCanAccessThreadRoot(
  userId: string,
  rootId: string
): Promise<boolean> {
  const r = await queryDb<{ ok: number }>(
    `SELECT 1 AS ok FROM messages
     WHERE id = $1 AND parent_message_id IS NULL
       AND (sender_id = $2 OR recipient_id = $2)
     LIMIT 1`,
    [rootId, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function fetchThreadRoots(params: {
  userId: string;
  schoolId: string;
  page: number;
  limit: number;
  search?: string;
}): Promise<{ threads: ThreadRootRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const search = params.search?.trim();
  const searchVal = search && search.length > 0 ? `%${search}%` : null;

  const searchClauseCount = searchVal
    ? `AND (
         m.subject ILIKE $3
         OR m.content ILIKE $3
         OR EXISTS (
           SELECT 1 FROM messages rep
           WHERE rep.parent_message_id = m.id AND rep.content ILIKE $3
         )
       )`
    : "";

  const searchClauseList = searchVal
    ? `AND (
         m.subject ILIKE $4
         OR m.content ILIKE $4
         OR EXISTS (
           SELECT 1 FROM messages rep
           WHERE rep.parent_message_id = m.id AND rep.content ILIKE $4
         )
       )`
    : "";

  const baseParams: unknown[] = [params.schoolId, params.userId, params.limit, offset];
  const listParams = searchVal
    ? [params.schoolId, params.userId, params.limit, searchVal, offset]
    : baseParams;

  const countParams = searchVal
    ? [params.schoolId, params.userId, searchVal]
    : [params.schoolId, params.userId];

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM messages m
    WHERE m.school_id = $1
      AND m.parent_message_id IS NULL
      AND (m.sender_id = $2 OR m.recipient_id = $2)
      ${searchClauseCount}`;

  const listSql = `
    SELECT
      m.id,
      m.school_id,
      m.sender_id,
      m.recipient_id,
      m.subject,
      m.content,
      m.sender_role,
      m.broadcast_id,
      m.read_at,
      m.created_at,
      s.first_name AS sender_first_name,
      s.last_name AS sender_last_name,
      s.role AS sender_role_col,
      r.first_name AS recipient_first_name,
      r.last_name AS recipient_last_name,
      r.role AS recipient_role_col,
      COALESCE(rc.cnt, 0)::text AS reply_count,
      COALESCE(ur.cnt, 0)::text AS unread_count,
      lr.last_at AS last_reply_at
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.recipient_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM messages rep
      WHERE rep.parent_message_id = m.id
    ) rc ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM messages um
      WHERE (um.id = m.id OR um.parent_message_id = m.id)
        AND um.recipient_id = $2
        AND um.read_at IS NULL
    ) ur ON TRUE
    LEFT JOIN LATERAL (
      SELECT MAX(rep.created_at) AS last_at
      FROM messages rep
      WHERE rep.parent_message_id = m.id
    ) lr ON TRUE
    WHERE m.school_id = $1
      AND m.parent_message_id IS NULL
      AND (m.sender_id = $2 OR m.recipient_id = $2)
      ${searchClauseList}
    ORDER BY COALESCE(lr.last_at, m.created_at) DESC
    LIMIT $3 OFFSET ${searchVal ? "$5" : "$4"}`;

  const [countRes, listRes] = await Promise.all([
    queryDb<{ total: number }>(countSql, countParams),
    queryDb<ThreadRootRow>(listSql, listParams),
  ]);

  return { threads: listRes.rows, total: countRes.rows[0]?.total ?? 0 };
}

export async function countUnreadMessagesForUser(params: {
  userId: string;
  schoolId: string;
}): Promise<number> {
  const r = await queryDb<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM messages
     WHERE school_id = $1
       AND recipient_id = $2
       AND read_at IS NULL`,
    [params.schoolId, params.userId]
  );
  return r.rows[0]?.total ?? 0;
}

export async function fetchThreadMessages(rootId: string): Promise<ThreadMessageRow[]> {
  const r = await queryDb<ThreadMessageRow>(
    `SELECT
       m.id,
       m.school_id,
       m.parent_message_id,
       m.sender_id,
       m.recipient_id,
       m.subject,
       m.content,
       m.sender_role,
       m.read_at,
       m.created_at,
       s.first_name AS sender_first_name,
       s.last_name AS sender_last_name,
       s.role AS sender_role_col,
       COALESCE(
         NULLIF(BTRIM(s.phone::text), ''),
         (
           SELECT NULLIF(BTRIM(er.parent_phone::text), '')
           FROM enrollment_requests er
           WHERE er.user_id = s.id
              OR LOWER(BTRIM(er.parent_email::text)) = LOWER(BTRIM(s.email::text))
           ORDER BY er.created_at DESC
           LIMIT 1
         )
       ) AS sender_phone,
       r.first_name AS recipient_first_name,
       r.last_name AS recipient_last_name,
       r.role AS recipient_role_col
     FROM messages m
     JOIN users s ON s.id = m.sender_id
     JOIN users r ON r.id = m.recipient_id
     WHERE m.id = $1 OR m.parent_message_id = $1
     ORDER BY m.created_at ASC`,
    [rootId]
  );
  return r.rows;
}

export async function validateRecipientsForSender(params: {
  senderId: string;
  senderRole: MessagePortalRole;
  schoolId: string;
  recipientIds: string[];
  threadRootId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(params.recipientIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, message: "Wybierz co najmniej jednego odbiorcę z listy" };
  }

  if (params.threadRootId) {
    return validateThreadReply({
      senderId: params.senderId,
      threadRootId: params.threadRootId,
      recipientIds: unique,
    });
  }

  for (const recipientId of unique) {
    const allowed = await canMessageRecipient({
      senderId: params.senderId,
      senderRole: params.senderRole,
      schoolId: params.schoolId,
      recipientId,
    });
    if (!allowed) {
      return { ok: false, message: "Brak uprawnień do wysłania wiadomości do wybranego odbiorcy" };
    }
  }
  return { ok: true };
}

/** Odpowiedź w istniejącym wątku — dozwolony jest tylko drugi uczestnik rozmowy. */
export async function validateThreadReply(params: {
  senderId: string;
  threadRootId: string;
  recipientIds: string[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const canAccess = await userCanAccessThreadRoot(params.senderId, params.threadRootId);
  if (!canAccess) {
    return { ok: false, message: "Brak dostępu do wątku" };
  }

  const rootRes = await queryDb<{ sender_id: string; recipient_id: string }>(
    `SELECT sender_id, recipient_id FROM messages WHERE id = $1 AND parent_message_id IS NULL LIMIT 1`,
    [params.threadRootId]
  );
  const root = rootRes.rows[0];
  if (!root) {
    return { ok: false, message: "Nie znaleziono wątku" };
  }

  const participants = new Set([root.sender_id, root.recipient_id]);
  for (const recipientId of params.recipientIds) {
    if (recipientId === params.senderId) {
      return { ok: false, message: "Nie możesz wysłać wiadomości do siebie" };
    }
    if (!participants.has(recipientId)) {
      return { ok: false, message: "Brak uprawnień do wysłania wiadomości do wybranego odbiorcy" };
    }
  }
  return { ok: true };
}

/** Sprawdza, czy nadawca może napisać do konkretnego użytkownika (także pojedynczego rodzica). */
export async function canMessageRecipient(params: {
  senderId: string;
  senderRole: MessagePortalRole;
  schoolId: string;
  recipientId: string;
}): Promise<boolean> {
  const userRes = await queryDb<{ role: string; school_id: string }>(
    `SELECT role, school_id FROM users WHERE id = $1 AND active = TRUE LIMIT 1`,
    [params.recipientId]
  );
  const recipient = userRes.rows[0];
  if (!recipient || recipient.role === "ADMIN") return false;
  if (recipient.school_id !== params.schoolId) return false;

  if (params.senderRole === "MANAGER") {
    return recipient.role === "PARENT" || recipient.role === "TEACHER";
  }

  if (params.senderRole === "TEACHER") {
    if (recipient.role !== "PARENT") return false;
    const r = await queryDb<{ ok: number }>(
      `SELECT 1 AS ok
       FROM users u
       JOIN children c ON c.parent_id = u.id AND c.school_id = $2 AND c.active = TRUE
       JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       JOIN groups g ON g.id = gs.group_id AND g.teacher_id = $1 AND g.school_id = $2
       JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
       WHERE u.id = $3 AND u.role = 'PARENT'
       LIMIT 1`,
      [params.senderId, params.schoolId, params.recipientId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  if (params.senderRole === "PARENT") {
    if (recipient.role === "MANAGER") {
      return recipient.school_id === params.schoolId;
    }
    if (recipient.role !== "TEACHER") return false;
    const r = await queryDb<{ ok: number }>(
      `SELECT 1 AS ok
       FROM children c
       JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       JOIN groups g ON g.id = gs.group_id AND g.school_id = $2
       JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
       WHERE c.parent_id = $1 AND c.school_id = $2 AND c.active = TRUE AND g.teacher_id = $3
       LIMIT 1`,
      [params.senderId, params.schoolId, params.recipientId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  return false;
}

export type RecipientFilters = {
  groupId?: string;
  groupIds?: string[];
  locationIds?: string[];
  schoolYearId?: string;
  teacherId?: string;
  enrollmentStatus?: string;
  all?: boolean;
  search?: string;
  /** Tylko dla zarządcy: lista nauczycieli zamiast rodziców. */
  audience?: "parents" | "teachers";
  /** Tylko dla zarządcy: wszyscy rodzice ze szkoły (poza filtrami grup). */
  bulkParents?: "active" | "all";
  /** Rodzice z odnowieniem bez odpowiedzi (PROPOSED / PENDING_CONFIRMATION). */
  renewalNoResponse?: boolean;
};

function hasGroupFilters(filters: RecipientFilters): boolean {
  return !!(
    filters.groupId ||
    (filters.groupIds && filters.groupIds.length > 0) ||
    (filters.locationIds && filters.locationIds.length > 0) ||
    filters.schoolYearId ||
    filters.teacherId ||
    filters.enrollmentStatus ||
    filters.renewalNoResponse
  );
}

function userSearchClause(alias: string, paramIndex: number): string {
  return `AND (
    ${alias}.first_name ILIKE $${paramIndex}
    OR ${alias}.last_name ILIKE $${paramIndex}
    OR ${alias}.email ILIKE $${paramIndex}
    OR CONCAT(${alias}.first_name, ' ', ${alias}.last_name) ILIKE $${paramIndex}
  )`;
}

const parentSearchClause = userSearchClause;

export type ParentRecipient = MessageUserRow & {
  child_names?: string;
};

export async function fetchRecipientsForRole(params: {
  userId: string;
  role: MessagePortalRole;
  schoolId: string;
  filters: RecipientFilters;
}): Promise<{ parents: ParentRecipient[]; teachers: MessageUserRow[] }> {
  if (params.role === "TEACHER") {
    const parents = await queryParentsForTeacher(
      params.userId,
      params.schoolId,
      params.filters
    );
    return { parents, teachers: [] };
  }
  if (params.role === "PARENT") {
    const [managers, teachers] = await Promise.all([
      querySchoolManagers(params.schoolId, params.filters.search),
      queryParentTeachers(params.userId, params.schoolId, params.filters.search),
    ]);
    const managerIds = new Set(managers.map((m) => m.id));
    return {
      parents: [],
      teachers: [...managers, ...teachers.filter((t) => !managerIds.has(t.id))],
    };
  }
  return queryManagerRecipients(params.schoolId, params.filters);
}

async function queryTeacherParents(
  teacherId: string,
  schoolId: string,
  search?: string
): Promise<ParentRecipient[]> {
  const searchTrim = search?.trim();
  const values: unknown[] = [teacherId, schoolId];
  let searchSql = "";
  if (searchTrim) {
    values.push(`%${searchTrim}%`);
    searchSql = parentSearchClause("u", 3);
  }
  const r = await queryDb<ParentRecipient>(
    `SELECT DISTINCT ON (u.id)
       u.id,
       u.first_name,
       u.last_name,
       u.email,
       u.role,
       u.access_level,
       STRING_AGG(DISTINCT CONCAT(c.first_name, ' ', c.last_name), ', ') AS child_names
     FROM users u
     JOIN children c ON c.parent_id = u.id AND c.school_id = $2 AND c.active = TRUE
     JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
     JOIN groups g ON g.id = gs.group_id AND g.teacher_id = $1 AND g.school_id = $2
     JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
     WHERE u.role = 'PARENT' AND u.school_id = $2
       ${searchSql}
     GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.access_level
     ORDER BY u.id, u.last_name, u.first_name`,
    values
  );
  return r.rows;
}

async function queryAllSchoolParents(
  schoolId: string,
  search?: string,
  activeOnly = true
): Promise<ParentRecipient[]> {
  const searchTrim = search?.trim();
  const values: unknown[] = [schoolId];
  let searchSql = "";
  if (searchTrim) {
    values.push(`%${searchTrim}%`);
    searchSql = parentSearchClause("u", 2);
  }
  const activeSql = activeOnly ? "AND u.active = TRUE" : "";
  const r = await queryDb<ParentRecipient>(
    `SELECT id, first_name, last_name, email, role, access_level
     FROM users u
     WHERE u.school_id = $1 AND u.role = 'PARENT' ${activeSql}
       ${searchSql}
     ORDER BY u.last_name, u.first_name`,
    values
  );
  return r.rows;
}

async function querySchoolManagers(
  schoolId: string,
  search?: string
): Promise<MessageUserRow[]> {
  const searchTrim = search?.trim();
  const values: unknown[] = [schoolId];
  let searchSql = "";
  if (searchTrim) {
    values.push(`%${searchTrim}%`);
    searchSql = userSearchClause("u", 2);
  }
  const r = await queryDb<MessageUserRow>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role
     FROM users u
     WHERE u.school_id = $1 AND u.role = 'MANAGER' AND u.active = TRUE
       ${searchSql}
     ORDER BY u.last_name, u.first_name`,
    values
  );
  return r.rows;
}

async function queryParentsForTeacher(
  teacherId: string,
  schoolId: string,
  filters: RecipientFilters
): Promise<ParentRecipient[]> {
  if (!hasGroupFilters(filters)) {
    return queryTeacherParents(teacherId, schoolId, filters.search);
  }
  return queryFilteredParents(schoolId, filters, teacherId);
}

async function queryFilteredParents(
  schoolId: string,
  filters: RecipientFilters,
  scopeTeacherId?: string
): Promise<ParentRecipient[]> {
  const conditions: string[] = [
    "u.school_id = $1",
    "u.role = 'PARENT'",
    "u.active = TRUE",
    "c.school_id = $1",
    "c.active = TRUE",
    "gs.left_at IS NULL",
    "g.school_id = $1",
  ];
  const values: unknown[] = [schoolId];
  let idx = 2;

  if (scopeTeacherId) {
    conditions.push(`g.teacher_id = $${idx++}`);
    values.push(scopeTeacherId);
    conditions.push("sy.active = TRUE");
  }

  if (filters.groupIds && filters.groupIds.length > 0) {
    conditions.push(`g.id = ANY($${idx}::text[])`);
    values.push(filters.groupIds);
    idx++;
  } else if (filters.groupId) {
    conditions.push(`g.id = $${idx++}`);
    values.push(filters.groupId);
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    conditions.push(
      `(g.location_id = ANY($${idx}::text[]) OR st.location_id = ANY($${idx}::text[]))`
    );
    values.push(filters.locationIds);
    idx++;
  }
  if (filters.schoolYearId) {
    conditions.push(`g.school_year_id = $${idx++}`);
    values.push(filters.schoolYearId);
  }
  if (filters.teacherId && !scopeTeacherId) {
    conditions.push(`g.teacher_id = $${idx++}`);
    values.push(filters.teacherId);
  }
  if (filters.enrollmentStatus) {
    if (filters.enrollmentStatus.startsWith("account:")) {
      conditions.push(`UPPER(BTRIM(COALESCE(u.access_level::text, 'PENDING'))) = $${idx++}`);
      values.push(filters.enrollmentStatus.slice("account:".length).toUpperCase());
    } else {
      conditions.push(
        `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW'))) = UPPER(BTRIM($${idx++}::text))`
      );
      values.push(filters.enrollmentStatus);
    }
  }
  if (filters.renewalNoResponse) {
    conditions.push(`EXISTS (
      SELECT 1 FROM renewals rn
      WHERE rn.child_id = c.id
        AND rn.school_id = $1
        AND UPPER(BTRIM(COALESCE(rn.status::text, ''))) IN ('PROPOSED', 'PENDING_CONFIRMATION')
    )`);
  }
  if (filters.search?.trim()) {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(parentSearchClause("u", idx++).replace(/^AND /, ""));
  }

  const schoolYearJoin = scopeTeacherId
    ? "JOIN school_years sy ON sy.id = g.school_year_id"
    : "";

  const childNamesSelect = scopeTeacherId
    ? ", STRING_AGG(DISTINCT CONCAT(c.first_name, ' ', c.last_name), ', ') AS child_names"
    : "";

  const groupBy = scopeTeacherId
    ? "GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.access_level"
    : "";

  const r = await queryDb<ParentRecipient>(
    `SELECT DISTINCT ON (u.id)
       u.id,
       u.first_name,
       u.last_name,
       u.email,
       u.role,
       u.access_level
       ${childNamesSelect}
     FROM users u
     JOIN children c ON c.parent_id = u.id
     JOIN group_students gs ON gs.child_id = c.id
     JOIN groups g ON g.id = gs.group_id
     ${schoolYearJoin}
     LEFT JOIN schedule_templates st ON st.group_id = g.id
     WHERE ${conditions.join(" AND ")}
     ${groupBy}
     ORDER BY u.id, u.last_name, u.first_name`,
    values
  );
  return r.rows;
}

async function queryParentTeachers(
  parentId: string,
  schoolId: string,
  search?: string
): Promise<MessageUserRow[]> {
  const searchTrim = search?.trim();
  const values: unknown[] = [parentId, schoolId];
  let searchSql = "";
  if (searchTrim) {
    values.push(`%${searchTrim}%`);
    searchSql = userSearchClause("t", 3);
  }
  const r = await queryDb<MessageUserRow>(
    `SELECT DISTINCT
       t.id,
       t.first_name,
       t.last_name,
       t.email,
       t.role
     FROM children c
     JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
     JOIN groups g ON g.id = gs.group_id AND g.school_id = $2
     JOIN school_years sy ON sy.id = g.school_year_id AND sy.active = TRUE
     JOIN users t ON t.id = g.teacher_id AND t.active = TRUE
     WHERE c.parent_id = $1 AND c.school_id = $2 AND c.active = TRUE
       AND t.id IS NOT NULL
       ${searchSql}
     ORDER BY t.last_name, t.first_name`,
    values
  );
  return r.rows;
}

async function querySchoolTeachers(
  schoolId: string,
  search?: string
): Promise<MessageUserRow[]> {
  const searchTrim = search?.trim();
  const values: unknown[] = [schoolId];
  let searchSql = "";
  if (searchTrim) {
    values.push(`%${searchTrim}%`);
    searchSql = userSearchClause("u", 2);
  }
  const r = await queryDb<MessageUserRow>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role
     FROM users u
     WHERE u.school_id = $1 AND u.role = 'TEACHER' AND u.active = TRUE
       ${searchSql}
     ORDER BY u.last_name, u.first_name`,
    values
  );
  return r.rows;
}

async function queryManagerRecipients(
  schoolId: string,
  filters: RecipientFilters
): Promise<{ parents: ParentRecipient[]; teachers: MessageUserRow[] }> {
  if (filters.audience === "teachers") {
    const teachers = await querySchoolTeachers(schoolId, filters.search);
    return { parents: [], teachers };
  }

  const teachersRes = await queryDb<MessageUserRow>(
    `SELECT id, first_name, last_name, email, role
     FROM users
     WHERE school_id = $1 AND role = 'TEACHER' AND active = TRUE
     ORDER BY last_name, first_name`,
    [schoolId]
  );

  if (filters.bulkParents === "all") {
    const parents = await queryAllSchoolParents(schoolId, filters.search, false);
    return { parents, teachers: teachersRes.rows };
  }
  if (filters.bulkParents === "active") {
    const parents = await queryAllSchoolParents(schoolId, filters.search, true);
    return { parents, teachers: teachersRes.rows };
  }

  if (filters.all || !hasGroupFilters(filters)) {
    const parents = await queryAllSchoolParents(schoolId, filters.search);
    return { parents, teachers: teachersRes.rows };
  }

  const parents = await queryFilteredParents(schoolId, filters);
  return { parents, teachers: teachersRes.rows };
}

export async function insertMessages(
  client: PoolClient,
  rows: Array<{
    schoolId: string;
    parentId: string | null;
    senderId: string;
    senderRole: string;
    recipientId: string;
    subject: string;
    content: string;
    parentMessageId: string | null;
    broadcastId: string | null;
  }>
): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) {
    const id = randomUUID();
    ids.push(id);
    await client.query(
      `INSERT INTO messages (
         id, school_id, parent_id, sender_id, sender_role, recipient_id,
         subject, content, parent_message_id, broadcast_id, email_status, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW()
       )`,
      [
        id,
        row.schoolId,
        row.parentId,
        row.senderId,
        row.senderRole,
        row.recipientId,
        row.subject,
        row.content,
        row.parentMessageId,
        row.broadcastId,
      ]
    );
  }
  return ids;
}

/** Użytkownicy szkoły o podanych adresach e-mail (klucz: email lowercase). */
export async function resolveUsersByEmails(
  schoolId: string,
  emails: string[]
): Promise<
  Map<string, { id: string; email: string; first_name: string; last_name: string; role: string }>
> {
  if (emails.length === 0) return new Map();
  const r = await queryDb<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  }>(
    `SELECT id, email, first_name, last_name, role
     FROM users
     WHERE school_id = $1
       AND active = TRUE
       AND LOWER(TRIM(email::text)) = ANY($2::text[])`,
    [schoolId, emails]
  );
  const map = new Map<
    string,
    { id: string; email: string; first_name: string; last_name: string; role: string }
  >();
  for (const row of r.rows) {
    map.set(row.email.trim().toLowerCase(), row);
  }
  return map;
}

export async function getUsersForEmail(
  userIds: string[]
): Promise<Array<{ id: string; email: string; first_name: string; last_name: string; role: string }>> {
  if (userIds.length === 0) return [];
  const r = await queryDb<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
  }>(
    `SELECT id, email, first_name, last_name, role
     FROM users WHERE id = ANY($1::text[])`,
    [userIds]
  );
  return r.rows;
}

export function roleLabelPl(role: string): string {
  if (role === "MANAGER") return "Zarządca szkoły";
  if (role === "TEACHER") return "Nauczyciel";
  if (role === "PARENT") return "Rodzic";
  return role;
}
