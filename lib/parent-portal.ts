import { extractContractNumber } from "@/lib/contract-html";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import {
  pgDateToYmd,
  sqlSchoolTimestampAsTimestamptz,
  toIsoUtc,
} from "@/lib/school-timezone";

function toIso(value: unknown): string {
  return toIsoUtc(value as Date | string);
}

function formatYmd(value: unknown): string | null {
  return pgDateToYmd(value as Date | string | null | undefined);
}

export type ParentGroupRow = {
  childId: string;
  childFirstName: string;
  childLastName: string;
  groupId: string;
  groupName: string;
  level: string | null;
  schedule: string;
  locationName: string;
  locationAddress: string | null;
  teacherName: string;
  paymentType: string | null;
};

export type ParentUpcomingLesson = {
  id: string;
  groupId: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
};

export type ParentAttendanceRow = {
  childId: string;
  childFirstName: string;
  childLastName: string;
  lessonId: string;
  scheduledAt: string;
  attendanceStatus: string | null;
  note: string | null;
  groupName: string;
  locationName: string | null;
  lessonStatus: string;
};

export type ParentPaymentRow = {
  id: string;
  childId: string | null;
  childName: string | null;
  amount: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  periodMonth: string | null;
  description: string | null;
  paymentType: string | null;
  source: "payment" | "lesson_billing";
  billingPeriodStatus: string | null;
  invoiceNumber: string | null;
  hasInvoicePdf: boolean;
  schoolYearId: string | null;
  schoolYearName: string | null;
  schoolYearActive: boolean;
  schoolYearDateFrom: string | null;
};

export type ParentCalendarLesson = {
  id: string;
  childId: string;
  childFirstName: string;
  childLastName: string;
  groupId: string;
  groupName: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
};

export type ParentCalendarHoliday = {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  type: string | null;
};

export type ParentSignedContract = {
  id: string;
  signedAt: string | null;
  status: string;
  paymentType: string | null;
  schoolYearId: string | null;
  schoolYearName: string | null;
  schoolYearActive: boolean;
  schoolYearDateFrom: string | null;
  contractNumber: string | null;
  children: Array<{ childId: string; firstName: string; lastName: string }>;
};

export async function fetchParentGroups(
  parentId: string,
  schoolId: string
): Promise<ParentGroupRow[]> {
  const res = await queryDb<{
    child_id: string;
    child_first_name: string;
    child_last_name: string;
    group_id: string;
    group_name: string;
    level: string | null;
    schedule: string;
    location_name: string;
    location_address: string | null;
    teacher_first: string | null;
    teacher_last: string | null;
    payment_type: string | null;
  }>(
    `SELECT
       c.id AS child_id,
       c.first_name AS child_first_name,
       c.last_name AS child_last_name,
       g.id AS group_id,
       g.name AS group_name,
       g.level,
       COALESCE(
         STRING_AGG(
           DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
           ', '
         ),
         'Do ustalenia'
       ) AS schedule,
       COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
       MAX(l.address) AS location_address,
       t.first_name AS teacher_first,
       t.last_name AS teacher_last,
       (
         SELECT ct.payment_type
         FROM contracts ct
         JOIN contract_children cc ON cc.contract_id = ct.id AND cc.child_id = c.id
         WHERE ct.parent_id = $1 AND ct.status = 'SIGNED'
         ORDER BY ct.signed_at DESC NULLS LAST
         LIMIT 1
       ) AS payment_type
     FROM children c
     JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
     JOIN groups g ON g.id = gs.group_id AND g.active = TRUE
     JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
     LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
     LEFT JOIN locations l ON l.id = st.location_id
     LEFT JOIN users t ON t.id = g.teacher_id
     WHERE c.parent_id = $1 AND c.school_id = $2 AND c.active = TRUE
     GROUP BY
       c.id, c.first_name, c.last_name,
       g.id, g.name, g.level,
       t.first_name, t.last_name
     ORDER BY c.last_name, c.first_name`,
    [parentId, schoolId]
  );

  return res.rows.map((row) => ({
    childId: row.child_id,
    childFirstName: row.child_first_name,
    childLastName: row.child_last_name,
    groupId: row.group_id,
    groupName: row.group_name,
    level: row.level,
    schedule: row.schedule,
    locationName: row.location_name,
    locationAddress: row.location_address,
    teacherName: `${row.teacher_first ?? ""} ${row.teacher_last ?? ""}`.trim() || "Do ustalenia",
    paymentType: row.payment_type,
  }));
}

