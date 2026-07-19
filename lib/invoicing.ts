import { randomUUID } from "crypto";

import { formatContractAmount } from "@/lib/contract-html";
import { sendInvoiceNotificationEmail } from "@/lib/email";
import { queryDb } from "@/lib/db";

export const INVOICE_DESC_MONTHLY_PREFIX = "Rata miesięczna";
export const INVOICE_DESC_YEARLY_PREFIX = "Płatność jednorazowa";
export const INVOICE_DESC_LESSON_PREFIX = "Rozliczenie za pojedyncze zajęcia";

export type InvoiceCreateResult =
  | { ok: true; paymentId: string; created: boolean }
  | { ok: false; message: string; status: number };

type ContractInvoiceRow = {
  id: string;
  school_id: string;
  parent_id: string;
  school_year_id: string | null;
  amount: string;
  signed_at: Date | string | null;
};

type PaymentNotifyRow = {
  id: string;
  parent_id: string;
  amount: string;
  due_date: Date | string | null;
  description: string | null;
  period_month: Date | string | null;
  parent_email: string;
  parent_first_name: string;
};

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function firstDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function formatPeriodMonthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split("-");
  const monthNames = [
    "styczeń",
    "luty",
    "marzec",
    "kwiecień",
    "maj",
    "czerwiec",
    "lipiec",
    "sierpień",
    "wrzesień",
    "październik",
    "listopad",
    "grudzień",
  ];
  const idx = Number(month) - 1;
  if (!year || idx < 0 || idx > 11) return periodMonth;
  return `${monthNames[idx]} ${year}`;
}

function formatDueDateLabel(dueDate: string | null): string {
  if (!dueDate) return "—";
  const [year, month, day] = dueDate.split("-");
  if (!year || !month || !day) return dueDate;
  return `${Number(day)}.${Number(month)}.${year}`;
}

export function formatInvoiceAmount(amount: string | number | null | undefined): string {
  return formatContractAmount(amount);
}

async function fetchPaymentForNotification(paymentId: string): Promise<PaymentNotifyRow | null> {
  const res = await queryDb<PaymentNotifyRow>(
    `SELECT p.id, p.parent_id, p.amount::text AS amount, p.due_date, p.description, p.period_month,
            u.email AS parent_email, u.first_name AS parent_first_name
     FROM payments p
     JOIN users u ON u.id = p.parent_id
     WHERE p.id = $1
     LIMIT 1`,
    [paymentId]
  );
  return res.rows[0] ?? null;
}

export async function notifyParentAboutInvoice(paymentId: string): Promise<void> {
  const payment = await fetchPaymentForNotification(paymentId);
  if (!payment?.parent_email) return;

  const periodMonth = toDateString(payment.period_month);
  const dueDate = toDateString(payment.due_date);

  await sendInvoiceNotificationEmail({
    parentEmail: payment.parent_email,
    parentFirstName: payment.parent_first_name,
    amountLabel: `${formatInvoiceAmount(payment.amount)} zł`,
    description: payment.description ?? "Faktura",
    periodLabel: periodMonth ? formatPeriodMonthLabel(periodMonth.slice(0, 7)) : null,
    dueDateLabel: formatDueDateLabel(dueDate),
  });
}

async function insertPayment(params: {
  schoolId: string;
  parentId: string;
  contractId: string | null;
  childId: string | null;
  amount: number;
  description: string;
  periodMonth: string | null;
  dueDate: string;
  schoolYearId: string | null;
}): Promise<string> {
  const paymentId = randomUUID();
  await queryDb(
    `INSERT INTO payments (
       id, school_id, child_id, parent_id, contract_id, amount, status,
       due_date, period_month, description, school_year_id, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7::date, $8::date, $9, $10, NOW())`,
    [
      paymentId,
      params.schoolId,
      params.childId,
      params.parentId,
      params.contractId,
      params.amount,
      params.dueDate,
      params.periodMonth,
      params.description,
      params.schoolYearId,
    ]
  );
  return paymentId;
}

