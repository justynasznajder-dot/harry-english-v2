import { extractContractNumber } from "@/lib/contract-html";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { ensurePolishPublicHolidaysForSchoolYear } from "@/lib/ensure-polish-public-holidays";
import { normalizePaymentType, parsePriceDecimal, type PaymentType } from "@/lib/lesson-pricing";

/** Prefiksy opisów faktur — spójne z lib/invoicing.ts (bez importu cyklicznego). */
const INVOICE_DESC_MONTHLY_PREFIX = "Rata miesięczna";
const INVOICE_DESC_YEARLY_PREFIX = "Płatność jednorazowa";
const INVOICE_DESC_LESSON_PREFIX = "Rozliczenie za pojedyncze zajęcia";
import {
  sqlScheduleTemplateVisibleForStudent,
  sqlStudentAttendsLesson,
} from "@/lib/lessons-per-week";
import { listPolishPublicHolidays } from "@/lib/polish-public-holidays";
import {
  addMonthsYmd,
  pgDateToYmd,
  periodMonthKey,
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

/** Propozycja grupy w trakcie zapisu (przed członkostwem w group_students). */
export type ParentProposedGroupRow = {
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
  accessLevel: string;
};

export type ParentUpcomingLesson = {
  id: string;
  groupId: string;
  childId?: string;
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
  billedPerLesson: boolean;
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
       COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
       COALESCE(MAX(gl.address), MAX(sl.address)) AS location_address,
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
     LEFT JOIN locations gl ON gl.id = g.location_id
     LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       AND ${sqlScheduleTemplateVisibleForStudent("gs.lessons_per_week")}
     LEFT JOIN locations sl ON sl.id = st.location_id
     LEFT JOIN users t ON t.id = g.teacher_id
     WHERE c.parent_id = $1 AND c.school_id = $2 AND c.active = TRUE
     GROUP BY
       c.id, c.first_name, c.last_name,
       g.id, g.name, g.level, g.lessons_per_week,
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

/**
 * Propozycje grup z enrollment_requests — tylko gdy dziecko nie ma jeszcze
 * aktywnego członkostwa w group_students na bieżący rok.
 */
export async function fetchParentProposedGroups(
  parentId: string,
  schoolId: string
): Promise<ParentProposedGroupRow[]> {
  const accessLevelExpr = `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW')))`;
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
    access_level: string;
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
       COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
       COALESCE(MAX(gl.address), MAX(sl.address)) AS location_address,
       t.first_name AS teacher_first,
       t.last_name AS teacher_last,
       ${accessLevelExpr} AS access_level
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     JOIN groups g ON g.id = er.proposed_group_id
     LEFT JOIN locations gl ON gl.id = g.location_id
     LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       AND ${sqlScheduleTemplateVisibleForStudent("er.lessons_per_week")}
     LEFT JOIN locations sl ON sl.id = st.location_id
     LEFT JOIN users t ON t.id = g.teacher_id
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND er.proposed_group_id IS NOT NULL
       AND ${accessLevelExpr} IN (
         'PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM group_students gs
         JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
         WHERE gs.child_id = c.id
           AND gs.left_at IS NULL
       )
     GROUP BY
       c.id, c.first_name, c.last_name, c.access_level,
       g.id, g.name, g.level, g.lessons_per_week,
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
    accessLevel: row.access_level,
  }));
}