export async function fetchUpcomingLessonsForGroups(
  groupIds: string[],
  limit = 5
): Promise<ParentUpcomingLesson[]> {
  if (groupIds.length === 0) return [];

  const res = await queryDb<{
    id: string;
    group_id: string;
    scheduled_at: Date | string;
    duration_min: number;
    status: string;
    location_name: string | null;
  }>(
    `SELECT l.id,
            l.group_id,
            ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
            l.duration_min,
            l.status::text AS status,
            loc.name AS location_name
     FROM lessons l
     LEFT JOIN locations loc ON loc.id = l.location_id
     WHERE l.group_id = ANY($1::text[])
       AND l.status IN ('SCHEDULED', 'COMPLETED')
       AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} >= NOW()
     ORDER BY l.scheduled_at ASC
     LIMIT $2`,
    [groupIds, limit]
  );

  return res.rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    scheduledAt: toIso(row.scheduled_at),
    durationMin: row.duration_min,
    status: row.status,
    locationName: row.location_name,
  }));
}

export async function fetchParentAttendance(
  parentId: string,
  schoolId: string,
  childId?: string | null
): Promise<ParentAttendanceRow[]> {
  const params: unknown[] = [parentId, schoolId];
  let childFilter = "";
  if (childId?.trim()) {
    params.push(childId.trim());
    childFilter = `AND c.id = $${params.length}`;
  }

  const res = await queryDb<{
    child_id: string;
    child_first_name: string;
    child_last_name: string;
    lesson_id: string;
    scheduled_at: Date | string;
    attendance_status: string | null;
    note: string | null;
    group_name: string;
    location_name: string | null;
    lesson_status: string;
  }>(
    `SELECT
       c.id AS child_id,
       c.first_name AS child_first_name,
       c.last_name AS child_last_name,
       l.id AS lesson_id,
       ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
       a.status::text AS attendance_status,
       a.note,
       g.name AS group_name,
       loc.name AS location_name,
       l.status::text AS lesson_status
     FROM children c
     JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
     JOIN groups g ON g.id = gs.group_id
     JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
     JOIN lessons l ON l.group_id = g.id
     LEFT JOIN attendance a ON a.lesson_id = l.id AND a.child_id = c.id
     LEFT JOIN locations loc ON loc.id = l.location_id
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND l.status IN ('COMPLETED', 'SCHEDULED', 'CANCELLED')
       ${childFilter}
     ORDER BY l.scheduled_at DESC
     LIMIT 300`,
    params
  );

  return res.rows.map((row) => ({
    childId: row.child_id,
    childFirstName: row.child_first_name,
    childLastName: row.child_last_name,
    lessonId: row.lesson_id,
    scheduledAt: toIso(row.scheduled_at),
    attendanceStatus: row.attendance_status,
    note: row.note,
    groupName: row.group_name,
    locationName: row.location_name,
    lessonStatus: row.lesson_status,
  }));
}

export type MonthlyAttendanceSummary = {
  month: string;
  childId: string;
  childName: string;
  presentCount: number;
  totalCount: number;
  percentage: number;
};