export async function createContractYearlyInvoice(contractId: string): Promise<InvoiceCreateResult> {
  const contractRes = await queryDb<ContractInvoiceRow & { payment_type: string | null; billing_exempt: boolean }>(
    `SELECT id, school_id, parent_id, school_year_id, amount::text AS amount,
            signed_at, payment_type, billing_exempt
     FROM contracts
     WHERE id = $1
     LIMIT 1`,
    [contractId]
  );
  const contract = contractRes.rows[0];
  if (!contract) {
    return { ok: false, message: "Nie znaleziono umowy", status: 404 };
  }
  if (contract.payment_type !== "YEARLY") {
    return { ok: false, message: "Umowa nie jest rozliczana jednorazowo", status: 409 };
  }
  if (contract.billing_exempt) {
    return { ok: false, message: "Umowa zwolniona z opłat", status: 409 };
  }

  const existing = await queryDb<{ id: string }>(
    `SELECT id FROM payments
     WHERE contract_id = $1
       AND description LIKE $2
     LIMIT 1`,
    [contractId, `${INVOICE_DESC_YEARLY_PREFIX}%`]
  );
  if (existing.rows[0]) {
    return { ok: true, paymentId: existing.rows[0].id, created: false };
  }

  const amount = Number(contract.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Brak kwoty do zafakturowania", status: 409 };
  }

  const signedAt = contract.signed_at ? new Date(contract.signed_at) : new Date();
  const dueDate = new Date(signedAt);
  dueDate.setDate(dueDate.getDate() + 14);

  const paymentId = await insertPayment({
    schoolId: contract.school_id,
    parentId: contract.parent_id,
    contractId: contract.id,
    childId: null,
    amount,
    description: `${INVOICE_DESC_YEARLY_PREFIX} — rok szkolny`,
    periodMonth: null,
    dueDate: dueDate.toISOString().slice(0, 10),
    schoolYearId: contract.school_year_id,
  });

  try {
    await notifyParentAboutInvoice(paymentId);
  } catch (err) {
    console.error("Yearly invoice email error:", err);
  }

  return { ok: true, paymentId, created: true };
}

export async function createContractMonthlyInvoice(
  contractId: string,
  periodMonth: Date
): Promise<InvoiceCreateResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodStart.toISOString().slice(0, 10);

  const contractRes = await queryDb<ContractInvoiceRow & { payment_type: string | null; billing_exempt: boolean }>(
    `SELECT c.id, c.school_id, c.parent_id, c.school_year_id, c.amount::text AS amount,
            c.signed_at, c.payment_type, c.billing_exempt
     FROM contracts c
     LEFT JOIN school_years sy ON sy.id = c.school_year_id
     WHERE c.id = $1
       AND (c.school_year_id IS NULL OR ($2::date >= sy.date_from AND $2::date <= sy.date_to))
     LIMIT 1`,
    [contractId, periodMonthStr]
  );
  const contract = contractRes.rows[0];
  if (!contract) {
    return { ok: false, message: "Nie znaleziono umowy lub okres poza rokiem szkolnym", status: 404 };
  }
  if (contract.payment_type !== "MONTHLY") {
    return { ok: false, message: "Umowa nie jest rozliczana ratalnie", status: 409 };
  }
  if (contract.billing_exempt) {
    return { ok: false, message: "Umowa zwolniona z opłat", status: 409 };
  }

  if (contract.signed_at) {
    const signedMonth = firstDayOfMonth(new Date(contract.signed_at));
    if (periodStart < signedMonth) {
      return { ok: false, message: "Okres przed podpisaniem umowy", status: 409 };
    }
  }

  const existing = await queryDb<{ id: string }>(
    `SELECT id FROM payments
     WHERE contract_id = $1
       AND period_month = $2::date
       AND description LIKE $3
     LIMIT 1`,
    [contractId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
  );
  if (existing.rows[0]) {
    return { ok: true, paymentId: existing.rows[0].id, created: false };
  }

  const amount = Number(contract.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Brak kwoty do zafakturowania", status: 409 };
  }

  const dueDay = 10;
  const dueDate = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), dueDay)
  );

  const paymentId = await insertPayment({
    schoolId: contract.school_id,
    parentId: contract.parent_id,
    contractId: contract.id,
    childId: null,
    amount,
    description: `${INVOICE_DESC_MONTHLY_PREFIX} — ${periodMonthStr.slice(0, 7)}`,
    periodMonth: periodMonthStr,
    dueDate: dueDate.toISOString().slice(0, 10),
    schoolYearId: contract.school_year_id,
  });

  try {
    await notifyParentAboutInvoice(paymentId);
  } catch (err) {
    console.error("Monthly invoice email error:", err);
  }

  return { ok: true, paymentId, created: true };
}

