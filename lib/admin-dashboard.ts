import { queryDb } from "@/lib/db";
import { sqlExistsUnfilledFutureScheduleSlot } from "@/lib/lesson-generation";
import { formatRenewalStatusLabel } from "@/lib/renewal-status";
import {
  SCHOOL_TIMEZONE,
  periodMonthStartYmd,
  sqlSchoolTimestampAsTimestamptz,
  toIsoUtc,
  todayYmdSchool,
} from "@/lib/school-timezone";

const TZ = SCHOOL_TIMEZONE;

export function todayYmdWarsaw(): string {
  return todayYmdSchool();
}

function weekEndYmd(fromYmd: string): string {
  const d = new Date(`${fromYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type DashboardCounters = {
  pendingEnrollments: number;
  renewalsNoResponse: number;
  negotiatingEnrollments: number;
  resignations: number;
};

export type DashboardLessonRow = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  groupId: string;
  groupName: string;
  locationName: string;
  teacherName: string;
  /** Z harmonogramu grupy, gdy brak wpisu w kalendarzu lekcji. */
  fromSchedule?: boolean;
};

function slotKey(groupId: string, scheduledAt: string): string {
  const d = new Date(scheduledAt);
  if (Number.isNaN(d.getTime())) return `${groupId}|${scheduledAt}`;
  return `${groupId}|${d.toISOString().slice(0, 16)}`;
}

export type DashboardBillingSummary = {
  unsettledCount: number;
  unpaidCount: number;
  periodMonth: string;
  items: Array<{
    childId: string;
    childName: string;
    parentEmail: string;
    status: string | null;
    amount: string | null;
  }>;
};

export type ResignationAlert = {
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  reason: string | null;
  requestedAt: string | null;
};

export async function fetchDashboardCounters(schoolId: string): Promise<DashboardCounters> {
  const res = await queryDb<{
    pending_enrollments: string;
    renewals_no_response: string;
    negotiating: string;
    resignations: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM enrollment_requests er
        WHERE er.school_id = $1
          AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW') AS pending_enrollments,
       (SELECT COUNT(*)::text FROM renewals r
        WHERE r.school_id = $1
          AND UPPER(BTRIM(COALESCE(r.status::text, ''))) IN ('PROPOSED', 'PENDING_CONFIRMATION')) AS renewals_no_response,
       (SELECT COUNT(*)::text FROM enrollment_requests er
        WHERE er.school_id = $1
          AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEGOTIATING') AS negotiating,
       (SELECT COUNT(*)::text FROM children c
        WHERE c.school_id = $1
          AND c.active = TRUE
          AND c.resignation_requested = TRUE) AS resignations`,
    [schoolId]
  );
  const row = res.rows[0];
  return {
    pendingEnrollments: Number(row?.pending_enrollments ?? 0),
    renewalsNoResponse: Number(row?.renewals_no_response ?? 0),
    negotiatingEnrollments: Number(row?.negotiating ?? 0),
    resignations: Number(row?.resignations ?? 0),
  };
}

export async function fetchDashboardLessons(
  schoolId: string,
  fromYmd: string,
  toYmd: string
): Promise<DashboardLessonRow[]> {
  const res = await queryDb<{
    id: string;
    scheduled_at: Date | string;
    duration_min: number;
    status: string;
    group_id: string;
    group_name: string;
    location_name: string;
    teacher_first: string;
    teacher_last: string;
  }>(
    `SELECT
       l.id,
       ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
       l.duration_min,
       l.status::text AS status,
       g.id AS group_id,
       g.name AS group_name,
       COALESCE(loc.name, '—') AS location_name,
       u.first_name AS teacher_first,
       u.last_name AS teacher_last
     FROM lessons l
     JOIN groups g ON g.id = l.group_id AND g.school_id = $1
     JOIN school_years sy ON sy.id = l.school_year_id
       AND sy.school_id = $1 AND sy.active = TRUE
     LEFT JOIN locations loc ON loc.id = l.location_id
     JOIN users u ON u.id = l.teacher_id
     WHERE l.status <> 'CANCELLED'
       AND l.scheduled_at >= $2::date
       AND l.scheduled_at < ($3::date + interval '1 day')
     ORDER BY l.scheduled_at ASC`,
    [schoolId, fromYmd, toYmd]
  );
  return res.rows.map((row) => ({
    id: row.id,
    scheduledAt: toIsoUtc(row.scheduled_at),
    durationMin: row.duration_min,
    status: row.status,
    groupId: row.group_id,
    groupName: row.group_name,
    locationName: row.location_name,
    teacherName: `${row.teacher_first} ${row.teacher_last}`.trim(),
    fromSchedule: false,
  }));
}