export function computeMonthlyAttendanceSummaries(
  rows: ParentAttendanceRow[]
): MonthlyAttendanceSummary[] {
  const buckets = new Map<string, MonthlyAttendanceSummary & { present: number; total: number }>();

  for (const row of rows) {
    if (row.lessonStatus === "CANCELLED") continue;
    if (row.lessonStatus === "SCHEDULED" && !row.attendanceStatus) continue;

    const month = row.scheduledAt.slice(0, 7);
    const key = `${row.childId}:${month}`;
    const existing = buckets.get(key) ?? {
      month,
      childId: row.childId,
      childName: `${row.childFirstName} ${row.childLastName}`.trim(),
      presentCount: 0,
      totalCount: 0,
      percentage: 0,
      present: 0,
      total: 0,
    };

    existing.total += 1;
    const status = (row.attendanceStatus ?? "PRESENT").toUpperCase();
    if (status === "PRESENT" || status === "LATE") {
      existing.present += 1;
    }
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .map((b) => ({
      month: b.month,
      childId: b.childId,
      childName: b.childName,
      presentCount: b.present,
      totalCount: b.total,
      percentage: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function fetchParentPayments(
  parentId: string,
  schoolId: string
): Promise<ParentPaymentRow[]> {
  const [paymentsRes, billingRes] = await Promise.all([
    queryDb<{
      id: string;
      child_id: string | null;
      child_name: string | null;
      amount: string;
      status: string | null;
      due_date: Date | string | null;
      paid_at: Date | string | null;
      period_month: Date | string | null;
      description: string | null;
      payment_type: string | null;
      invoice_number: string | null;
      invoice_pdf_key: string | null;
      school_year_id: string | null;
      school_year_name: string | null;
      school_year_active: boolean | null;
      school_year_date_from: Date | string | null;
    }>(
      `SELECT
         p.id,
         p.child_id,
         CASE WHEN c.id IS NOT NULL THEN CONCAT(c.first_name, ' ', c.last_name) ELSE NULL END AS child_name,
         p.amount::text AS amount,
         COALESCE(p.status, 'PENDING') AS status,
         p.due_date,
         p.paid_at,
         p.period_month,
         p.description,
         COALESCE(ct.payment_type, 'MONTHLY') AS payment_type,
         i.invoice_number,
         i.pdf_key AS invoice_pdf_key,
         sy.id AS school_year_id,
         sy.name AS school_year_name,
         COALESCE(sy.active, FALSE) AS school_year_active,
         sy.date_from AS school_year_date_from
       FROM payments p
       LEFT JOIN children c ON c.id = p.child_id
       LEFT JOIN contracts ct ON ct.id = p.contract_id
       LEFT JOIN invoices i ON i.payment_id = p.id
       LEFT JOIN school_years sy ON sy.id = COALESCE(p.school_year_id, ct.school_year_id)
       WHERE p.parent_id = $1 AND p.school_id = $2
       ORDER BY COALESCE(p.due_date, p.period_month, p.created_at) DESC
       LIMIT 500`,
      [parentId, schoolId]
    ),
    queryDb<{
      id: string;
      child_id: string;
      child_name: string;
      amount: string;
      status: string;
      period_month: Date | string;
      payment_id: string | null;
      school_year_id: string | null;
      school_year_name: string | null;
      school_year_active: boolean | null;
      school_year_date_from: Date | string | null;
    }>(
      `SELECT
         lbp.id,
         lbp.child_id,
         CONCAT(c.first_name, ' ', c.last_name) AS child_name,
         lbp.amount::text AS amount,
         lbp.status,
         lbp.period_month,
         lbp.payment_id,
         sy.id AS school_year_id,
         sy.name AS school_year_name,
         COALESCE(sy.active, FALSE) AS school_year_active,
         sy.date_from AS school_year_date_from
       FROM lesson_billing_periods lbp
       JOIN children c ON c.id = lbp.child_id
       LEFT JOIN contracts ct ON ct.id = lbp.contract_id
       LEFT JOIN school_years sy ON sy.id = COALESCE(lbp.school_year_id, ct.school_year_id)
       WHERE lbp.parent_id = $1 AND lbp.school_id = $2
         AND lbp.payment_id IS NULL
       ORDER BY lbp.period_month DESC
       LIMIT 200`,
      [parentId, schoolId]
    ),
  ]);

  const paymentRows: ParentPaymentRow[] = paymentsRes.rows.map((row) => ({
    id: row.id,
    childId: row.child_id,
    childName: row.child_name,
    amount: row.amount,
    status: String(row.status ?? "PENDING").toUpperCase(),
    dueDate: formatYmd(row.due_date),
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
    periodMonth: formatYmd(row.period_month)?.slice(0, 7) ?? null,
    description: row.description,
    paymentType: row.payment_type,
    source: "payment" as const,
    billingPeriodStatus: null,
    invoiceNumber: row.invoice_number,
    hasInvoicePdf: Boolean(row.invoice_pdf_key),
    schoolYearId: row.school_year_id,
    schoolYearName: row.school_year_name,
    schoolYearActive: Boolean(row.school_year_active),
    schoolYearDateFrom: pgDateToYmd(row.school_year_date_from),
  }));

  const billingRows: ParentPaymentRow[] = billingRes.rows.map((row) => ({
    id: row.id,
    childId: row.child_id,
    childName: row.child_name,
    amount: row.amount,
    status: mapBillingStatusToPaymentStatus(row.status),
    dueDate: null,
    paidAt: null,
    periodMonth: formatYmd(row.period_month)?.slice(0, 7) ?? null,
    description: "Rozliczenie za pojedyncze zajęcia",
    paymentType: "PER_LESSON",
    source: "lesson_billing" as const,
    billingPeriodStatus: row.status,
    invoiceNumber: null,
    hasInvoicePdf: false,
    schoolYearId: row.school_year_id,
    schoolYearName: row.school_year_name,
    schoolYearActive: Boolean(row.school_year_active),
    schoolYearDateFrom: pgDateToYmd(row.school_year_date_from),
  }));

  return [...paymentRows, ...billingRows].sort((a, b) => {
    const aKey = a.periodMonth ?? a.dueDate ?? "";
    const bKey = b.periodMonth ?? b.dueDate ?? "";
    return bKey.localeCompare(aKey);
  });
}

function mapBillingStatusToPaymentStatus(status: string): string {
  const s = status.toUpperCase();
  if (s === "PAID") return "PAID";
  if (s === "INVOICED") return "PENDING";
  if (s === "APPROVED") return "PENDING";
  return "DRAFT";
}

export async function fetchParentCalendar(
  parentId: string,
  schoolId: string,
  fromYmd: string,
  toYmd: string,
  childId?: string | null
): Promise<{ lessons: ParentCalendarLesson[]; holidays: ParentCalendarHoliday[] }> {
  const params: unknown[] = [parentId, schoolId, fromYmd, toYmd];
  let childFilter = "";
  if (childId?.trim()) {
    params.push(childId.trim());
    childFilter = `AND c.id = $${params.length}`;
  }

  const [lessonsRes, holidaysRes] = await Promise.all([
    queryDb<{
      id: string;
      child_id: string;
      child_first_name: string;
      child_last_name: string;
      group_id: string;
      group_name: string;
      scheduled_at: Date | string;
      duration_min: number;
      status: string;
      location_name: string | null;
    }>(
      `SELECT
         l.id,
         c.id AS child_id,
         c.first_name AS child_first_name,
         c.last_name AS child_last_name,
         g.id AS group_id,
         g.name AS group_name,
         ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
         l.duration_min,
         l.status::text AS status,
         loc.name AS location_name
       FROM children c
       JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       JOIN groups g ON g.id = gs.group_id
       JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
       JOIN lessons l ON l.group_id = g.id
       LEFT JOIN locations loc ON loc.id = l.location_id
       WHERE c.parent_id = $1
         AND c.school_id = $2
         AND c.active = TRUE
         ${childFilter}
         AND l.scheduled_at >= $3::date
         AND l.scheduled_at < ($4::date + interval '1 day')
       ORDER BY l.scheduled_at ASC`,
      params
    ),
    queryDb<{
      id: string;
      name: string;
      date_from: Date | string;
      date_to: Date | string;
      type: string | null;
    }>(
      `SELECT h.id, h.name, h.date_from, h.date_to, h.type
       FROM school_holidays h
       JOIN school_years sy ON sy.id = h.school_year_id AND sy.active = TRUE
       WHERE h.school_id = $1
         AND h.date_to >= $2::date
         AND h.date_from <= $3::date
       ORDER BY h.date_from ASC`,
      [schoolId, fromYmd, toYmd]
    ),
  ]);

  return {
    lessons: lessonsRes.rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      childFirstName: row.child_first_name,
      childLastName: row.child_last_name,
      groupId: row.group_id,
      groupName: row.group_name,
      scheduledAt: toIso(row.scheduled_at),
      durationMin: row.duration_min,
      status: row.status,
      locationName: row.location_name,
    })),
    holidays: holidaysRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      dateFrom: formatYmd(row.date_from) ?? "",
      dateTo: formatYmd(row.date_to) ?? "",
      type: row.type,
    })),
  };
}