export async function createLessonBillingInvoice(billingId: string): Promise<InvoiceCreateResult & { billingId?: string }> {
  const billingRes = await queryDb<{
    id: string;
    school_id: string;
    child_id: string;
    parent_id: string;
    contract_id: string | null;
    school_year_id: string | null;
    period_month: Date | string;
    amount: string;
    status: string;
    payment_id: string | null;
  }>(
    `SELECT id, school_id, child_id, parent_id, contract_id, school_year_id, period_month,
            amount::text AS amount, status, payment_id
     FROM lesson_billing_periods
     WHERE id = $1
     LIMIT 1`,
    [billingId]
  );
  const billing = billingRes.rows[0];
  if (!billing) {
    return { ok: false, message: "Nie znaleziono rozliczenia", status: 404 };
  }
  if (billing.payment_id) {
    return { ok: true, paymentId: billing.payment_id, created: false, billingId };
  }
  if (billing.status !== "APPROVED" && billing.status !== "DRAFT") {
    return {
      ok: false,
      message: "Rozliczenie nie może zostać zafakturowane w tym statusie",
      status: 409,
    };
  }

  const periodMonth =
    billing.period_month instanceof Date
      ? billing.period_month.toISOString().slice(0, 10)
      : String(billing.period_month).slice(0, 10);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const paymentId = await insertPayment({
    schoolId: billing.school_id,
    parentId: billing.parent_id,
    contractId: billing.contract_id,
    childId: billing.child_id,
    amount: Number(billing.amount),
    description: `${INVOICE_DESC_LESSON_PREFIX} — ${periodMonth.slice(0, 7)}`,
    periodMonth,
    dueDate: dueDate.toISOString().slice(0, 10),
    schoolYearId: billing.school_year_id,
  });

  await queryDb(
    `UPDATE lesson_billing_periods
     SET status = 'INVOICED', payment_id = $2
     WHERE id = $1`,
    [billingId, paymentId]
  );

  try {
    await notifyParentAboutInvoice(paymentId);
  } catch (err) {
    console.error("Lesson billing invoice email error:", err);
  }

  return { ok: true, paymentId, created: true, billingId };
}

export type MonthlyInvoiceBatchResult = {
  periodMonth: string;
  generated: number;
  skipped: number;
  errors: Array<{ contractId: string; message: string }>;
};

export async function generateAllMonthlyInvoices(
  periodMonth: Date = new Date()
): Promise<MonthlyInvoiceBatchResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodStart.toISOString().slice(0, 10);

  const contractsRes = await queryDb<{ id: string }>(
    `SELECT c.id
     FROM contracts c
     LEFT JOIN school_years sy ON sy.id = c.school_year_id
     WHERE c.payment_type = 'MONTHLY'
       AND c.status = 'SIGNED'
       AND c.billing_exempt = false
       AND c.amount IS NOT NULL
       AND c.amount > 0
       AND (c.signed_at IS NULL OR DATE_TRUNC('month', c.signed_at) <= $1::date)
       AND (c.school_year_id IS NULL OR ($1::date >= sy.date_from AND $1::date <= sy.date_to))
       AND NOT EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = c.id
           AND p.period_month = $1::date
           AND p.description LIKE $2
       )
     ORDER BY c.created_at ASC`,
    [periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
  );

  let generated = 0;
  let skipped = 0;
  const errors: Array<{ contractId: string; message: string }> = [];

  for (const row of contractsRes.rows) {
    const result = await createContractMonthlyInvoice(row.id, periodStart);
    if (!result.ok) {
      errors.push({ contractId: row.id, message: result.message });
      continue;
    }
    if (result.created) generated += 1;
    else skipped += 1;
  }

  return { periodMonth: periodMonthStr, generated, skipped, errors };
}
