import { randomUUID } from "crypto";
import type { PoolClient } from "pg";

import { formatPersonName } from "@/lib/format-person-name";
import {
  buildParentAddress,
  formatContractAmount,
} from "@/lib/contract-html";
import { renderHtmlToPdf } from "@/lib/contract-pdf";
import { queryDb, runPgTransaction, withPgAdvisoryLock } from "@/lib/db";
import { sendInvoiceNotificationEmail } from "@/lib/email";
import {
  amountInWordsPln,
  buildInvoicePlaceholders,
  renderInvoiceHtml,
} from "@/lib/invoice-html";
import {
  isParentContractProfileComplete,
  resolveBillingTypeFromProfile,
} from "@/lib/parent-contract-profile";
import { deleteR2Object, storeInvoicePdfInR2 } from "@/lib/r2-storage";
import {
  buildCorrectiveInvoiceNumber,
  buildSaleInvoiceNumber,
  ensureParentClientNumber,
} from "@/lib/client-numbers";

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

type SchoolInvoiceSettings = {
  invoice_seller_name: string | null;
  invoice_seller_address: string | null;
  invoice_seller_nip: string | null;
  invoice_place: string | null;
  invoice_bank_account: string | null;
  invoice_bank_label: string | null;
  invoice_issuer_name: string | null;
  invoice_vat_exemption: string | null;
  invoice_default_item_name: string | null;
  invoice_generation_day: number;
};

type BuyerInvoiceData = {
  parentFullName: string;
  buyerName: string;
  buyerAddress: string;
  buyerNip: string | null;
};

function toDateString(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Ostatni dzień miesiąca (UTC date string YYYY-MM-DD) — termin płatności faktury. */
export function lastDayOfMonthDateString(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return d.toISOString().slice(0, 10);
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

function safePdfSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function requireTrimmed(value: string | null | undefined, label: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error(`Brak danych faktury szkoły: ${label}`);
  }
  return trimmed;
}

export function clampInvoiceGenerationDay(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(28, Math.max(1, Math.round(n)));
}

/** Dzień miesiąca w Europe/Warsaw (1–31). */
export function warsawCalendarDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
  }).formatToParts(date);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return Number.isFinite(day) ? day : date.getDate();
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

