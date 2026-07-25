import { queryDb } from "@/lib/db";
import { formatRenewalStatusLabel } from "@/lib/renewal-status";
import {
  SCHOOL_TIMEZONE,
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
  return d.toISOString().slice(0, 10);
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

export type StaleNegotiationAlert = {
  requestId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  daysSince: number;
  createdAt: string;
};

export type MissingAttendanceAlert = {
  lessonId: string;
  scheduledAt: string;
  groupName: string;
  teacherName: string;
  expectedStudents: number;
  markedStudents: number;
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
  const today = new Date();
  const periodMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

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

export async function fetchResignationAlerts(schoolId: string): Promise<ResignationAlert[]> {
  const rows = await fetchResignationsList(schoolId);
  return rows.map(
    ({ childId, childName, parentId, parentName, parentEmail, reason, requestedAt }) => ({
      childId,
      childName,
      parentId,
      parentName,
      parentEmail,
      reason,
      requestedAt,
    })
  );
}

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

export async function fetchStaleNegotiationAlerts(
  schoolId: string,
  daysThreshold: number
): Promise<StaleNegotiationAlert[]> {
  const res = await queryDb<{
    request_id: string;
    child_first: string;
    child_last: string;
    parent_first: string;
    parent_last: string;
    parent_email: string;
    created_at: Date | string;
    days_since: string;
  }>(
    `SELECT
       er.id AS request_id,
       er.child_first_name AS child_first,
       er.child_last_name AS child_last,
       COALESCE(u.first_name, er.parent_first_name) AS parent_first,
       COALESCE(u.last_name, er.parent_last_name) AS parent_last,
       COALESCE(u.email, er.parent_email) AS parent_email,
       er.created_at,
       EXTRACT(DAY FROM NOW() - COALESCE(er.proposed_at, er.created_at))::int::text AS days_since
     FROM enrollment_requests er
     LEFT JOIN users u ON u.id = NULLIF(BTRIM(er.user_id), '')
     WHERE er.school_id = $1
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEGOTIATING'
       AND COALESCE(er.proposed_at, er.created_at) < NOW() - ($2 || ' days')::interval
     ORDER BY COALESCE(er.proposed_at, er.created_at) ASC`,
    [schoolId, String(daysThreshold)]
  );
  return res.rows.map((row) => ({
    requestId: row.request_id,
    childName: `${row.child_first} ${row.child_last}`.trim(),
    parentName: `${row.parent_first} ${row.parent_last}`.trim(),
    parentEmail: row.parent_email,
    daysSince: Number(row.days_since) || daysThreshold,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

export async function fetchMissingAttendanceAlerts(
  schoolId: string
): Promise<MissingAttendanceAlert[]> {
  const res = await queryDb<{
    lesson_id: string;
    scheduled_at: Date | string;
    group_name: string;
    teacher_first: string;
    teacher_last: string;
    expected_students: string;
    marked_students: string;
  }>(
    `SELECT
       l.id AS lesson_id,
       ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
       g.name AS group_name,
       u.first_name AS teacher_first,
       u.last_name AS teacher_last,
       COALESCE(stu.cnt, 0)::text AS expected_students,
       COALESCE(att.cnt, 0)::text AS marked_students
     FROM lessons l
     JOIN groups g ON g.id = l.group_id AND g.school_id = $1
     JOIN users u ON u.id = l.teacher_id
     JOIN school_years sy ON sy.id = l.school_year_id AND sy.active = TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM group_students gs
       WHERE gs.group_id = g.id AND gs.left_at IS NULL
     ) stu ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT a.child_id)::int AS cnt
       FROM attendance a
       WHERE a.lesson_id = l.id
     ) att ON TRUE
     WHERE l.status IN ('COMPLETED', 'SCHEDULED')
       AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} < NOW() - interval '1 day'
       AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW() - interval '30 days'
       AND COALESCE(stu.cnt, 0) > 0
       AND COALESCE(att.cnt, 0) < COALESCE(stu.cnt, 0)
     ORDER BY l.scheduled_at DESC
     LIMIT 50`,
    [schoolId]
  );
  return res.rows.map((row) => ({
    lessonId: row.lesson_id,
    scheduledAt: toIsoUtc(row.scheduled_at),
    groupName: row.group_name,
    teacherName: `${row.teacher_first} ${row.teacher_last}`.trim(),
    expectedStudents: Number(row.expected_students) || 0,
    markedStudents: Number(row.marked_students) || 0,
  }));
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

export async function fetchStudentPipeline(
  schoolId: string,
  search?: string
): Promise<PipelineRow[]> {
  const searchTrim = search?.trim();
  const params: unknown[] = [schoolId];
  let searchClause = "";
  if (searchTrim) {
    params.push(`%${searchTrim}%`);
    searchClause = `AND (
      c.first_name ILIKE $2 OR c.last_name ILIKE $2
      OR u.first_name ILIKE $2 OR u.last_name ILIKE $2
      OR u.email ILIKE $2
      OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $2
    )`;
  }

  const today = new Date();
  const periodMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

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
       c.id AS child_id,
       c.first_name AS child_first,
       c.last_name AS child_last,
       u.id AS parent_id,
       u.first_name AS parent_first,
       u.last_name AS parent_last,
       u.email AS parent_email,
       UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW'))) AS access_level,
       pg.name AS proposal_group,
       ct.status AS contract_status,
       cg.name AS group_name,
       lbp.status AS billing_status,
       rn.status AS renewal_status
     FROM children c
     JOIN users u ON u.id = c.parent_id
     LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups pg ON pg.id = er.proposed_group_id
     LEFT JOIN LATERAL (
       SELECT ct2.status
       FROM contracts ct2
       JOIN contract_children cc ON cc.contract_id = ct2.id AND cc.child_id = c.id
       WHERE ct2.parent_id = c.parent_id AND ct2.school_id = c.school_id
       ORDER BY ct2.created_at DESC
       LIMIT 1
     ) ct ON TRUE
     LEFT JOIN LATERAL (
       SELECT g.name
       FROM group_students gs
       JOIN groups g ON g.id = gs.group_id AND g.school_id = c.school_id
       JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
       WHERE gs.child_id = c.id AND gs.left_at IS NULL
       ORDER BY gs.enrolled_at DESC NULLS LAST
       LIMIT 1
     ) cg ON TRUE
     LEFT JOIN lesson_billing_periods lbp
       ON lbp.child_id = c.id AND lbp.period_month = $${searchTrim ? 3 : 2}::date
     LEFT JOIN LATERAL (
       SELECT UPPER(BTRIM(COALESCE(r.status::text, ''))) AS status
       FROM renewals r
       WHERE r.child_id = c.id AND r.school_id = c.school_id
       ORDER BY r.initiated_at DESC
       LIMIT 1
     ) rn ON TRUE
     WHERE c.school_id = $1 AND c.active = TRUE
       ${searchClause}
     ORDER BY c.last_name, c.first_name
     LIMIT 200`,
    searchTrim ? [schoolId, `%${searchTrim}%`, periodMonth] : [schoolId, periodMonth]
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
         WHEN 'SIGNED' THEN 5
         WHEN 'RESIGNED' THEN 6
         ELSE 7
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

export type OccupancyRow = {
  groupId: string;
  groupName: string;
  level: string | null;
  locationName: string;
  maxStudents: number;
  currentStudents: number;
  freeSeats: number;
  pendingRequests: number;
};

export async function fetchGroupOccupancy(schoolId: string): Promise<OccupancyRow[]> {
  const res = await queryDb<{
    group_id: string;
    group_name: string;
    level: string | null;
    location_name: string;
    max_students: number;
    current_students: string;
    pending_requests: string;
  }>(
    `SELECT
       g.id AS group_id,
       g.name AS group_name,
       g.level,
       COALESCE(loc.name, '—') AS location_name,
       g.max_students,
       COALESCE(stu.cnt, 0)::text AS current_students,
       COALESCE(pend.cnt, 0)::text AS pending_requests
     FROM groups g
     LEFT JOIN locations loc ON loc.id = g.location_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM group_students gs
       JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
       WHERE gs.group_id = g.id AND gs.left_at IS NULL
     ) stu ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM enrollment_requests er
       WHERE er.proposed_group_id = g.id
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('NEW', 'PROPOSED', 'NEGOTIATING', 'ACCEPTED')
     ) pend ON TRUE
     WHERE g.school_id = $1 AND g.active = TRUE
     ORDER BY loc.name NULLS LAST, g.level NULLS LAST, g.name`,
    [schoolId]
  );

  return res.rows.map((row) => {
    const current = Number(row.current_students) || 0;
    const max = row.max_students || 0;
    return {
      groupId: row.group_id,
      groupName: row.group_name,
      level: row.level,
      locationName: row.location_name,
      maxStudents: max,
      currentStudents: current,
      freeSeats: Math.max(0, max - current),
      pendingRequests: Number(row.pending_requests) || 0,
    };
  });
}

export type ScheduleConflict = {
  type: "teacher" | "location";
  resourceName: string;
  lessonAId: string;
  lessonBId: string;
  scheduledAtA: string;
  scheduledAtB: string;
  groupAName: string;
  groupBName: string;
  locationAName: string;
  locationBName: string;
};

export async function fetchScheduleConflicts(
  schoolId: string,
  fromYmd: string,
  toYmd: string
): Promise<ScheduleConflict[]> {
  const res = await queryDb<{
    conflict_type: string;
    resource_name: string;
    lesson_a_id: string;
    lesson_b_id: string;
    scheduled_a: Date | string;
    scheduled_b: Date | string;
    group_a: string;
    group_b: string;
    loc_a: string;
    loc_b: string;
  }>(
    `WITH lesson_window AS (
       SELECT
         l.id,
         l.teacher_id,
         l.location_id,
         ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
         l.duration_min,
         ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")}
           + (l.duration_min || ' minutes')::interval AS ends_at,
         g.name AS group_name,
         loc.name AS location_name,
         u.first_name || ' ' || u.last_name AS teacher_name
       FROM lessons l
       JOIN groups g ON g.id = l.group_id AND g.school_id = $1
       JOIN locations loc ON loc.id = l.location_id
       JOIN users u ON u.id = l.teacher_id
       WHERE l.status <> 'CANCELLED'
         AND l.scheduled_at >= $2::date
         AND l.scheduled_at < ($3::date + interval '1 day')
     )
     SELECT
       'teacher' AS conflict_type,
       a.teacher_name AS resource_name,
       a.id AS lesson_a_id,
       b.id AS lesson_b_id,
       a.scheduled_at AS scheduled_a,
       b.scheduled_at AS scheduled_b,
       a.group_name AS group_a,
       b.group_name AS group_b,
       a.location_name AS loc_a,
       b.location_name AS loc_b
     FROM lesson_window a
     JOIN lesson_window b ON a.teacher_id = b.teacher_id AND a.id < b.id
       AND a.scheduled_at < b.ends_at AND b.scheduled_at < a.ends_at
     UNION ALL
     SELECT
       'location' AS conflict_type,
       a.location_name AS resource_name,
       a.id AS lesson_a_id,
       b.id AS lesson_b_id,
       a.scheduled_at AS scheduled_a,
       b.scheduled_at AS scheduled_b,
       a.group_name AS group_a,
       b.group_name AS group_b,
       a.location_name AS loc_a,
       b.location_name AS loc_b
     FROM lesson_window a
     JOIN lesson_window b ON a.location_id = b.location_id AND a.id < b.id
       AND a.scheduled_at < b.ends_at AND b.scheduled_at < a.ends_at
     ORDER BY scheduled_a`,
    [schoolId, fromYmd, toYmd]
  );

  return res.rows.map((row) => ({
    type: row.conflict_type as "teacher" | "location",
    resourceName: row.resource_name,
    lessonAId: row.lesson_a_id,
    lessonBId: row.lesson_b_id,
      scheduledAtA: toIsoUtc(row.scheduled_a),
      scheduledAtB: toIsoUtc(row.scheduled_b),
    groupAName: row.group_a,
    groupBName: row.group_b,
    locationAName: row.loc_a,
    locationBName: row.loc_b,
  }));
}

export function getWeekRangeFromToday(): { from: string; to: string } {
  const today = todayYmdWarsaw();
  return { from: today, to: weekEndYmd(today) };
}

export async function fetchFullDashboard(
  schoolId: string,
  negotiatingDaysThreshold: number
) {
  const today = todayYmdWarsaw();
  const weekEnd = weekEndYmd(today);

  const [
    counters,
    lessonsToday,
    lessonsThisWeek,
    billing,
    resignations,
    staleNegotiations,
    missingAttendance,
  ] = await Promise.all([
    fetchDashboardCounters(schoolId),
    fetchDashboardLessonsMerged(schoolId, today, today),
    fetchDashboardLessonsMerged(schoolId, today, weekEnd),
    fetchDashboardBillingSummary(schoolId),
    fetchResignationAlerts(schoolId),
    fetchStaleNegotiationAlerts(schoolId, negotiatingDaysThreshold),
    fetchMissingAttendanceAlerts(schoolId),
  ]);

  return {
    counters,
    lessonsToday,
    lessonsThisWeek,
    billing,
    alerts: {
      resignations,
      staleNegotiations,
      missingAttendance,
    },
    negotiatingDaysThreshold,
  };
}