/** Terminy z harmonogramu grup (gdy lekcje nie zostały jeszcze wygenerowane). */
export async function fetchDashboardScheduleSlots(
  schoolId: string,
  fromYmd: string,
  toYmd: string
): Promise<DashboardLessonRow[]> {
  const res = await queryDb<{
    id: string;
    group_id: string;
    scheduled_at: Date | string;
    duration_min: number;
    status: string;
    group_name: string;
    location_name: string;
    teacher_first: string;
    teacher_last: string;
  }>(
    `SELECT
       CONCAT('schedule-', st.id, '-', TO_CHAR(d.day, 'YYYY-MM-DD')) AS id,
       g.id AS group_id,
       ((d.day::date + st.start_time) AT TIME ZONE '${TZ}') AS scheduled_at,
       st.duration_min,
       'HARMONOGRAM' AS status,
       g.name AS group_name,
       COALESCE(loc.name, '—') AS location_name,
       u.first_name AS teacher_first,
       u.last_name AS teacher_last
     FROM schedule_templates st
     JOIN groups g ON g.id = st.group_id AND g.school_id = $1 AND g.active = TRUE
     JOIN school_years sy ON sy.id = st.school_year_id AND sy.school_id = $1 AND sy.active = TRUE
     LEFT JOIN locations loc ON loc.id = st.location_id
     JOIN users u ON u.id = g.teacher_id
     CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d(day)
     WHERE st.day_of_week = EXTRACT(ISODOW FROM d.day)::int
     ORDER BY scheduled_at ASC, g.name ASC`,
    [schoolId, fromYmd, toYmd]
  );

  return res.rows.map((row) => ({
    id: row.id,
    scheduledAt: toIsoUtc(row.scheduled_at),
    durationMin: row.duration_min,
    status: row.status,
    groupId: row.group_id,
    groupName: row.group_name,
    locationName: row.location_name,
    teacherName: `${row.teacher_first} ${row.teacher_last}`.trim(),
    fromSchedule: true,
  }));
}

async function fetchDashboardLessonsMerged(
  schoolId: string,
  fromYmd: string,
  toYmd: string
): Promise<DashboardLessonRow[]> {
  const [lessons, slots] = await Promise.all([
    fetchDashboardLessons(schoolId, fromYmd, toYmd),
    fetchDashboardScheduleSlots(schoolId, fromYmd, toYmd),
  ]);
  if (lessons.length === 0) return slots;

  const lessonKeys = new Set(lessons.map((l) => slotKey(l.groupId, l.scheduledAt)));
  const extra = slots.filter((s) => !lessonKeys.has(slotKey(s.groupId, s.scheduledAt)));
  return [...lessons, ...extra].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
}