export async function fetchParentSignedContracts(
  parentId: string,
  schoolId: string
): Promise<ParentSignedContract[]> {
  const res = await queryDb<{
    id: string;
    signed_at: Date | string | null;
    status: string;
    payment_type: string | null;
    content_html: string;
    contract_number: string | null;
    school_year_id: string | null;
    school_year_name: string | null;
    school_year_active: boolean | null;
    school_year_date_from: Date | string | null;
    children_json: string;
  }>(
    `SELECT
       ct.id,
       ct.signed_at,
       ct.status,
       ct.payment_type,
       ct.content_html,
       ct.contract_number,
       ct.school_year_id,
       sy.name AS school_year_name,
       COALESCE(sy.active, FALSE) AS school_year_active,
       sy.date_from AS school_year_date_from,
       COALESCE(
         JSON_AGG(
           JSONB_BUILD_OBJECT(
             'childId', cc.child_id,
             'firstName', ch.first_name,
             'lastName', ch.last_name
           )
         ) FILTER (WHERE cc.child_id IS NOT NULL),
         '[]'::json
       )::text AS children_json
     FROM contracts ct
     LEFT JOIN school_years sy ON sy.id = ct.school_year_id
     LEFT JOIN contract_children cc ON cc.contract_id = ct.id
     LEFT JOIN children ch ON ch.id = cc.child_id
     WHERE ct.parent_id = $1
       AND ct.school_id = $2
       AND ct.status = 'SIGNED'
     GROUP BY
       ct.id,
       ct.signed_at,
       ct.status,
       ct.payment_type,
       ct.content_html,
       ct.contract_number,
       ct.school_year_id,
       sy.name,
       sy.active,
       sy.date_from
     ORDER BY ct.signed_at DESC NULLS LAST`,
    [parentId, schoolId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    signedAt: row.signed_at ? toIso(row.signed_at) : null,
    status: row.status,
    paymentType: row.payment_type,
    schoolYearId: row.school_year_id,
    schoolYearName: row.school_year_name,
    schoolYearActive: Boolean(row.school_year_active),
    schoolYearDateFrom: pgDateToYmd(row.school_year_date_from),
    contractNumber:
      row.contract_number?.trim() ||
      extractContractNumber(row.content_html ?? "") ||
      null,
    children: JSON.parse(row.children_json || "[]") as Array<{
      childId: string;
      firstName: string;
      lastName: string;
    }>,
  }));
}

export async function verifyChildBelongsToParent(
  childId: string,
  parentId: string,
  schoolId: string
): Promise<boolean> {
  const res = await queryDb<{ id: string }>(
    `SELECT id FROM children
     WHERE id = $1 AND parent_id = $2 AND school_id = $3
     LIMIT 1`,
    [childId, parentId, schoolId]
  );
  return Boolean(res.rows[0]);
}