export async function fetchUpcomingLessonsForGroups(
  groupIds: string[],
  limit = 5,
  opts?: { parentId?: string; schoolId?: string }
): Promise<ParentUpcomingLesson[]> {
  if (groupIds.length === 0) return [];

  const parentId = opts?.parentId;
  const schoolId = opts?.schoolId;

  if (parentId && schoolId) {
    const res = await queryDb<{
      id: string;
      group_id: string;
      child_id: string;
      scheduled_at: Date | string;
      duration_min: number;
      status: string;
      location_name: string | null;
    }>(
      `SELECT l.id,
              l.group_id,
              gs.child_id,
              ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
              l.duration_min,
              l.status::text AS status,
              loc.name AS location_name
       FROM lessons l
       JOIN group_students gs ON gs.group_id = l.group_id AND gs.left_at IS NULL
       JOIN groups g ON g.id = gs.group_id
       JOIN children c ON c.id = gs.child_id
       LEFT JOIN locations loc ON loc.id = l.location_id
       WHERE l.group_id = ANY($1::text[])
         AND l.status IN ('SCHEDULED', 'COMPLETED')
         AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} >= NOW()
         AND c.parent_id = $2
         AND c.school_id = $3
         AND c.active = TRUE
         AND ${sqlStudentAttendsLesson("gs", "g", "l")}
       ORDER BY l.scheduled_at ASC
       LIMIT $4`,
      [groupIds, parentId, schoolId, Math.max(limit * 10, 50)]
    );

    return res.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      childId: row.child_id,
      scheduledAt: toIso(row.scheduled_at),
      durationMin: row.duration_min,
      status: row.status,
      locationName: row.location_name,
    }));
  }

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
    billed_per_lesson: boolean;
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
       l.status::text AS lesson_status,
       EXISTS (
         SELECT 1
         FROM contracts ct
         JOIN contract_children cc ON cc.contract_id = ct.id
         WHERE cc.child_id = c.id
           AND ct.payment_type = 'PER_LESSON'
           AND ct.status = 'SIGNED'
           AND ct.billing_exempt = FALSE
           AND (cc.group_id IS NULL OR cc.group_id = gs.group_id)
       ) AS billed_per_lesson
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
       AND ${sqlStudentAttendsLesson("gs", "g", "l")}
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
    billedPerLesson: row.billed_per_lesson === true,
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
    // PER_LESSON bez wpisu — jeszcze nieoznaczone przez lektora, pomiń.
    if (row.billedPerLesson && !row.attendanceStatus) continue;
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
    // Nie-PER_LESSON: brak wpisu = obecny z założenia.
    const status = (
      row.attendanceStatus ?? (row.billedPerLesson ? null : "PRESENT")
    )?.toUpperCase();
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
       LEFT JOIN LATERAL (
         SELECT inv.invoice_number, inv.pdf_key
         FROM invoices inv
         WHERE inv.payment_id = p.id
         ORDER BY
           CASE WHEN inv.pdf_key IS NOT NULL AND BTRIM(inv.pdf_key) <> '' THEN 0 ELSE 1 END,
           inv.created_at DESC NULLS LAST
         LIMIT 1
       ) i ON TRUE
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

/** Status widoczny dla rodzica: przed fakturą / do zapłaty / opłacone. */
export type ParentPaymentDisplayStatus = "AWAITING_INVOICE" | "UNPAID" | "PAID";

export type ParentPaymentInvoiceRef = {
  paymentId: string | null;
  invoiceNumber: string | null;
  hasInvoicePdf: boolean;
  dueDate: string | null;
  paidAt: string | null;
};

export type ParentPaymentInstallmentRow = ParentPaymentInvoiceRef & {
  periodMonth: string;
  amount: string;
  displayStatus: ParentPaymentDisplayStatus;
};

export type ParentPaymentLessonChargeRow = {
  lessonId: string;
  scheduledAt: string;
  attendanceStatus: string;
  groupName: string;
  unitPrice: string;
  amount: string;
  periodMonth: string;
};

export type ParentPaymentLessonMonthRow = ParentPaymentInvoiceRef & {
  periodMonth: string;
  lessonsCount: number;
  amount: string;
  displayStatus: ParentPaymentDisplayStatus;
  lessons: ParentPaymentLessonChargeRow[];
};

export type ParentPaymentChildOverview = {
  childId: string;
  childName: string;
  contractId: string;
  paymentType: PaymentType;
  schoolYearId: string | null;
  schoolYearName: string | null;
  schoolYearDateFrom: string | null;
  schoolYearDateTo: string | null;
  /** Ratalne: miesiące roku × kwota. */
  installments: ParentPaymentInstallmentRow[] | null;
  /** Jednorazowo. */
  yearly: (ParentPaymentInstallmentRow & { label: string }) | null;
  /** Za zajęcia: miesiące z listą obecności × stawka. */
  lessonMonths: ParentPaymentLessonMonthRow[] | null;
  lessonUnitPrice: string | null;
};