export async function fetchDashboardBillingSummary(
  schoolId: string
): Promise<DashboardBillingSummary> {
  const periodMonth = periodMonthStartYmd();

  const res = await queryDb<{
    child_id: string;
    first_name: string;
    last_name: string;
    parent_email: string;
    billing_status: string | null;
    billing_amount: string | null;
    has_contract: boolean;
  }>(
    `SELECT
       ch.id AS child_id,
       ch.first_name,
       ch.last_name,
       u.email AS parent_email,
       lbp.status AS billing_status,
       lbp.amount::text AS billing_amount,
       TRUE AS has_contract
     FROM contracts ct
     JOIN contract_children cc ON cc.contract_id = ct.id
     JOIN children ch ON ch.id = cc.child_id AND ch.school_id = $1 AND ch.active = TRUE
     JOIN users u ON u.id = ct.parent_id
     LEFT JOIN lesson_billing_periods lbp
       ON lbp.child_id = ch.id AND lbp.period_month = $2::date
     WHERE ct.payment_type = 'PER_LESSON'
       AND ct.status = 'SIGNED'
       AND ct.school_id = $1
     ORDER BY ch.last_name, ch.first_name`,
    [schoolId, periodMonth]
  );

  let unsettledCount = 0;
  let unpaidCount = 0;
  const items: DashboardBillingSummary["items"] = [];

  for (const row of res.rows) {
    const status = row.billing_status?.toUpperCase() ?? null;
    if (!status || status === "DRAFT") unsettledCount++;
    if (status === "APPROVED" || status === "INVOICED") unpaidCount++;
    if (!status || status === "DRAFT" || status === "APPROVED" || status === "INVOICED") {
      items.push({
        childId: row.child_id,
        childName: `${row.first_name} ${row.last_name}`.trim(),
        parentEmail: row.parent_email,
        status: row.billing_status,
        amount: row.billing_amount,
      });
    }
  }

  return {
    unsettledCount,
    unpaidCount,
    periodMonth: periodMonth.slice(0, 7),
    items: items.slice(0, 20),
  };
}

export type ResignationListRow = ResignationAlert & {
  groupName: string | null;
  accessLevel: string | null;
};

export async function fetchResignationsList(schoolId: string): Promise<ResignationListRow[]> {
  const res = await queryDb<{
    child_id: string;
    child_first: string;
    child_last: string;
    parent_id: string;
    parent_first: string;
    parent_last: string;
    parent_email: string;
    reason: string | null;
    requested_at: Date | string | null;
    group_name: string | null;
    access_level: string | null;
  }>(
    `SELECT
       c.id AS child_id,
       c.first_name AS child_first,
       c.last_name AS child_last,
       u.id AS parent_id,
       u.first_name AS parent_first,
       u.last_name AS parent_last,
       u.email AS parent_email,
       c.resignation_reason AS reason,
       c.resignation_date AS requested_at,
       UPPER(BTRIM(COALESCE(c.access_level::text, ''))) AS access_level,
       (
         SELECT g.name
         FROM group_students gs
         JOIN groups g ON g.id = gs.group_id AND g.school_id = c.school_id
         WHERE gs.child_id = c.id AND gs.left_at IS NULL
         ORDER BY gs.enrolled_at DESC NULLS LAST
         LIMIT 1
       ) AS group_name
     FROM children c
     JOIN users u ON u.id = c.parent_id
     WHERE c.school_id = $1
       AND c.active = TRUE
       AND c.resignation_requested = TRUE
     ORDER BY c.resignation_date DESC NULLS LAST, c.last_name, c.first_name`,
    [schoolId]
  );
  return res.rows.map((row) => ({
    childId: row.child_id,
    childName: `${row.child_first} ${row.child_last}`.trim(),
    parentId: row.parent_id,
    parentName: `${row.parent_first} ${row.parent_last}`.trim(),
    parentEmail: row.parent_email,
    reason: row.reason,
    requestedAt: row.requested_at
      ? row.requested_at instanceof Date
        ? row.requested_at.toISOString()
        : String(row.requested_at)
      : null,
    groupName: row.group_name,
    accessLevel: row.access_level || null,
  }));
}