async function fetchSchoolInvoiceSettings(schoolId: string): Promise<SchoolInvoiceSettings> {
  const res = await queryDb<SchoolInvoiceSettings>(
    `SELECT invoice_seller_name, invoice_seller_address, invoice_seller_nip, invoice_place,
            invoice_bank_account, invoice_bank_label, invoice_issuer_name,
            invoice_vat_exemption, invoice_default_item_name, invoice_generation_day
     FROM schools
     WHERE id = $1
     LIMIT 1`,
    [schoolId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("Nie znaleziono szkoły");
  }
  return {
    ...row,
    invoice_generation_day: clampInvoiceGenerationDay(row.invoice_generation_day),
  };
}

export async function getSchoolInvoiceGenerationDay(schoolId: string): Promise<number> {
  const res = await queryDb<{ invoice_generation_day: number }>(
    `SELECT invoice_generation_day FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId]
  );
  return clampInvoiceGenerationDay(res.rows[0]?.invoice_generation_day ?? 10);
}

export async function setSchoolInvoiceGenerationDay(
  schoolId: string,
  day: number
): Promise<number> {
  const clamped = clampInvoiceGenerationDay(day);
  await queryDb(
    `UPDATE schools SET invoice_generation_day = $2 WHERE id = $1`,
    [schoolId, clamped]
  );
  return clamped;
}

/**
 * Nabywca faktury — zawsze bieżące dane z „Profil i dane do faktury”:
 * `users` (imię, nazwisko) + `parent_profiles` (adres, PESEL / firma+NIP).
 * Snapshot trafia do `invoices` dopiero w momencie wystawienia.
 */
async function fetchBuyerInvoiceData(parentId: string): Promise<BuyerInvoiceData> {
  const res = await queryDb<{
    first_name: string;
    last_name: string;
    address: string | null;
    city: string | null;
    zip_code: string | null;
    company_name: string | null;
    nip: string | null;
    pesel: string | null;
  }>(
    `SELECT u.first_name, u.last_name,
            pp.address, pp.city, pp.zip_code, pp.company_name, pp.nip, pp.pesel
     FROM users u
     LEFT JOIN parent_profiles pp ON pp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [parentId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("Nie znaleziono rodzica do faktury");
  }

  const profile = {
    address: row.address,
    city: row.city,
    zip_code: row.zip_code,
    company_name: row.company_name,
    nip: row.nip,
    pesel: row.pesel,
  };

  if (!isParentContractProfileComplete(profile)) {
    throw new Error(
      "Uzupełnij profil rodzica (Profil i dane do faktury): adres oraz PESEL albo dane firmy"
    );
  }

  const billingType = resolveBillingTypeFromProfile(profile);
  const parentFullName =
    `${formatPersonName(row.first_name)} ${formatPersonName(row.last_name)}`.trim();
  const buyerAddress = buildParentAddress(
    String(row.address ?? "").trim(),
    String(row.zip_code ?? "").trim(),
    String(row.city ?? "").trim()
  );

  if (billingType === "company") {
    return {
      parentFullName,
      buyerName: String(row.company_name ?? "").trim(),
      buyerAddress,
      buyerNip: String(row.nip ?? "").trim() || null,
    };
  }

  return {
    parentFullName,
    buyerName: parentFullName,
    buyerAddress,
    buyerNip: null,
  };
}

async function allocateSaleInvoiceNumber(
  client: PoolClient,
  schoolId: string,
  parentId: string,
  issueDate: Date
): Promise<string> {
  const parentClientNumber = await ensureParentClientNumber(
    client,
    parentId,
    schoolId
  );
  const year = issueDate.getFullYear();
  const month = issueDate.getMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  const res = await client.query<{ last_number: number }>(
    `INSERT INTO invoice_parent_month_counters (
       school_id, parent_id, year_month, last_number, updated_at
     ) VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (school_id, parent_id, year_month)
     DO UPDATE SET
       last_number = invoice_parent_month_counters.last_number + 1,
       updated_at = NOW()
     RETURNING last_number`,
    [schoolId, parentId, yearMonth]
  );
  const n = res.rows[0]?.last_number;
  if (!n) throw new Error("Nie udało się przydzielić numeru faktury");
  return buildSaleInvoiceNumber({
    parentClientNumber,
    month,
    year,
    sequence: n,
  });
}

async function allocateCorrectiveInvoiceNumber(
  client: PoolClient,
  schoolId: string,
  originalInvoiceId: string,
  originalInvoiceNumber: string
): Promise<string> {
  await client.query(
    `SELECT id FROM invoices WHERE id = $1 AND school_id = $2 FOR UPDATE`,
    [originalInvoiceId, schoolId]
  );
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM invoices
     WHERE school_id = $1
       AND corrects_invoice_id = $2
       AND document_type = 'CORRECTIVE'`,
    [schoolId, originalInvoiceId]
  );
  const next = Number(countRes.rows[0]?.count ?? 0) + 1;
  return buildCorrectiveInvoiceNumber(originalInvoiceNumber, next);
}

async function insertPaymentWithInvoice(params: {
  schoolId: string;
  parentId: string;
  contractId: string | null;
  childId: string | null;
  amount: number;
  description: string;
  periodMonth: string | null;
  dueDate: string;
  schoolYearId: string | null;
}): Promise<{ paymentId: string; invoiceId: string; invoiceNumber: string }> {
  const school = await fetchSchoolInvoiceSettings(params.schoolId);
  const sellerName = requireTrimmed(school.invoice_seller_name, "invoice_seller_name");
  const sellerAddress = requireTrimmed(school.invoice_seller_address, "invoice_seller_address");
  const sellerNip = requireTrimmed(school.invoice_seller_nip, "invoice_seller_nip");
  const issuePlace = requireTrimmed(school.invoice_place, "invoice_place");
  const bankAccount = requireTrimmed(school.invoice_bank_account, "invoice_bank_account");
  const bankLabel = requireTrimmed(school.invoice_bank_label, "invoice_bank_label");
  const issuerName = requireTrimmed(school.invoice_issuer_name, "invoice_issuer_name");
  const vatExemption = requireTrimmed(school.invoice_vat_exemption, "invoice_vat_exemption");
  const itemName =
    String(school.invoice_default_item_name ?? "").trim() || "Kurs języka angielskiego";

  const buyer = await fetchBuyerInvoiceData(params.parentId);

  const issueDate = new Date();
  const saleDate = issueDate;
  const issueDateStr = toDateString(issueDate)!;
  const saleDateStr = toDateString(saleDate)!;
  const amountWords = amountInWordsPln(params.amount);

  const placeholders = buildInvoicePlaceholders({
    invoiceNumber: "PLACEHOLDER",
    issueDate,
    saleDate,
    dueDate: params.dueDate,
    issuePlace,
    sellerName,
    sellerAddress,
    sellerNip,
    buyerName: buyer.buyerName,
    buyerAddress: buyer.buyerAddress,
    buyerNip: buyer.buyerNip,
    itemName,
    amount: params.amount,
    bankLabel,
    bankAccount,
    vatExemption,
    issuerName,
  });

  const { paymentId, invoiceId, invoiceNumber, contentHtml } = await runPgTransaction(
    async (client) => {
      const invoiceNumber = await allocateSaleInvoiceNumber(
        client,
        params.schoolId,
        params.parentId,
        issueDate
      );
      const paymentId = randomUUID();
      const invoiceId = randomUUID();

      const contentHtml = renderInvoiceHtml({
        ...placeholders,
        invoice_number: invoiceNumber,
      });

      await client.query(
        `INSERT INTO payments (
           id, school_id, child_id, parent_id, contract_id, amount, status,
           due_date, period_month, description, school_year_id, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, 'PENDING',
           $7::date, $8::date, $9, $10, NOW()
         )`,
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

      await client.query(
        `INSERT INTO invoices (
           id, school_id, payment_id, parent_id, child_id, contract_id, school_year_id,
           invoice_number, issue_date, sale_date, due_date,
           seller_name, seller_address, seller_nip, issue_place,
           bank_account, bank_label, issuer_name, vat_exemption,
           buyer_name, buyer_address, buyer_nip,
           item_name, item_qty, item_discount, item_unit_price, item_value,
           amount, amount_in_words, payment_method, currency,
           content_html, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9::date, $10::date, $11::date,
           $12, $13, $14, $15,
           $16, $17, $18, $19,
           $20, $21, $22,
           $23, $24, $25, $26, $27,
           $28, $29, 'Przelew', 'PLN',
           $30, NOW()
         )`,
        [
          invoiceId,
          params.schoolId,
          paymentId,
          params.parentId,
          params.childId,
          params.contractId,
          params.schoolYearId,
          invoiceNumber,
          issueDateStr,
          saleDateStr,
          params.dueDate,
          sellerName,
          sellerAddress,
          sellerNip,
          issuePlace,
          bankAccount,
          bankLabel,
          issuerName,
          vatExemption,
          buyer.buyerName,
          buyer.buyerAddress,
          buyer.buyerNip,
          itemName,
          "1 szt",
          "0 %",
          params.amount,
          params.amount,
          params.amount,
          amountWords,
          contentHtml,
        ]
      );

      return { paymentId, invoiceId, invoiceNumber, contentHtml };
    }
  );

  try {
    const pdf = await renderHtmlToPdf(contentHtml);
    const filename = `Faktura-${safePdfSlug(invoiceNumber.replace(/\//g, "-"))}.pdf`;
    let uploadedKey: string | null = null;
    try {
      uploadedKey = await storeInvoicePdfInR2({
        parentUserId: params.parentId,
        issuedAt: issueDate,
        filename,
        content: pdf,
      });
      await queryDb(`UPDATE invoices SET pdf_key = $2 WHERE id = $1`, [invoiceId, uploadedKey]);
    } catch (err) {
      if (uploadedKey) {
        try {
          await deleteR2Object(uploadedKey);
        } catch (cleanupErr) {
          console.warn(`[R2] Nie udało się usunąć orphan PDF ${uploadedKey}:`, cleanupErr);
        }
      }
      throw err;
    }
  } catch (err) {
    await queryDb(`DELETE FROM payments WHERE id = $1`, [paymentId]);
    throw err;
  }

  return { paymentId, invoiceId, invoiceNumber };
}

async function resolveContractChildId(contractId: string): Promise<string | null> {
  const res = await queryDb<{ child_id: string | null }>(
    `SELECT COALESCE(
       c.child_id,
       (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
     ) AS child_id
     FROM contracts c
     WHERE c.id = $1
     LIMIT 1`,
    [contractId]
  );
  return res.rows[0]?.child_id ?? null;
}

function mapInvoiceError(err: unknown): InvoiceCreateResult {
  const message = err instanceof Error ? err.message : "Błąd generowania faktury";
  const status =
    message.includes("Brak danych faktury szkoły") ||
    message.includes("Uzupełnij profil rodzica") ||
    message.includes("Nie znaleziono")
      ? 409
      : 500;
  console.error("Invoice PDF generation error:", err);
  return { ok: false, message, status };
}

export async function createContractYearlyInvoice(contractId: string): Promise<InvoiceCreateResult> {
  return withPgAdvisoryLock("invoice-yearly", contractId, async () => {
    const contractRes = await queryDb<
      ContractInvoiceRow & { payment_type: string | null; billing_exempt: boolean }
    >(
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
    const dueDate = lastDayOfMonthDateString(signedAt);

    try {
      const childId = await resolveContractChildId(contract.id);
      const { paymentId } = await insertPaymentWithInvoice({
        schoolId: contract.school_id,
        parentId: contract.parent_id,
        contractId: contract.id,
        childId,
        amount,
        description: `${INVOICE_DESC_YEARLY_PREFIX} — rok szkolny`,
        periodMonth: null,
        dueDate,
        schoolYearId: contract.school_year_id,
      });

      try {
        await notifyParentAboutInvoice(paymentId);
      } catch (err) {
        console.error("Yearly invoice email error:", err);
      }

      return { ok: true, paymentId, created: true };
    } catch (err) {
      return mapInvoiceError(err);
    }
  });
}

export async function createContractMonthlyInvoice(
  contractId: string,
  periodMonth: Date
): Promise<InvoiceCreateResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodStart.toISOString().slice(0, 10);

  return withPgAdvisoryLock("invoice-monthly", `${contractId}:${periodMonthStr}`, async () => {
    const contractRes = await queryDb<
      ContractInvoiceRow & { payment_type: string | null; billing_exempt: boolean }
    >(
      `SELECT c.id, c.school_id, c.parent_id, c.school_year_id, c.amount::text AS amount,
              c.signed_at, c.payment_type, c.billing_exempt
       FROM contracts c
       WHERE c.id = $1
       LIMIT 1`,
      [contractId]
    );
    const contract = contractRes.rows[0];
    if (!contract) {
      return { ok: false, message: "Nie znaleziono umowy", status: 404 };
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

    const dueDate = lastDayOfMonthDateString(periodStart);

    try {
      const childId = await resolveContractChildId(contract.id);
      const { paymentId } = await insertPaymentWithInvoice({
        schoolId: contract.school_id,
        parentId: contract.parent_id,
        contractId: contract.id,
        childId,
        amount,
        description: `${INVOICE_DESC_MONTHLY_PREFIX} — ${periodMonthStr.slice(0, 7)}`,
        periodMonth: periodMonthStr,
        dueDate,
        schoolYearId: contract.school_year_id,
      });

      try {
        await notifyParentAboutInvoice(paymentId);
      } catch (err) {
        console.error("Monthly invoice email error:", err);
      }

      return { ok: true, paymentId, created: true };
    } catch (err) {
      return mapInvoiceError(err);
    }
  });
}

export async function createLessonBillingInvoice(
  billingId: string
): Promise<InvoiceCreateResult & { billingId?: string }> {
  return withPgAdvisoryLock("invoice-lesson", billingId, async () => {
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

    const dueDate = lastDayOfMonthDateString(new Date(`${periodMonth.slice(0, 7)}-01T00:00:00.000Z`));

    try {
      const { paymentId } = await insertPaymentWithInvoice({
        schoolId: billing.school_id,
        parentId: billing.parent_id,
        contractId: billing.contract_id,
        childId: billing.child_id,
        amount: Number(billing.amount),
        description: `${INVOICE_DESC_LESSON_PREFIX} — ${periodMonth.slice(0, 7)}`,
        periodMonth,
        dueDate,
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
    } catch (err) {
      return mapInvoiceError(err);
    }
  });
}

export type MonthlyInvoiceBatchResult = {
  periodMonth: string;
  generationDay: number;
  schoolsProcessed: number;
  generated: number;
  skipped: number;
  alreadyInvoiced: number;
  errors: Array<{ contractId: string; schoolId?: string; message: string }>;
};

export type MonthlyInvoiceSchoolResult = {
  periodMonth: string;
  schoolId: string;
  dueDate: string;
  generated: number;
  skipped: number;
  alreadyInvoiced: number;
  eligible: number;
  errors: Array<{ contractId: string; message: string }>;
};

/** Faktury ratalne (MONTHLY) dla jednej szkoły — bez filtra dnia (np. ręczne uruchomienie). */
export async function generateMonthlyInvoicesForSchool(
  schoolId: string,
  periodMonth: Date = new Date()
): Promise<MonthlyInvoiceSchoolResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodStart.toISOString().slice(0, 10);
  const dueDate = lastDayOfMonthDateString(periodStart);

  const baseWhereSql = `
    c.school_id = $1
      AND c.payment_type = 'MONTHLY'
      AND c.status = 'SIGNED'
      AND c.billing_exempt = false
      AND c.amount IS NOT NULL
      AND c.amount > 0
      AND (c.signed_at IS NULL OR DATE_TRUNC('month', c.signed_at) <= $2::date)`;

  const [alreadyRes, contractsRes] = await Promise.all([
    queryDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM contracts c
       WHERE ${baseWhereSql}
         AND EXISTS (
           SELECT 1 FROM payments p
           WHERE p.contract_id = c.id
             AND p.period_month = $2::date
             AND p.description LIKE $3
         )`,
      [schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
    ),
    queryDb<{ id: string }>(
      `SELECT c.id
       FROM contracts c
       WHERE ${baseWhereSql}
         AND NOT EXISTS (
           SELECT 1 FROM payments p
           WHERE p.contract_id = c.id
             AND p.period_month = $2::date
             AND p.description LIKE $3
         )
       ORDER BY c.created_at ASC`,
      [schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
    ),
  ]);

  const alreadyInvoiced = Number(alreadyRes.rows[0]?.count ?? 0);
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

  return {
    periodMonth: periodMonthStr,
    schoolId,
    dueDate,
    generated,
    skipped,
    alreadyInvoiced,
    eligible: contractsRes.rows.length,
    errors,
  };
}

/** Cron: tylko szkoły, których invoice_generation_day = dziś (Europe/Warsaw). */
export async function generateAllMonthlyInvoices(
  periodMonth: Date = new Date()
): Promise<MonthlyInvoiceBatchResult> {
  const generationDay = warsawCalendarDay(periodMonth);
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodStart.toISOString().slice(0, 10);

  const schoolsRes = await queryDb<{ id: string }>(
    `SELECT id
     FROM schools
     WHERE active = true
       AND invoice_generation_day = $1`,
    [generationDay]
  );

  let generated = 0;
  let skipped = 0;
  let alreadyInvoiced = 0;
  const errors: Array<{ contractId: string; schoolId?: string; message: string }> = [];

  for (const school of schoolsRes.rows) {
    const result = await generateMonthlyInvoicesForSchool(school.id, periodStart);
    generated += result.generated;
    skipped += result.skipped;
    alreadyInvoiced += result.alreadyInvoiced;
    for (const err of result.errors) {
      errors.push({ ...err, schoolId: school.id });
    }
  }

  return {
    periodMonth: periodMonthStr,
    generationDay,
    schoolsProcessed: schoolsRes.rows.length,
    generated,
    skipped,
    alreadyInvoiced,
    errors,
  };
}

export type CorrectiveInvoiceInput = {
  schoolId: string;
  originalInvoiceId: string;
  correctionReason: string;
  itemName: string;
  itemQty: string;
  itemDiscount: string;
  itemUnitPrice: number;
  itemValue: number;
  amount: number;
  issueDate?: string;
  saleDate?: string;
  dueDate?: string;
};

export type CorrectiveInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      paymentId: string;
      invoiceNumber: string;
    }
  | { ok: false; message: string; status: number };

/** Wystawia fakturę korygującą (FK) względem faktury SALE. */
export async function createCorrectiveInvoice(
  input: CorrectiveInvoiceInput
): Promise<CorrectiveInvoiceResult> {
  const reason = String(input.correctionReason ?? "").trim();
  if (!reason) {
    return { ok: false, message: "Podaj powód korekty", status: 400 };
  }
  if (!Number.isFinite(input.amount) || !Number.isFinite(input.itemUnitPrice) || !Number.isFinite(input.itemValue)) {
    return { ok: false, message: "Nieprawidłowe kwoty korekty", status: 400 };
  }

  const originalRes = await queryDb<{
    id: string;
    school_id: string;
    payment_id: string;
    parent_id: string;
    child_id: string | null;
    contract_id: string | null;
    school_year_id: string | null;
    document_type: string;
    invoice_number: string;
    amount: string;
    buyer_name: string;
    buyer_address: string;
    buyer_nip: string | null;
    seller_name: string;
    seller_address: string;
    seller_nip: string;
    issue_place: string;
    bank_account: string;
    bank_label: string;
    issuer_name: string;
    vat_exemption: string;
    item_name: string;
  }>(
    `SELECT id, school_id, payment_id, parent_id, child_id, contract_id, school_year_id,
            COALESCE(document_type, 'SALE') AS document_type,
            invoice_number, amount::text AS amount,
            buyer_name, buyer_address, buyer_nip,
            seller_name, seller_address, seller_nip, issue_place,
            bank_account, bank_label, issuer_name, vat_exemption, item_name
     FROM invoices
     WHERE id = $1 AND school_id = $2
     LIMIT 1`,
    [input.originalInvoiceId, input.schoolId]
  );
  const original = originalRes.rows[0];
  if (!original) {
    return { ok: false, message: "Nie znaleziono faktury źródłowej", status: 404 };
  }
  if (original.document_type !== "SALE") {
    return {
      ok: false,
      message: "Można korygować wyłącznie faktury sprzedaży (SALE)",
      status: 400,
    };
  }

  const originalAmount = Number(original.amount);
  if (!Number.isFinite(originalAmount)) {
    return { ok: false, message: "Nieprawidłowa kwota faktury źródłowej", status: 500 };
  }
  const paymentDelta = Math.round((input.amount - originalAmount) * 100) / 100;

  const issueDate = input.issueDate
    ? new Date(`${input.issueDate.slice(0, 10)}T12:00:00`)
    : new Date();
  const saleDate = input.saleDate
    ? new Date(`${input.saleDate.slice(0, 10)}T12:00:00`)
    : issueDate;
  const issueDateStr = toDateString(issueDate)!;
  const saleDateStr = toDateString(saleDate)!;
  const dueDateStr = input.dueDate?.slice(0, 10) || lastDayOfMonthDateString(issueDate);

  const itemName = String(input.itemName ?? "").trim() || original.item_name;
  const itemQty = String(input.itemQty ?? "").trim() || "1 szt";
  const itemDiscount = String(input.itemDiscount ?? "").trim() || "0 %";
  const amountWords = amountInWordsPln(input.amount);

  const parentRes = await queryDb<{
    first_name: string;
    last_name: string;
    pesel: string | null;
    nip: string | null;
    company_name: string | null;
  }>(
    `SELECT u.first_name, u.last_name, pp.pesel, pp.nip, pp.company_name
     FROM users u
     LEFT JOIN parent_profiles pp ON pp.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [original.parent_id]
  );
  const parent = parentRes.rows[0];
  const parentFullName = parent
    ? [parent.first_name, parent.last_name].filter(Boolean).join(" ").trim()
    : original.buyer_name;
  try {
    const placeholders = buildInvoicePlaceholders({
      invoiceNumber: "PLACEHOLDER",
      issueDate,
      saleDate,
      dueDate: dueDateStr,
      issuePlace: original.issue_place,
      sellerName: original.seller_name,
      sellerAddress: original.seller_address,
      sellerNip: original.seller_nip,
      buyerName: original.buyer_name,
      buyerAddress: original.buyer_address,
      buyerNip: original.buyer_nip,
      itemName,
      amount: input.amount,
      itemQty,
      itemDiscount,
      itemUnitPrice: input.itemUnitPrice,
      itemValue: input.itemValue,
      bankLabel: original.bank_label,
      bankAccount: original.bank_account,
      vatExemption: original.vat_exemption,
      issuerName: original.issuer_name,
      documentTitle: "Faktura korygująca",
      originalInvoiceNumber: original.invoice_number,
      correctionReason: reason,
    });

    const { paymentId, invoiceId, invoiceNumber, contentHtml } = await runPgTransaction(
      async (client) => {
        const invoiceNumber = await allocateCorrectiveInvoiceNumber(
          client,
          input.schoolId,
          original.id,
          original.invoice_number
        );
        const paymentId = randomUUID();
        const invoiceId = randomUUID();
        const contentHtml = renderInvoiceHtml({
          ...placeholders,
          invoice_number: invoiceNumber,
        });

        await client.query(
          `INSERT INTO payments (
             id, school_id, child_id, parent_id, contract_id, amount, status,
             due_date, period_month, description, school_year_id, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, 'PENDING',
             $7::date, NULL, $8, $9, NOW()
           )`,
          [
            paymentId,
            input.schoolId,
            original.child_id,
            original.parent_id,
            original.contract_id,
            paymentDelta,
            dueDateStr,
            `Korekta faktury ${original.invoice_number}`,
            original.school_year_id,
          ]
        );

        await client.query(
          `INSERT INTO invoices (
             id, school_id, payment_id, parent_id, child_id, contract_id, school_year_id,
             document_type, corrects_invoice_id, correction_reason,
             invoice_number, issue_date, sale_date, due_date,
             seller_name, seller_address, seller_nip, issue_place,
             bank_account, bank_label, issuer_name, vat_exemption,
             buyer_name, buyer_address, buyer_nip,
             item_name, item_qty, item_discount, item_unit_price, item_value,
             amount, amount_in_words, payment_method, currency,
             content_html, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             'CORRECTIVE', $8, $9,
             $10, $11::date, $12::date, $13::date,
             $14, $15, $16, $17,
             $18, $19, $20, $21,
             $22, $23, $24,
             $25, $26, $27, $28, $29,
             $30, $31, 'Przelew', 'PLN',
             $32, NOW()
           )`,
          [
            invoiceId,
            input.schoolId,
            paymentId,
            original.parent_id,
            original.child_id,
            original.contract_id,
            original.school_year_id,
            original.id,
            reason,
            invoiceNumber,
            issueDateStr,
            saleDateStr,
            dueDateStr,
            original.seller_name,
            original.seller_address,
            original.seller_nip,
            original.issue_place,
            original.bank_account,
            original.bank_label,
            original.issuer_name,
            original.vat_exemption,
            original.buyer_name,
            original.buyer_address,
            original.buyer_nip,
            itemName,
            itemQty,
            itemDiscount,
            input.itemUnitPrice,
            input.itemValue,
            input.amount,
            amountWords,
            contentHtml,
          ]
        );

        return { paymentId, invoiceId, invoiceNumber, contentHtml };
      }
    );

    try {
      const pdf = await renderHtmlToPdf(contentHtml);
      const filename = `Faktura-korygujaca-${safePdfSlug(invoiceNumber.replace(/\//g, "-"))}.pdf`;
      let uploadedKey: string | null = null;
      try {
        uploadedKey = await storeInvoicePdfInR2({
          parentUserId: original.parent_id,
          issuedAt: issueDate,
          filename,
          content: pdf,
        });
        await queryDb(`UPDATE invoices SET pdf_key = $2 WHERE id = $1`, [invoiceId, uploadedKey]);
      } catch (err) {
        if (uploadedKey) {
          try {
            await deleteR2Object(uploadedKey);
          } catch (cleanupErr) {
            console.warn(`[R2] Nie udało się usunąć orphan PDF ${uploadedKey}:`, cleanupErr);
          }
        }
        throw err;
      }
    } catch (err) {
      await queryDb(`DELETE FROM payments WHERE id = $1`, [paymentId]);
      throw err;
    }

    return { ok: true, invoiceId, paymentId, invoiceNumber };
  } catch (error) {
    console.error("createCorrectiveInvoice:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Nie udało się wystawić faktury korygującej";
    return { ok: false, message, status: 500 };
  }
}