export type ParentPaymentOverview = {
  children: ParentPaymentChildOverview[];
};

type LinkedPaymentRow = {
  payment_id: string;
  status: string | null;
  amount: string;
  due_date: Date | string | null;
  paid_at: Date | string | null;
  period_month: Date | string | null;
  invoice_number: string | null;
  invoice_pdf_key: string | null;
  child_id: string | null;
  contract_id: string | null;
  description: string | null;
  item_child_id: string | null;
  item_amount: string | null;
};

function displayStatusFromPaymentStatus(
  status: string | null | undefined
): ParentPaymentDisplayStatus {
  const s = String(status ?? "").toUpperCase();
  if (s === "PAID") return "PAID";
  if (!s || s === "CANCELLED" || s === "DRAFT") return "AWAITING_INVOICE";
  return "UNPAID";
}

function listMonthsInclusive(fromYmd: string, toYmd: string): string[] {
  const start = `${fromYmd.slice(0, 7)}-01`;
  const end = `${toYmd.slice(0, 7)}-01`;
  if (start > end) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur.slice(0, 7));
    cur = addMonthsYmd(cur, 1);
  }
  return out;
}

function moneyText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0.00";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function invoiceRefFromPayment(
  row: LinkedPaymentRow | null | undefined,
  preferItemAmount = false
): ParentPaymentInvoiceRef & { amount: string; displayStatus: ParentPaymentDisplayStatus } {
  if (!row) {
    return {
      paymentId: null,
      invoiceNumber: null,
      hasInvoicePdf: false,
      dueDate: null,
      paidAt: null,
      amount: "0.00",
      displayStatus: "AWAITING_INVOICE",
    };
  }
  const itemAmount = preferItemAmount ? parsePriceDecimal(row.item_amount) : null;
  const paymentAmount = parsePriceDecimal(row.amount) ?? 0;
  return {
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number,
    hasInvoicePdf: Boolean(row.invoice_pdf_key),
    dueDate: formatYmd(row.due_date),
    paidAt: row.paid_at ? toIso(row.paid_at) : null,
    amount: moneyText(itemAmount ?? paymentAmount),
    displayStatus: displayStatusFromPaymentStatus(row.status),
  };
}

/**
 * Harmonogram płatności rodzica: per dziecko (ratalne / jednorazowo / za zajęcia).
 */