export async function countOpenResignations(schoolId: string): Promise<number> {
  const res = await queryDb<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM children c
     WHERE c.school_id = $1
       AND c.active = TRUE
       AND c.resignation_requested = TRUE`,
    [schoolId]
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Oczekujące zgłoszenia (status NEW). `schoolId` null = wszystkie szkoły (ADMIN). */
export async function countPendingEnrollments(schoolId: string | null): Promise<number> {
  const res = schoolId
    ? await queryDb<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM enrollment_requests er
         WHERE er.school_id = $1
           AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW'`,
        [schoolId]
      )
    : await queryDb<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM enrollment_requests er
         WHERE UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW'`
      );
  return Number(res.rows[0]?.n ?? 0);
}

export type PipelineRow = {
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  enrollmentStatus: string;
  proposalGroup: string | null;
  contractStatus: string | null;
  groupName: string | null;
  billingStatus: string | null;
  renewalStatus: string | null;
};

/**
 * Lista uczniów w Zgłoszeniach — ten sam zestaw co filtr „Wszystkie”
 * (otwarte enrollment_requests, bez SIGNED/COMPLETED), nie tylko aktywne `children`.
 */
export async function fetchStudentPipeline(
  schoolId: string,
  search?: string
): Promise<PipelineRow[]> {
  const searchTrim = search?.trim();
  const periodMonth = periodMonthStartYmd();
  const params: unknown[] = [schoolId, periodMonth];
  let searchClause = "";
  if (searchTrim) {
    params.push(`%${searchTrim}%`);
    searchClause = `AND (
      COALESCE(c.first_name, er.child_first_name, '') ILIKE $3
      OR COALESCE(c.last_name, er.child_last_name, '') ILIKE $3
      OR COALESCE(u.first_name, er.parent_first_name, '') ILIKE $3
      OR COALESCE(u.last_name, er.parent_last_name, '') ILIKE $3
      OR COALESCE(u.email, er.parent_email, '') ILIKE $3
      OR CONCAT(
           COALESCE(c.first_name, er.child_first_name, ''),
           ' ',
           COALESCE(c.last_name, er.child_last_name, '')
         ) ILIKE $3
    )`;
  }

  const res = await queryDb<{
    child_id: string;
    child_first: string;
    child_last: string;
    parent_id: string;
    parent_first: string;
    parent_last: string;
    parent_email: string;
    access_level: string;
    proposal_group: string | null;
    contract_status: string | null;
    group_name: string | null;
    billing_status: string | null;
    renewal_status: string | null;
  }>(
    `SELECT
       COALESCE(c.id, er.id) AS child_id,
       COALESCE(c.first_name, er.child_first_name, '') AS child_first,
       COALESCE(c.last_name, er.child_last_name, '') AS child_last,
       COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, '') AS parent_id,
       COALESCE(
         NULLIF(BTRIM(u.first_name), ''),
         NULLIF(BTRIM(er.parent_first_name), ''),
         ''
       ) AS parent_first,
       COALESCE(
         NULLIF(BTRIM(u.last_name), ''),
         NULLIF(BTRIM(er.parent_last_name), ''),
         ''
       ) AS parent_last,
       COALESCE(
         NULLIF(BTRIM(u.email), ''),
         NULLIF(BTRIM(er.parent_email), ''),
         ''
       ) AS parent_email,
       UPPER(BTRIM(COALESCE(er.status::text, c.access_level::text, 'NEW'))) AS access_level,
       pg.name AS proposal_group,
       ct.status AS contract_status,
       cg.name AS group_name,
       lbp.status AS billing_status,
       rn.status AS renewal_status
     FROM enrollment_requests er
     LEFT JOIN users u
       ON (
         u.id = NULLIF(BTRIM(er.user_id), '')
         OR (
           u.school_id = er.school_id
           AND LOWER(u.email::text) = LOWER(er.parent_email::text)
         )
       )
     LEFT JOIN children c
       ON c.parent_id = COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id)
      AND c.school_id = er.school_id
      AND c.first_name = er.child_first_name
      AND c.last_name = er.child_last_name
     LEFT JOIN groups pg ON pg.id = er.proposed_group_id
     LEFT JOIN LATERAL (
       SELECT ct2.status
       FROM contracts ct2
       JOIN contract_children cc ON cc.contract_id = ct2.id AND cc.child_id = c.id
       WHERE c.id IS NOT NULL
         AND ct2.parent_id = c.parent_id
         AND ct2.school_id = er.school_id
       ORDER BY ct2.created_at DESC
       LIMIT 1
     ) ct ON TRUE
     LEFT JOIN LATERAL (
       SELECT g.name
       FROM group_students gs
       JOIN groups g ON g.id = gs.group_id AND g.school_id = er.school_id
       JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
       WHERE c.id IS NOT NULL
         AND gs.child_id = c.id
         AND gs.left_at IS NULL
       ORDER BY gs.enrolled_at DESC NULLS LAST
       LIMIT 1
     ) cg ON TRUE
     LEFT JOIN lesson_billing_periods lbp
       ON c.id IS NOT NULL
      AND lbp.child_id = c.id
      AND lbp.period_month = $2::date
     LEFT JOIN LATERAL (
       SELECT UPPER(BTRIM(COALESCE(r.status::text, ''))) AS status
       FROM renewals r
       WHERE c.id IS NOT NULL
         AND r.child_id = c.id
         AND r.school_id = er.school_id
       ORDER BY r.initiated_at DESC
       LIMIT 1
     ) rn ON TRUE
     WHERE er.school_id = $1
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN ('COMPLETED', 'SIGNED')
       AND COALESCE(c.first_name, er.child_first_name, '') <> ''
       AND COALESCE(c.last_name, er.child_last_name, '') <> ''
       AND (
         COALESCE(u.id, NULLIF(BTRIM(er.user_id), '')) IS NOT NULL
         OR NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
       )
       ${searchClause}
     ORDER BY
       COALESCE(c.last_name, er.child_last_name),
       COALESCE(c.first_name, er.child_first_name)`,
    params
  );

  return res.rows.map((row) => ({
    childId: row.child_id,
    childName: `${row.child_first} ${row.child_last}`.trim(),
    parentId: row.parent_id,
    parentName: `${row.parent_first} ${row.parent_last}`.trim(),
    parentEmail: row.parent_email,
    enrollmentStatus: row.access_level,
    proposalGroup: row.proposal_group,
    contractStatus: row.contract_status,
    groupName: row.group_name,
    billingStatus: row.billing_status,
    renewalStatus: row.renewal_status,
  }));
}

export type RenewalPipelineRow = {
  renewalId: string;
  childId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  season: string;
  renewalStatus: string;
  renewalStatusLabel: string;
  proposalGroup: string | null;
  contractStatus: string | null;
  targetGroup: string | null;
};

export async function fetchRenewalPipeline(
  schoolId: string,
  season: string,
  search?: string
): Promise<RenewalPipelineRow[]> {
  const searchTrim = search?.trim();
  const params: unknown[] = [schoolId, season];
  let searchClause = "";
  if (searchTrim) {
    params.push(`%${searchTrim}%`);
    searchClause = `AND (
      c.first_name ILIKE $3 OR c.last_name ILIKE $3
      OR u.first_name ILIKE $3 OR u.last_name ILIKE $3
      OR u.email ILIKE $3
      OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $3
    )`;
  }

  const res = await queryDb<{
    renewal_id: string;
    child_id: string;
    child_first: string;
    child_last: string;
    parent_first: string;
    parent_last: string;
    parent_email: string;
    season: string;
    renewal_status: string;
    proposal_group: string | null;
    contract_status: string | null;
    target_group: string | null;
  }>(
    `SELECT
       r.id AS renewal_id,
       c.id AS child_id,
       c.first_name AS child_first,
       c.last_name AS child_last,
       u.first_name AS parent_first,
       u.last_name AS parent_last,
       u.email AS parent_email,
       r.season,
       UPPER(BTRIM(COALESCE(r.status::text, ''))) AS renewal_status,
       pg.name AS proposal_group,
       ct.status AS contract_status,
       tg.name AS target_group
     FROM renewals r
     JOIN children c ON c.id = r.child_id
     JOIN users u ON u.id = r.parent_id
     LEFT JOIN groups pg ON pg.id = r.proposed_group_id
     LEFT JOIN groups tg ON tg.id = r.proposed_group_id
     LEFT JOIN LATERAL (
       SELECT ct2.status
       FROM contracts ct2
       JOIN contract_children cc ON cc.contract_id = ct2.id AND cc.child_id = c.id
       JOIN school_years sy ON sy.id = ct2.school_year_id AND sy.name = r.season
       WHERE ct2.parent_id = r.parent_id AND ct2.school_id = r.school_id
       ORDER BY ct2.created_at DESC
       LIMIT 1
     ) ct ON TRUE
     WHERE r.school_id = $1
       AND r.season = $2
       AND UPPER(BTRIM(COALESCE(r.status::text, ''))) <> 'DRAFT'
       ${searchClause}
     ORDER BY
       CASE UPPER(BTRIM(COALESCE(r.status::text, '')))
         WHEN 'PENDING_CONFIRMATION' THEN 0
         WHEN 'CONFIRMED' THEN 1
         WHEN 'PROPOSED' THEN 2
         WHEN 'NEGOTIATING' THEN 3
         WHEN 'ACCEPTED' THEN 4
         WHEN 'AWAITING_CONTRACT' THEN 5
         WHEN 'CONTRACT_READY' THEN 6
         WHEN 'SIGNED' THEN 7
         WHEN 'RESIGNED' THEN 8
         ELSE 9
       END,
       c.last_name,
       c.first_name
     LIMIT 200`,
    params
  );

  return res.rows.map((row) => ({
    renewalId: row.renewal_id,
    childId: row.child_id,
    childName: `${row.child_first} ${row.child_last}`.trim(),
    parentName: `${row.parent_first} ${row.parent_last}`.trim(),
    parentEmail: row.parent_email,
    season: row.season,
    renewalStatus: row.renewal_status,
    renewalStatusLabel: formatRenewalStatusLabel(row.renewal_status),
    proposalGroup: row.proposal_group,
    contractStatus: row.contract_status,
    targetGroup: row.target_group,
  }));
}