export async function fetchParentPaymentOverview(
  parentId: string,
  schoolId: string
): Promise<ParentPaymentOverview> {
  const { invoicesSupportInvoiceItems } = await import("@/lib/invoice-schema");
  const supportItems = await invoicesSupportInvoiceItems();

  const contractsRes = await queryDb<{
    contract_id: string;
    payment_type: string | null;
    billing_exempt: boolean;
    signed_at: Date | string | null;
    contract_amount: string | null;
    child_id: string;
    child_first_name: string;
    child_last_name: string;
    sort_order: number;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
    lesson_unit_price: string | null;
    child_monthly_unit_price: string | null;
    child_yearly_unit_price: string | null;
    child_lesson_unit_price: string | null;
    school_year_id: string | null;
    school_year_name: string | null;
    school_year_date_from: Date | string | null;
    school_year_date_to: Date | string | null;
  }>(
    `SELECT
       ct.id AS contract_id,
       ct.payment_type,
       ct.billing_exempt,
       ct.signed_at,
       ct.amount::text AS contract_amount,
       ch.id AS child_id,
       ch.first_name AS child_first_name,
       ch.last_name AS child_last_name,
       COALESCE(cc.sort_order, 0) AS sort_order,
       cc.monthly_unit_price::text AS monthly_unit_price,
       cc.yearly_unit_price::text AS yearly_unit_price,
       cc.lesson_unit_price::text AS lesson_unit_price,
       ch.monthly_unit_price::text AS child_monthly_unit_price,
       ch.yearly_unit_price::text AS child_yearly_unit_price,
       ch.lesson_unit_price::text AS child_lesson_unit_price,
       COALESCE(sy.id, sy_active.id) AS school_year_id,
       COALESCE(sy.name, sy_active.name) AS school_year_name,
       COALESCE(sy.date_from, sy_active.date_from) AS school_year_date_from,
       COALESCE(sy.date_to, sy_active.date_to) AS school_year_date_to
     FROM contracts ct
     JOIN contract_children cc ON cc.contract_id = ct.id
     JOIN children ch ON ch.id = cc.child_id
     LEFT JOIN school_years sy ON sy.id = ct.school_year_id
     LEFT JOIN school_years sy_active
       ON sy_active.school_id = ct.school_id AND sy_active.active = TRUE
     WHERE ct.parent_id = $1
       AND ct.school_id = $2
       AND ct.status = 'SIGNED'
       AND ct.billing_exempt = FALSE
       AND ch.active = TRUE
     ORDER BY ch.last_name ASC, ch.first_name ASC, ct.signed_at DESC NULLS LAST, cc.sort_order ASC`,
    [parentId, schoolId]
  );

  // Jedna umowa na dziecko (najnowsza podpisana).
  const byChild = new Map<string, (typeof contractsRes.rows)[0]>();
  for (const row of contractsRes.rows) {
    if (byChild.has(row.child_id)) continue;
    const paymentType = normalizePaymentType(row.payment_type);
    if (!paymentType) continue;
    byChild.set(row.child_id, row);
  }

  if (byChild.size === 0) {
    return { children: [] };
  }

  const childIds = [...byChild.keys()];
  const contractIds = [...new Set([...byChild.values()].map((r) => r.contract_id))];

  const paymentsSql = supportItems
    ? `SELECT
         p.id AS payment_id,
         COALESCE(p.status, 'PENDING') AS status,
         p.amount::text AS amount,
         p.due_date,
         p.paid_at,
         p.period_month,
         p.child_id,
         p.contract_id,
         p.description,
         i.invoice_number,
         i.pdf_key AS invoice_pdf_key,
         ii.child_id AS item_child_id,
         ii.amount::text AS item_amount
       FROM payments p
       LEFT JOIN LATERAL (
         SELECT inv.id, inv.invoice_number, inv.pdf_key
         FROM invoices inv
         WHERE inv.payment_id = p.id
         ORDER BY
           CASE WHEN inv.pdf_key IS NOT NULL AND BTRIM(inv.pdf_key) <> '' THEN 0 ELSE 1 END,
           inv.created_at DESC NULLS LAST
         LIMIT 1
       ) i ON TRUE
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       WHERE p.parent_id = $1
         AND p.school_id = $2
         AND COALESCE(UPPER(p.status), 'PENDING') <> 'CANCELLED'
         AND (
           p.contract_id = ANY($3::text[])
           OR p.child_id = ANY($4::text[])
           OR ii.child_id = ANY($4::text[])
           OR ii.contract_id = ANY($3::text[])
         )
       ORDER BY COALESCE(p.period_month, p.due_date, p.created_at) DESC`
    : `SELECT
         p.id AS payment_id,
         COALESCE(p.status, 'PENDING') AS status,
         p.amount::text AS amount,
         p.due_date,
         p.paid_at,
         p.period_month,
         p.child_id,
         p.contract_id,
         p.description,
         i.invoice_number,
         i.pdf_key AS invoice_pdf_key,
         NULL::text AS item_child_id,
         NULL::text AS item_amount
       FROM payments p
       LEFT JOIN LATERAL (
         SELECT inv.id, inv.invoice_number, inv.pdf_key
         FROM invoices inv
         WHERE inv.payment_id = p.id
         ORDER BY
           CASE WHEN inv.pdf_key IS NOT NULL AND BTRIM(inv.pdf_key) <> '' THEN 0 ELSE 1 END,
           inv.created_at DESC NULLS LAST
         LIMIT 1
       ) i ON TRUE
       WHERE p.parent_id = $1
         AND p.school_id = $2
         AND COALESCE(UPPER(p.status), 'PENDING') <> 'CANCELLED'
         AND (
           p.contract_id = ANY($3::text[])
           OR p.child_id = ANY($4::text[])
         )
       ORDER BY COALESCE(p.period_month, p.due_date, p.created_at) DESC`;

  const [paymentsRes, lessonRes] = await Promise.all([
    queryDb<LinkedPaymentRow>(paymentsSql, [parentId, schoolId, contractIds, childIds]),
    queryDb<{
      child_id: string;
      lesson_id: string;
      scheduled_at: Date | string;
      attendance_status: string;
      group_name: string;
    }>(
      `SELECT
         c.id AS child_id,
         l.id AS lesson_id,
         ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} AS scheduled_at,
         a.status::text AS attendance_status,
         g.name AS group_name
       FROM children c
       JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       JOIN groups g ON g.id = gs.group_id
       JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
       JOIN lessons l ON l.group_id = g.id
       JOIN attendance a ON a.lesson_id = l.id AND a.child_id = c.id
       WHERE c.parent_id = $1
         AND c.school_id = $2
         AND c.id = ANY($3::text[])
         AND c.active = TRUE
         AND l.status IN ('COMPLETED', 'SCHEDULED')
         AND a.status::text IN ('PRESENT', 'LATE')
         AND ${sqlStudentAttendsLesson("gs", "g", "l")}
       ORDER BY l.scheduled_at DESC
       LIMIT 800`,
      [parentId, schoolId, childIds]
    ),
  ]);

  const payments = paymentsRes.rows;

  function findMonthlyPayment(childId: string, contractId: string, periodYm: string): LinkedPaymentRow | null {
    const periodStart = `${periodYm}-01`;
    const candidates = payments.filter((p) => {
      const desc = String(p.description ?? "");
      if (!desc.startsWith(INVOICE_DESC_MONTHLY_PREFIX)) return false;
      const pm = formatYmd(p.period_month);
      return pm === periodStart || pm?.slice(0, 7) === periodYm;
    });
    const byItem = candidates.find((p) => p.item_child_id === childId);
    if (byItem) return byItem;
    const byChild = candidates.find((p) => p.child_id === childId && !p.item_child_id);
    if (byChild) return byChild;
    const byContract = candidates.find(
      (p) => p.contract_id === contractId && (p.item_child_id == null || p.item_child_id === childId)
    );
    return byContract ?? null;
  }

  function findYearlyPayment(childId: string, contractId: string): LinkedPaymentRow | null {
    const candidates = payments.filter((p) =>
      String(p.description ?? "").startsWith(INVOICE_DESC_YEARLY_PREFIX)
    );
    const byItem = candidates.find((p) => p.item_child_id === childId);
    if (byItem) return byItem;
    const byChild = candidates.find((p) => p.child_id === childId);
    if (byChild) return byChild;
    return candidates.find((p) => p.contract_id === contractId) ?? null;
  }

  function findLessonMonthPayment(childId: string, contractId: string, periodYm: string): LinkedPaymentRow | null {
    const periodStart = `${periodYm}-01`;
    const candidates = payments.filter((p) => {
      const desc = String(p.description ?? "");
      if (!desc.startsWith(INVOICE_DESC_LESSON_PREFIX)) return false;
      const pm = formatYmd(p.period_month);
      return pm === periodStart || pm?.slice(0, 7) === periodYm;
    });
    const byChild = candidates.find((p) => p.child_id === childId || p.item_child_id === childId);
    if (byChild) return byChild;
    return candidates.find((p) => p.contract_id === contractId) ?? null;
  }

  const lessonsByChild = new Map<string, typeof lessonRes.rows>();
  for (const row of lessonRes.rows) {
    const list = lessonsByChild.get(row.child_id) ?? [];
    list.push(row);
    lessonsByChild.set(row.child_id, list);
  }

  const children: ParentPaymentChildOverview[] = [];

  for (const row of byChild.values()) {
    const paymentType = normalizePaymentType(row.payment_type)!;
    const childName = `${row.child_first_name} ${row.child_last_name}`.trim();
    const dateFrom = pgDateToYmd(row.school_year_date_from);
    const dateTo = pgDateToYmd(row.school_year_date_to);
    const signedYmd = formatYmd(row.signed_at) ?? dateFrom;
    const monthlyPrice =
      parsePriceDecimal(row.monthly_unit_price) ??
      parsePriceDecimal(row.child_monthly_unit_price) ??
      null;
    const yearlyPrice =
      parsePriceDecimal(row.yearly_unit_price) ??
      parsePriceDecimal(row.child_yearly_unit_price) ??
      parsePriceDecimal(row.contract_amount) ??
      null;
    const lessonPrice =
      parsePriceDecimal(row.lesson_unit_price) ??
      parsePriceDecimal(row.child_lesson_unit_price) ??
      null;

    const base: ParentPaymentChildOverview = {
      childId: row.child_id,
      childName,
      contractId: row.contract_id,
      paymentType,
      schoolYearId: row.school_year_id,
      schoolYearName: row.school_year_name,
      schoolYearDateFrom: dateFrom,
      schoolYearDateTo: dateTo,
      installments: null,
      yearly: null,
      lessonMonths: null,
      lessonUnitPrice: lessonPrice != null ? moneyText(lessonPrice) : null,
    };

    if (paymentType === "MONTHLY" && dateFrom && dateTo) {
      const startYmd =
        signedYmd && signedYmd > dateFrom ? signedYmd : dateFrom;
      const months = listMonthsInclusive(startYmd, dateTo);
      base.installments = months.map((periodMonth) => {
        const linked = findMonthlyPayment(row.child_id, row.contract_id, periodMonth);
        const ref = invoiceRefFromPayment(linked, true);
        const planned = monthlyPrice ?? parsePriceDecimal(ref.amount) ?? 0;
        return {
          periodMonth,
          amount: moneyText(linked && ref.displayStatus !== "AWAITING_INVOICE" ? Number(ref.amount) : planned),
          displayStatus: ref.displayStatus,
          paymentId: ref.paymentId,
          invoiceNumber: ref.invoiceNumber,
          hasInvoicePdf: ref.hasInvoicePdf,
          dueDate: ref.dueDate,
          paidAt: ref.paidAt,
        };
      });
    } else if (paymentType === "YEARLY") {
      const linked = findYearlyPayment(row.child_id, row.contract_id);
      const ref = invoiceRefFromPayment(linked, true);
      const amount = yearlyPrice ?? parsePriceDecimal(ref.amount) ?? 0;
      base.yearly = {
        periodMonth: periodMonthKey(signedYmd ?? dateFrom ?? new Date()),
        label: "Płatność jednorazowa — rok szkolny",
        amount: moneyText(
          linked && ref.displayStatus !== "AWAITING_INVOICE" ? Number(ref.amount) : amount
        ),
        displayStatus: ref.displayStatus,
        paymentId: ref.paymentId,
        invoiceNumber: ref.invoiceNumber,
        hasInvoicePdf: ref.hasInvoicePdf,
        dueDate: ref.dueDate,
        paidAt: ref.paidAt,
      };
    } else if (paymentType === "PER_LESSON") {
      const unit = lessonPrice ?? 0;
      const lessons = lessonsByChild.get(row.child_id) ?? [];
      const monthMap = new Map<string, ParentPaymentLessonChargeRow[]>();
      for (const lesson of lessons) {
        const scheduledAt = toIso(lesson.scheduled_at);
        const periodMonth = scheduledAt.slice(0, 7);
        const list = monthMap.get(periodMonth) ?? [];
        list.push({
          lessonId: lesson.lesson_id,
          scheduledAt,
          attendanceStatus: lesson.attendance_status,
          groupName: lesson.group_name,
          unitPrice: moneyText(unit),
          amount: moneyText(unit),
          periodMonth,
        });
        monthMap.set(periodMonth, list);
      }
      const months = [...monthMap.keys()].sort((a, b) => b.localeCompare(a));
      base.lessonMonths = months.map((periodMonth) => {
        const monthLessons = monthMap.get(periodMonth) ?? [];
        const linked = findLessonMonthPayment(row.child_id, row.contract_id, periodMonth);
        const ref = invoiceRefFromPayment(linked, false);
        const computed = monthLessons.reduce((s, l) => s + (parsePriceDecimal(l.amount) ?? 0), 0);
        return {
          periodMonth,
          lessonsCount: monthLessons.length,
          amount: moneyText(
            linked && ref.displayStatus !== "AWAITING_INVOICE"
              ? Number(ref.amount)
              : computed
          ),
          displayStatus: ref.displayStatus,
          paymentId: ref.paymentId,
          invoiceNumber: ref.invoiceNumber,
          hasInvoicePdf: ref.hasInvoicePdf,
          dueDate: ref.dueDate,
          paidAt: ref.paidAt,
          lessons: monthLessons,
        };
      });
    }

    children.push(base);
  }

  children.sort((a, b) => a.childName.localeCompare(b.childName, "pl"));
  return { children };
}