export type GroupRosterChild = {
  childId: string;
  childName: string;
};

export type GroupRosterRow = {
  groupId: string;
  groupName: string;
  level: string | null;
  locationName: string;
  teacherName: string;
  children: GroupRosterChild[];
};

export async function fetchGroupsRoster(schoolId: string): Promise<GroupRosterRow[]> {
  const res = await queryDb<{
    group_id: string;
    group_name: string;
    level: string | null;
    location_name: string;
    teacher_name: string;
    child_id: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
  }>(
    `SELECT
       g.id AS group_id,
       g.name AS group_name,
       g.level,
       COALESCE(loc.name, '—') AS location_name,
       CASE
         WHEN t.id IS NULL THEN '—'
         ELSE TRIM(CONCAT(COALESCE(t.first_name, ''), ' ', COALESCE(t.last_name, '')))
       END AS teacher_name,
       c.id AS child_id,
       c.first_name AS child_first_name,
       c.last_name AS child_last_name
     FROM groups g
     LEFT JOIN locations loc ON loc.id = g.location_id
     LEFT JOIN users t ON t.id = g.teacher_id
     LEFT JOIN group_students gs
       ON gs.group_id = g.id
      AND gs.left_at IS NULL
      AND EXISTS (
        SELECT 1 FROM school_years sy
        WHERE sy.id = gs.school_year_id AND sy.active = TRUE
      )
     LEFT JOIN children c ON c.id = gs.child_id
     WHERE g.school_id = $1 AND g.active = TRUE
     ORDER BY loc.name NULLS LAST, g.name, c.last_name NULLS LAST, c.first_name NULLS LAST`,
    [schoolId]
  );

  const byGroup = new Map<string, GroupRosterRow>();
  for (const row of res.rows) {
    let group = byGroup.get(row.group_id);
    if (!group) {
      group = {
        groupId: row.group_id,
        groupName: row.group_name,
        level: row.level,
        locationName: row.location_name,
        teacherName: row.teacher_name.trim() || "—",
        children: [],
      };
      byGroup.set(row.group_id, group);
    }
    if (row.child_id) {
      const childName =
        `${String(row.child_first_name ?? "").trim()} ${String(row.child_last_name ?? "").trim()}`.trim() ||
        "dziecko";
      group.children.push({ childId: row.child_id, childName });
    }
  }

  return Array.from(byGroup.values());
}

export type DashboardWarning = {
  type: "unconfirmed_schedule" | "missing_lessons" | "over_capacity" | "no_active_year";
  message: string;
  groupIds: string[];
  groupNames: string[];
};

/**
 * Ostrzeżenia operacyjne na pulpit (brak roku / niepotwierdzony harmonogram / brak zajęć / przepełnienie).
 * Logika zgodna z flagami `schedule_needs_confirmation` / `missing_generated_lessons` na liście grup.
 * `schoolId = null` → wszystkie szkoły (ADMIN).
 */
export async function fetchDashboardWarnings(
  schoolId: string | null
): Promise<DashboardWarning[]> {
  const schoolFilter = schoolId ? "AND g.school_id = $1" : "";
  const schoolFilterBare = schoolId ? "AND s.id = $1" : "";
  const params: string[] = schoolId ? [schoolId] : [];

  const warnings: DashboardWarning[] = [];

  const noActiveYear = await queryDb<{ id: string; name: string }>(
    `SELECT s.id, s.name
     FROM schools s
     WHERE s.active = TRUE
       ${schoolFilterBare}
       AND NOT EXISTS (
         SELECT 1 FROM school_years sy
         WHERE sy.school_id = s.id AND sy.active = TRUE
       )
     ORDER BY s.name ASC`,
    params
  );

  if (noActiveYear.rows.length > 0) {
    warnings.push({
      type: "no_active_year",
      message:
        noActiveYear.rows.length === 1
          ? "Brak aktywnego roku szkolnego — ustaw lub aktywuj rok w Organizacja → Rok szkolny."
          : "Brak aktywnego roku szkolnego w szkołach — ustaw lub aktywuj rok w Organizacja → Rok szkolny.",
      groupIds: [],
      groupNames: noActiveYear.rows.map((r) => r.name),
    });
  }

  const unconfirmed = await queryDb<{ id: string; name: string }>(
    `SELECT g.id, g.name
     FROM groups g
     WHERE g.active = TRUE
       ${schoolFilter}
       AND EXISTS (
         SELECT 1 FROM school_years sy
         WHERE sy.school_id = g.school_id AND sy.active = TRUE
       )
       AND EXISTS (
         SELECT 1 FROM schedule_templates st
         WHERE st.group_id = g.id AND st.active = TRUE
       )
       AND EXISTS (
         SELECT 1 FROM schedule_templates st
         WHERE st.group_id = g.id
           AND st.active = TRUE
           AND st.school_year_id IS DISTINCT FROM (
             SELECT sy.id FROM school_years sy
             WHERE sy.school_id = g.school_id AND sy.active = TRUE
             LIMIT 1
           )
       )
     ORDER BY g.name ASC`,
    params
  );

  if (unconfirmed.rows.length > 0) {
    warnings.push({
      type: "unconfirmed_schedule",
      message: "Niepotwierdzony harmonogram na aktywny rok — wygeneruj zajęcia:",
      groupIds: unconfirmed.rows.map((r) => r.id),
      groupNames: unconfirmed.rows.map((r) => r.name),
    });
  }

  const missingLessons = await queryDb<{ id: string; name: string }>(
    `SELECT g.id, g.name
     FROM groups g
     WHERE g.active = TRUE
       ${schoolFilter}
       AND EXISTS (
         SELECT 1 FROM school_years sy
         WHERE sy.school_id = g.school_id AND sy.active = TRUE
       )
       AND EXISTS (
         SELECT 1 FROM schedule_templates st
         WHERE st.group_id = g.id
           AND st.active = TRUE
           AND st.school_year_id = (
             SELECT sy.id FROM school_years sy
             WHERE sy.school_id = g.school_id AND sy.active = TRUE
             LIMIT 1
           )
       )
       AND NOT EXISTS (
         SELECT 1 FROM schedule_templates st
         WHERE st.group_id = g.id
           AND st.active = TRUE
           AND st.school_year_id IS DISTINCT FROM (
             SELECT sy.id FROM school_years sy
             WHERE sy.school_id = g.school_id AND sy.active = TRUE
             LIMIT 1
           )
       )
       AND ${sqlExistsUnfilledFutureScheduleSlot("g.id", "g.school_id")}
     ORDER BY g.name ASC`,
    params
  );

  if (missingLessons.rows.length > 0) {
    warnings.push({
      type: "missing_lessons",
      message:
        missingLessons.rows.length === 1
          ? "Brak wygenerowanych zajęć dla grupy:"
          : "Brak wygenerowanych zajęć dla grup:",
      groupIds: missingLessons.rows.map((r) => r.id),
      groupNames: missingLessons.rows.map((r) => r.name),
    });
  }

  const overCapacity = await queryDb<{
    id: string;
    name: string;
    students_count: number;
    max_students: number;
  }>(
    `SELECT
       g.id,
       g.name,
       g.max_students,
       (
         SELECT COUNT(*)::int
         FROM group_students gs
         WHERE gs.group_id = g.id
           AND gs.left_at IS NULL
       ) AS students_count
     FROM groups g
     WHERE g.active = TRUE
       ${schoolFilter}
       AND (
         SELECT COUNT(*)::int
         FROM group_students gs
         WHERE gs.group_id = g.id
           AND gs.left_at IS NULL
       ) > g.max_students
     ORDER BY g.name ASC`,
    params
  );

  if (overCapacity.rows.length > 0) {
    warnings.push({
      type: "over_capacity",
      message:
        overCapacity.rows.length === 1
          ? "W grupie jest więcej osób niż limit miejsc:"
          : "W grupach jest więcej osób niż limit miejsc:",
      groupIds: overCapacity.rows.map((r) => r.id),
      groupNames: overCapacity.rows.map(
        (r) => `${r.name} (${r.students_count}/${r.max_students})`
      ),
    });
  }

  return warnings;
}

export async function fetchFullDashboard(
  schoolId: string,
  options?: { warningsAcrossSchools?: boolean }
) {
  const today = todayYmdWarsaw();
  const weekEnd = weekEndYmd(today);
  const warningsSchoolId = options?.warningsAcrossSchools ? null : schoolId;

  const [counters, lessonsToday, lessonsThisWeek, billing, warnings] = await Promise.all([
    fetchDashboardCounters(schoolId),
    fetchDashboardLessonsMerged(schoolId, today, today),
    fetchDashboardLessonsMerged(schoolId, today, weekEnd),
    fetchDashboardBillingSummary(schoolId),
    fetchDashboardWarnings(warningsSchoolId),
  ]);

  return {
    counters,
    lessonsToday,
    lessonsThisWeek,
    billing,
    warnings,
  };
}