export async function fetchParentCalendar(
  parentId: string,
  schoolId: string,
  fromYmd: string,
  toYmd: string,
  childId?: string | null
): Promise<{ lessons: ParentCalendarLesson[]; holidays: ParentCalendarHoliday[] }> {
  try {
    await ensurePolishPublicHolidaysForSchoolYear({ schoolId });
  } catch (seedErr) {
    console.error("ensurePolishPublicHolidays on parent calendar:", seedErr);
  }

  const params: unknown[] = [parentId, schoolId, fromYmd, toYmd];
  let childFilter = "";
  if (childId?.trim()) {
    params.push(childId.trim());
    childFilter = `AND c.id = $${params.length}`;
  }

  const accessLevelExpr = `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW')))`;
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
      `SELECT * FROM (
         SELECT
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
           AND ${sqlStudentAttendsLesson("gs", "g", "l")}
           AND l.scheduled_at >= $3::date
           AND l.scheduled_at < ($4::date + interval '1 day')

         UNION ALL

         -- Propozycja grupy (przed członkostwem w group_students)
         SELECT
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
         JOIN enrollment_requests er ON er.id = c.enrollment_request_id
         JOIN groups g ON g.id = er.proposed_group_id
         JOIN lessons l ON l.group_id = g.id
         LEFT JOIN locations loc ON loc.id = l.location_id
         WHERE c.parent_id = $1
           AND c.school_id = $2
           AND c.active = TRUE
           ${childFilter}
           AND er.proposed_group_id IS NOT NULL
           AND ${accessLevelExpr} IN (
             'PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM group_students gs
             JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
             WHERE gs.child_id = c.id
               AND gs.left_at IS NULL
           )
           AND l.scheduled_at >= $3::date
           AND l.scheduled_at < ($4::date + interval '1 day')
       ) calendar_lessons
       ORDER BY scheduled_at ASC`,
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
       INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.active = TRUE
       WHERE h.school_id = $1
         AND h.date_to >= $2::date
         AND h.date_from <= $3::date
         AND (
           h.school_year_id IS NULL
           OR h.school_year_id = sy.id
         )
       ORDER BY h.date_from ASC`,
      [schoolId, fromYmd, toYmd]
    ),
  ]);

  const holidaysFromDb = holidaysRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    dateFrom: formatYmd(row.date_from) ?? "",
    dateTo: formatYmd(row.date_to) ?? "",
    type: row.type,
  }));

  // Święta państwowe PL zawsze w odpowiedzi dla widocznego zakresu
  // (nawet gdy jeszcze nie ma wpisu w DB / poza aktywnym rokiem).
  const coveredDates = new Set<string>();
  for (const h of holidaysFromDb) {
    if (!h.dateFrom || !h.dateTo) continue;
    let ymd = h.dateFrom;
    while (ymd <= h.dateTo) {
      coveredDates.add(ymd);
      const [y, m, d] = ymd.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      ymd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
    }
  }
  const syntheticPublic = listPolishPublicHolidays(fromYmd, toYmd)
    .filter((h) => !coveredDates.has(h.date))
    .map((h) => ({
      id: `pl-public-${h.date}`,
      name: h.name,
      dateFrom: h.date,
      dateTo: h.date,
      type: "PUBLIC",
    }));

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
    holidays: [...holidaysFromDb, ...syntheticPublic].sort((a, b) =>
      a.dateFrom.localeCompare(b.dateFrom),
    ),
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
