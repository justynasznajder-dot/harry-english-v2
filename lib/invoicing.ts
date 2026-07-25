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
  type InvoiceHtmlItemInput,
} from "@/lib/invoice-html";
import { invoicesSupportInvoiceItems } from "@/lib/invoice-schema";
import {
  isParentContractProfileComplete,
  resolveBillingTypeFromProfile,
} from "@/lib/parent-contract-profile";
import { deleteR2Object, storeInvoicePdfInR2 } from "@/lib/r2-storage";
import {
  firstDayOfMonthUtcDate,
  lastDayOfMonthYmd,
  periodMonthKey,
  periodMonthStartYmd,
  pgDateToYmd,
  warsawYmdParts,
} from "@/lib/school-timezone";
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
  return pgDateToYmd(value);
}

function firstDayOfMonth(date: Date | string): Date {
  return firstDayOfMonthUtcDate(date);
}

/** Ostatni dzień miesiąca (YYYY-MM-DD, kalendarz szkolny Europe/Warsaw). */
export function lastDayOfMonthDateString(date: Date | string): string {
  return lastDayOfMonthYmd(date);
}

/** Data sprzedaży: ostatni dzień miesiąca rozliczeniowego (lub miesiąca wystawienia). */
export function resolveInvoiceSaleDateString(params: {
  periodMonth?: string | null;
  issueDate: Date;
}): string {
  const period = String(params.periodMonth ?? "").trim().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(period)) {
    return lastDayOfMonthYmd(period);
  }
  return lastDayOfMonthYmd(params.issueDate);
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
  return warsawYmdParts(date).day;
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

export async function getSchoolInvoiceAutoGeneration(schoolId: string): Promise<boolean> {
  const res = await queryDb<{ invoice_auto_generation: boolean }>(
    `SELECT invoice_auto_generation FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId]
  );
  return Boolean(res.rows[0]?.invoice_auto_generation);
}

export async function setSchoolInvoiceAutoGeneration(
  schoolId: string,
  enabled: boolean
): Promise<boolean> {
  const value = Boolean(enabled);
  await queryDb(`UPDATE schools SET invoice_auto_generation = $2 WHERE id = $1`, [
    schoolId,
    value,
  ]);
  return value;
}

export async function isContractMonthlyInvoiceHeld(
  schoolId: string,
  contractId: string,
  periodMonth: Date | string
): Promise<boolean> {
  const periodMonthStr = periodMonthStartYmd(periodMonth);
  const res = await queryDb<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM school_invoice_holds
       WHERE school_id = $1
         AND contract_id = $2
         AND period_month = $3::date
     ) AS exists`,
    [schoolId, contractId, periodMonthStr]
  );
  return Boolean(res.rows[0]?.exists);
}

export async function setContractMonthlyInvoiceHold(
  schoolId: string,
  contractId: string,
  periodMonth: Date | string,
  held: boolean
): Promise<void> {
  const periodMonthStr = periodMonthStartYmd(periodMonth);
  const contractRes = await queryDb<{ id: string }>(
    `SELECT id FROM contracts
     WHERE id = $1
       AND school_id = $2
       AND payment_type = 'MONTHLY'
       AND status = 'SIGNED'
     LIMIT 1`,
    [contractId, schoolId]
  );
  if (!contractRes.rows[0]) {
    throw new Error("Nie znaleziono podpisanej umowy ratalnej w tej szkole");
  }

  if (held) {
    await queryDb(
      `INSERT INTO school_invoice_holds (school_id, contract_id, period_month)
       SELECT $1, $2, $3::date
       WHERE NOT EXISTS (
         SELECT 1 FROM school_invoice_holds
         WHERE school_id = $1
           AND contract_id = $2
           AND period_month = $3::date
       )`,
      [schoolId, contractId, periodMonthStr]
    );
    return;
  }

  await queryDb(
    `DELETE FROM school_invoice_holds
     WHERE school_id = $1
       AND contract_id = $2
       AND period_month = $3::date`,
    [schoolId, contractId, periodMonthStr]
  );
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
  const yearMonth = periodMonthKey(issueDate);
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

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

export type InvoiceLineInput = {
  name: string;
  amount: number;
  childId?: string | null;
  contractId?: string | null;
  qty?: string;
  discount?: string;
};

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
  /** Gdy podane — wiele pozycji; inaczej jedna z domyślną nazwą szkoły. */
  items?: InvoiceLineInput[];
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
  const defaultItemName =
    String(school.invoice_default_item_name ?? "").trim() || "Kurs języka angielskiego";

  const lineItems: InvoiceLineInput[] =
    params.items && params.items.length > 0
      ? params.items
      : [
          {
            name: defaultItemName,
            amount: params.amount,
            childId: params.childId,
            contractId: params.contractId,
          },
        ];

  const totalAmount =
    Math.round(lineItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Brak kwoty do zafakturowania");
  }

  const htmlItems: InvoiceHtmlItemInput[] = lineItems.map((item) => ({
    name: item.name,
    qty: item.qty ?? "1 szt",
    discount: item.discount ?? "0 %",
    unitPrice: item.amount,
    value: item.amount,
  }));
  const firstItem = htmlItems[0]!;

  const buyer = await fetchBuyerInvoiceData(params.parentId);

  const issueDate = new Date();
  const issueDateStr = toDateString(issueDate)!;
  const saleDateStr = resolveInvoiceSaleDateString({
    periodMonth: params.periodMonth,
    issueDate,
  });
  const saleDate = new Date(`${saleDateStr}T12:00:00`);
  const amountWords = amountInWordsPln(totalAmount);

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
    items: htmlItems,
    itemName: firstItem.name,
    amount: totalAmount,
    bankLabel,
    bankAccount,
    vatExemption,
    issuerName,
  });

  const writeItems = await invoicesSupportInvoiceItems();

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
          totalAmount,
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
          firstItem.name,
          firstItem.qty ?? "1 szt",
          firstItem.discount ?? "0 %",
          firstItem.unitPrice,
          firstItem.value,
          totalAmount,
          amountWords,
          contentHtml,
        ]
      );

      if (writeItems) {
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i]!;
          await client.query(
            `INSERT INTO invoice_items (
               id, invoice_id, lp, name, qty, discount, unit_price, value,
               child_id, contract_id, created_at
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
             )`,
            [
              randomUUID(),
              invoiceId,
              i + 1,
              item.name,
              item.qty ?? "1 szt",
              item.discount ?? "0 %",
              item.amount,
              item.amount,
              item.childId ?? null,
              item.contractId ?? null,
            ]
          );
        }
      }

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
        source: "invoice.create",
      });
      await queryDb(`UPDATE invoices SET pdf_key = $2 WHERE id = $1`, [invoiceId, uploadedKey]);
    } catch (err) {
      if (uploadedKey) {
        try {
          await deleteR2Object(uploadedKey, { source: "invoice.orphan-cleanup" });
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

async function contractHasMonthlyInvoiceForPeriod(
  contractId: string,
  periodMonthStr: string
): Promise<boolean> {
  const hasItems = await invoicesSupportInvoiceItems();
  if (hasItems) {
    const res = await queryDb<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = $1
           AND p.period_month = $2::date
           AND p.description LIKE $3
         UNION ALL
         SELECT 1
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN payments p ON p.id = i.payment_id
         WHERE ii.contract_id = $1
           AND p.period_month = $2::date
           AND p.description LIKE $3
       ) AS exists`,
      [contractId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
    );
    return res.rows[0]?.exists === true;
  }
  const res = await queryDb<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM payments p
       WHERE p.contract_id = $1
         AND p.period_month = $2::date
         AND p.description LIKE $3
     ) AS exists`,
    [contractId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
  );
  return res.rows[0]?.exists === true;
}

async function resolveContractChildLabel(contractId: string): Promise<{
  childId: string | null;
  childName: string;
}> {
  const res = await queryDb<{
    child_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT
       COALESCE(
         c.child_id,
         (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
       ) AS child_id,
       ch.first_name,
       ch.last_name
     FROM contracts c
     LEFT JOIN children ch ON ch.id = COALESCE(
       c.child_id,
       (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
     )
     WHERE c.id = $1
     LIMIT 1`,
    [contractId]
  );
  const row = res.rows[0];
  const childName = `${formatPersonName(row?.first_name ?? "")} ${formatPersonName(row?.last_name ?? "")}`.trim();
  return {
    childId: row?.child_id ?? null,
    childName: childName || "dziecko",
  };
}

/** Zbiorcza faktura miesięczna: umowy MONTHLY rodzica w okresie → 1 faktura + N pozycji.
 *  Domyślnie pomija umowy wstrzymane na ten miesiąc.
 *  `onlyContractIds` — wystaw tylko wskazane umowy (np. ręcznie przez księgową mimo holdu).
 */
export async function createParentMonthlyInvoice(
  parentId: string,
  schoolId: string,
  periodMonth: Date,
  options?: { onlyContractIds?: string[] }
): Promise<InvoiceCreateResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodMonthStartYmd(periodStart);
  const periodLabel = periodMonthStr.slice(0, 7);
  const onlyContractIds = (options?.onlyContractIds ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const onlySet = onlyContractIds.length > 0 ? new Set(onlyContractIds) : null;

  return withPgAdvisoryLock(
    "invoice-monthly-parent",
    `${schoolId}:${parentId}:${periodMonthStr}${onlySet ? `:manual:${[...onlySet].sort().join(",")}` : ""}`,
    async () => {
      const contractsRes = await queryDb<{
        id: string;
        school_id: string;
        parent_id: string;
        school_year_id: string | null;
        amount: string;
        signed_at: Date | string | null;
      }>(
        `SELECT c.id, c.school_id, c.parent_id, c.school_year_id, c.amount::text AS amount, c.signed_at
         FROM contracts c
         WHERE c.school_id = $1
           AND c.parent_id = $2
           AND c.payment_type = 'MONTHLY'
           AND c.status = 'SIGNED'
           AND c.billing_exempt = false
           AND c.amount IS NOT NULL
           AND c.amount > 0
           AND (c.signed_at IS NULL OR DATE_TRUNC('month', c.signed_at) <= $3::date)
         ORDER BY c.created_at ASC`,
        [schoolId, parentId, periodMonthStr]
      );

      const pending: Array<{
        id: string;
        school_year_id: string | null;
        amount: number;
        childId: string | null;
        childName: string;
      }> = [];

      for (const row of contractsRes.rows) {
        if (onlySet && !onlySet.has(row.id)) continue;
        if (!onlySet && (await isContractMonthlyInvoiceHeld(schoolId, row.id, periodStart))) {
          continue;
        }
        if (row.signed_at) {
          const signedMonth = firstDayOfMonth(new Date(row.signed_at));
          if (periodStart < signedMonth) continue;
        }
        if (await contractHasMonthlyInvoiceForPeriod(row.id, periodMonthStr)) {
          continue;
        }
        const amount = Number(row.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const child = await resolveContractChildLabel(row.id);
        pending.push({
          id: row.id,
          school_year_id: row.school_year_id,
          amount,
          childId: child.childId,
          childName: child.childName,
        });
      }

      if (pending.length === 0) {
        if (onlySet) {
          const anyOfRequested = await queryDb<{ id: string }>(
            `SELECT p.id
             FROM payments p
             WHERE p.parent_id = $1
               AND p.school_id = $2
               AND p.period_month = $3::date
               AND p.description LIKE $4
               AND (
                 p.contract_id = ANY($5::text[])
                 OR EXISTS (
                   SELECT 1 FROM invoice_items ii
                   JOIN invoices i ON i.id = ii.invoice_id
                   WHERE i.payment_id = p.id
                     AND ii.contract_id = ANY($5::text[])
                 )
               )
             LIMIT 1`,
            [
              parentId,
              schoolId,
              periodMonthStr,
              `${INVOICE_DESC_MONTHLY_PREFIX}%`,
              [...onlySet],
            ]
          );
          if (anyOfRequested.rows[0]) {
            return { ok: true, paymentId: anyOfRequested.rows[0].id, created: false };
          }
          return { ok: false, message: "Brak umów do zafakturowania", status: 409 };
        }

        const anyExisting = await queryDb<{ id: string }>(
          `SELECT p.id
           FROM payments p
           WHERE p.parent_id = $1
             AND p.school_id = $2
             AND p.period_month = $3::date
             AND p.description LIKE $4
           LIMIT 1`,
          [parentId, schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
        );
        if (anyExisting.rows[0]) {
          return { ok: true, paymentId: anyExisting.rows[0].id, created: false };
        }
        return { ok: false, message: "Brak umów do zafakturowania", status: 409 };
      }

      const school = await fetchSchoolInvoiceSettings(schoolId);
      const defaultItemName =
        String(school.invoice_default_item_name ?? "").trim() || "Kurs języka angielskiego";

      const items: InvoiceLineInput[] = pending.map((c) => ({
        name: `${defaultItemName} — ${c.childName} — ${periodLabel}`,
        amount: c.amount,
        childId: c.childId,
        contractId: c.id,
      }));

      const dueDate = lastDayOfMonthDateString(periodStart);
      const first = pending[0]!;
      const childCount = pending.length;
      const description =
        childCount === 1
          ? `${INVOICE_DESC_MONTHLY_PREFIX} — ${periodLabel}`
          : `${INVOICE_DESC_MONTHLY_PREFIX} — ${periodLabel} (${childCount} dzieci)`;

      try {
        const { paymentId } = await insertPaymentWithInvoice({
          schoolId,
          parentId,
          contractId: first.id,
          childId: first.childId,
          amount: items.reduce((s, i) => s + i.amount, 0),
          description,
          periodMonth: periodMonthStr,
          dueDate,
          schoolYearId: first.school_year_id,
          items,
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
    }
  );
}

export async function createContractMonthlyInvoice(
  contractId: string,
  periodMonth: Date
): Promise<InvoiceCreateResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodMonthStartYmd(periodStart);

  const contractRes = await queryDb<{
    id: string;
    school_id: string;
    parent_id: string;
    payment_type: string | null;
    billing_exempt: boolean;
  }>(
    `SELECT id, school_id, parent_id, payment_type, billing_exempt
     FROM contracts
     WHERE id = $1
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

  if (await contractHasMonthlyInvoiceForPeriod(contractId, periodMonthStr)) {
    const hasItems = await invoicesSupportInvoiceItems();
    const existing = hasItems
      ? await queryDb<{ id: string }>(
          `SELECT p.id
           FROM payments p
           WHERE (
             p.contract_id = $1
             OR EXISTS (
               SELECT 1 FROM invoice_items ii
               JOIN invoices i ON i.id = ii.invoice_id
               WHERE i.payment_id = p.id AND ii.contract_id = $1
             )
           )
             AND p.period_month = $2::date
             AND p.description LIKE $3
           LIMIT 1`,
          [contractId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
        )
      : await queryDb<{ id: string }>(
          `SELECT p.id
           FROM payments p
           WHERE p.contract_id = $1
             AND p.period_month = $2::date
             AND p.description LIKE $3
           LIMIT 1`,
          [contractId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
        );
    return {
      ok: true,
      paymentId: existing.rows[0]?.id ?? contractId,
      created: false,
    };
  }

  return createParentMonthlyInvoice(contract.parent_id, contract.school_id, periodStart);
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
      pgDateToYmd(billing.period_month) ??
      periodMonthStartYmd(new Date());

    const dueDate = lastDayOfMonthDateString(periodMonth);

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

export type LessonBillingInvoiceSchoolResult = {
  periodMonth: string;
  schoolId: string;
  generated: number;
  alreadyInvoiced: number;
  eligible: number;
  errors: Array<{ billingId: string; message: string }>;
};

/** Faktury za pojedyncze zajęcia — wszystkie zapisane rozliczenia miesiąca bez faktury. */
export async function generateLessonBillingInvoicesForSchool(
  schoolId: string,
  periodMonth: Date | string = new Date()
): Promise<LessonBillingInvoiceSchoolResult> {
  const periodMonthStr = periodMonthStartYmd(periodMonth);

  const pendingRes = await queryDb<{ id: string; payment_id: string | null }>(
    `SELECT id, payment_id
     FROM lesson_billing_periods
     WHERE school_id = $1
       AND period_month = $2::date
       AND status IN ('APPROVED', 'DRAFT')
       AND amount IS NOT NULL
       AND amount > 0
     ORDER BY entered_at ASC`,
    [schoolId, periodMonthStr]
  );

  let generated = 0;
  let alreadyInvoiced = 0;
  const errors: Array<{ billingId: string; message: string }> = [];

  for (const row of pendingRes.rows) {
    if (row.payment_id) {
      alreadyInvoiced += 1;
      continue;
    }
    const result = await createLessonBillingInvoice(row.id);
    if (!result.ok) {
      errors.push({ billingId: row.id, message: result.message });
      continue;
    }
    if (result.created) generated += 1;
    else alreadyInvoiced += 1;
  }

  return {
    periodMonth: periodMonthStr,
    schoolId,
    generated,
    alreadyInvoiced,
    eligible: pendingRes.rows.length,
    errors,
  };
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

export type MonthlyInvoicePreviewLine = {
  contractId: string;
  childId: string | null;
  childName: string;
  amount: number;
  alreadyInvoiced: boolean;
  signedAt: string | null;
};

export type MonthlyInvoicePreviewParent = {
  parentId: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  totalAmount: number;
  alreadyInvoiced: boolean;
  lines: MonthlyInvoicePreviewLine[];
};

export type MonthlyInvoicePreviewResult = {
  periodMonth: string;
  dueDate: string;
  parents: MonthlyInvoicePreviewParent[];
  /** Rodzice wyłączeni z generowania (wstrzymane faktury). */
  heldParents: MonthlyInvoicePreviewParent[];
  totals: {
    parents: number;
    lines: number;
    amount: number;
    pendingAmount: number;
    alreadyInvoicedLines: number;
  };
};

/** Podgląd faktur ratalnych (MONTHLY) na wybrany miesiąc — bez wystawiania. */
export async function previewMonthlyInvoicesForSchool(
  schoolId: string,
  periodMonth: Date = new Date()
): Promise<MonthlyInvoicePreviewResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodMonthStartYmd(periodStart);
  const dueDate = lastDayOfMonthDateString(periodStart);
  const hasItems = await invoicesSupportInvoiceItems();

  const alreadySql = hasItems
    ? `EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )
       OR EXISTS (
         SELECT 1
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN payments p ON p.id = i.payment_id
         WHERE ii.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )`
    : `EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )`;

  const res = await queryDb<{
    contract_id: string;
    parent_id: string;
    parent_first_name: string;
    parent_last_name: string;
    parent_email: string;
    amount: string;
    signed_at: Date | string | null;
    child_id: string | null;
    child_first_name: string | null;
    child_last_name: string | null;
    already_invoiced: boolean;
    invoice_held: boolean;
  }>(
    `SELECT
       c.id AS contract_id,
       c.parent_id,
       u.first_name AS parent_first_name,
       u.last_name AS parent_last_name,
       u.email AS parent_email,
       c.amount::text AS amount,
       c.signed_at,
       COALESCE(
         c.child_id,
         (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
       ) AS child_id,
       ch.first_name AS child_first_name,
       ch.last_name AS child_last_name,
       (${alreadySql}) AS already_invoiced,
       EXISTS (
         SELECT 1 FROM school_invoice_holds h
         WHERE h.school_id = c.school_id
           AND h.contract_id = c.id
           AND h.period_month = $2::date
       ) AS invoice_held
     FROM contracts c
     JOIN users u ON u.id = c.parent_id
     LEFT JOIN children ch ON ch.id = COALESCE(
       c.child_id,
       (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
     )
     WHERE c.school_id = $1
       AND c.payment_type = 'MONTHLY'
       AND c.status = 'SIGNED'
       AND c.billing_exempt = false
       AND c.amount IS NOT NULL
       AND c.amount > 0
       AND (c.signed_at IS NULL OR DATE_TRUNC('month', c.signed_at) <= $2::date)
     ORDER BY u.last_name ASC, u.first_name ASC, c.created_at ASC`,
    [schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
  );

  type ParentBucket = MonthlyInvoicePreviewParent;

  const activeByParent = new Map<string, ParentBucket>();
  const heldByParent = new Map<string, ParentBucket>();

  const ensureParent = (
    map: Map<string, ParentBucket>,
    row: (typeof res.rows)[number]
  ): ParentBucket => {
    let parent = map.get(row.parent_id);
    if (!parent) {
      parent = {
        parentId: row.parent_id,
        parentFirstName: formatPersonName(row.parent_first_name),
        parentLastName: formatPersonName(row.parent_last_name),
        parentEmail: row.parent_email,
        totalAmount: 0,
        alreadyInvoiced: true,
        lines: [],
      };
      map.set(row.parent_id, parent);
    }
    return parent;
  };

  for (const row of res.rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const childName =
      `${formatPersonName(row.child_first_name ?? "")} ${formatPersonName(row.child_last_name ?? "")}`.trim() ||
      "dziecko";
    const signedAt =
      row.signed_at == null
        ? null
        : row.signed_at instanceof Date
          ? row.signed_at.toISOString()
          : String(row.signed_at);

    const parent = ensureParent(
      row.invoice_held ? heldByParent : activeByParent,
      row
    );

    parent.lines.push({
      contractId: row.contract_id,
      childId: row.child_id,
      childName,
      amount,
      alreadyInvoiced: Boolean(row.already_invoiced),
      signedAt,
    });
    parent.totalAmount = Number((parent.totalAmount + amount).toFixed(2));
    if (!row.already_invoiced) parent.alreadyInvoiced = false;
  }

  const parents = Array.from(activeByParent.values());
  const heldParents = Array.from(heldByParent.values());

  let lines = 0;
  let amount = 0;
  let pendingAmount = 0;
  let alreadyInvoicedLines = 0;
  for (const p of parents) {
    for (const line of p.lines) {
      lines += 1;
      amount += line.amount;
      if (line.alreadyInvoiced) alreadyInvoicedLines += 1;
      else pendingAmount += line.amount;
    }
  }

  return {
    periodMonth: periodMonthStr,
    dueDate,
    parents,
    heldParents,
    totals: {
      parents: parents.length,
      lines,
      amount: Number(amount.toFixed(2)),
      pendingAmount: Number(pendingAmount.toFixed(2)),
      alreadyInvoicedLines,
    },
  };
}

/** Faktury ratalne (MONTHLY) dla jednej szkoły — bez filtra dnia (np. ręczne uruchomienie). */
export async function generateMonthlyInvoicesForSchool(
  schoolId: string,
  periodMonth: Date = new Date()
): Promise<MonthlyInvoiceSchoolResult> {
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodMonthStartYmd(periodStart);
  const dueDate = lastDayOfMonthDateString(periodStart);
  const hasItems = await invoicesSupportInvoiceItems();

  const alreadySql = hasItems
    ? `EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )
       OR EXISTS (
         SELECT 1
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         JOIN payments p ON p.id = i.payment_id
         WHERE ii.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )`
    : `EXISTS (
         SELECT 1 FROM payments p
         WHERE p.contract_id = c.id
           AND p.period_month = $2::date
           AND p.description LIKE $3
       )`;

  const baseWhereSql = `
    c.school_id = $1
      AND c.payment_type = 'MONTHLY'
      AND c.status = 'SIGNED'
      AND c.billing_exempt = false
      AND c.amount IS NOT NULL
      AND c.amount > 0
      AND (c.signed_at IS NULL OR DATE_TRUNC('month', c.signed_at) <= $2::date)
      AND NOT EXISTS (
        SELECT 1 FROM school_invoice_holds h
        WHERE h.school_id = c.school_id
          AND h.contract_id = c.id
          AND h.period_month = $2::date
      )`;

  const [alreadyRes, parentsRes] = await Promise.all([
    queryDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM contracts c
       WHERE ${baseWhereSql}
         AND (${alreadySql})`,
      [schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
    ),
    queryDb<{ parent_id: string }>(
      `SELECT DISTINCT c.parent_id
       FROM contracts c
       WHERE ${baseWhereSql}
         AND NOT (${alreadySql})
       ORDER BY c.parent_id ASC`,
      [schoolId, periodMonthStr, `${INVOICE_DESC_MONTHLY_PREFIX}%`]
    ),
  ]);

  const alreadyInvoiced = Number(alreadyRes.rows[0]?.count ?? 0);
  let generated = 0;
  let skipped = 0;
  const errors: Array<{ contractId: string; message: string }> = [];

  for (const row of parentsRes.rows) {
    const result = await createParentMonthlyInvoice(row.parent_id, schoolId, periodStart);
    if (!result.ok) {
      errors.push({ contractId: row.parent_id, message: result.message });
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
    eligible: parentsRes.rows.length,
    errors,
  };
}

/** Cron: tylko szkoły, których invoice_generation_day = dziś (Europe/Warsaw). */
export async function generateAllMonthlyInvoices(
  periodMonth: Date = new Date()
): Promise<MonthlyInvoiceBatchResult> {
  const generationDay = warsawCalendarDay(periodMonth);
  const periodStart = firstDayOfMonth(periodMonth);
  const periodMonthStr = periodMonthStartYmd(periodStart);

  const schoolsRes = await queryDb<{ id: string }>(
    `SELECT id
     FROM schools
     WHERE active = true
       AND invoice_auto_generation = true
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

export type CorrectiveInvoicePreviewResult =
  | {
      ok: true;
      html: string;
      invoiceNumber: string;
      originalInvoiceNumber: string;
    }
  | { ok: false; message: string; status: number };

type CorrectiveSourceInvoice = {
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
};

type CorrectiveDraft =
  | { ok: false; message: string; status: number }
  | {
      ok: true;
      original: CorrectiveSourceInvoice;
      reason: string;
      itemName: string;
      itemQty: string;
      itemDiscount: string;
      paymentDelta: number;
      issueDate: Date;
      saleDate: Date;
      issueDateStr: string;
      saleDateStr: string;
      dueDateStr: string;
      amountWords: string;
      provisionalInvoiceNumber: string;
      placeholders: ReturnType<typeof buildInvoicePlaceholders>;
    };

async function peekCorrectiveInvoiceNumber(
  schoolId: string,
  originalInvoiceId: string,
  originalInvoiceNumber: string
): Promise<string> {
  const countRes = await queryDb<{ count: string }>(
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

async function resolveCorrectiveDraft(
  input: CorrectiveInvoiceInput
): Promise<CorrectiveDraft> {
  const reason = String(input.correctionReason ?? "").trim();
  if (!reason) {
    return { ok: false, message: "Podaj powód korekty", status: 400 };
  }
  if (!Number.isFinite(input.amount) || !Number.isFinite(input.itemUnitPrice) || !Number.isFinite(input.itemValue)) {
    return { ok: false, message: "Nieprawidłowe kwoty korekty", status: 400 };
  }

  const originalRes = await queryDb<CorrectiveSourceInvoice>(
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
  const saleDateStr = input.saleDate?.slice(0, 10)
    ? input.saleDate.slice(0, 10)
    : resolveInvoiceSaleDateString({ issueDate });
  const saleDate = new Date(`${saleDateStr}T12:00:00`);
  const issueDateStr = toDateString(issueDate)!;
  const dueDateStr = input.dueDate?.slice(0, 10) || lastDayOfMonthDateString(issueDate);

  const itemName = String(input.itemName ?? "").trim() || original.item_name;
  const itemQty = String(input.itemQty ?? "").trim() || "1 szt";
  const itemDiscount = String(input.itemDiscount ?? "").trim() || "0 %";
  const amountWords = amountInWordsPln(input.amount);
  const provisionalInvoiceNumber = await peekCorrectiveInvoiceNumber(
    input.schoolId,
    original.id,
    original.invoice_number
  );

  const placeholders = buildInvoicePlaceholders({
    invoiceNumber: provisionalInvoiceNumber,
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

  return {
    ok: true,
    original,
    reason,
    itemName,
    itemQty,
    itemDiscount,
    paymentDelta,
    issueDate,
    saleDate,
    issueDateStr,
    saleDateStr,
    dueDateStr,
    amountWords,
    provisionalInvoiceNumber,
    placeholders,
  };
}

/** Podgląd HTML faktury korygującej bez zapisu / alokacji numeru. */
export async function previewCorrectiveInvoice(
  input: CorrectiveInvoiceInput
): Promise<CorrectiveInvoicePreviewResult> {
  try {
    const draft = await resolveCorrectiveDraft(input);
    if (!draft.ok) return draft;
    return {
      ok: true,
      html: renderInvoiceHtml(draft.placeholders),
      invoiceNumber: draft.provisionalInvoiceNumber,
      originalInvoiceNumber: draft.original.invoice_number,
    };
  } catch (error) {
    console.error("previewCorrectiveInvoice:", error);
    return {
      ok: false,
      message: "Nie udało się przygotować podglądu korekty",
      status: 500,
    };
  }
}

/** Wystawia fakturę korygującą (FK) względem faktury SALE. */
export async function createCorrectiveInvoice(
  input: CorrectiveInvoiceInput
): Promise<CorrectiveInvoiceResult> {
  const draft = await resolveCorrectiveDraft(input);
  if (!draft.ok) return draft;

  const {
    original,
    reason,
    itemName,
    itemQty,
    itemDiscount,
    paymentDelta,
    issueDate,
    issueDateStr,
    saleDateStr,
    dueDateStr,
    amountWords,
    placeholders,
  } = draft;

  try {
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

        if (await invoicesSupportInvoiceItems()) {
          await client.query(
            `INSERT INTO invoice_items (
               id, invoice_id, lp, name, qty, discount, unit_price, value,
               child_id, contract_id, created_at
             ) VALUES (
               $1, $2, 1, $3, $4, $5, $6, $7, $8, $9, NOW()
             )`,
            [
              randomUUID(),
              invoiceId,
              itemName,
              itemQty,
              itemDiscount,
              input.itemUnitPrice,
              input.itemValue,
              original.child_id,
              original.contract_id,
            ]
          );
        }

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
          source: "invoice.corrective",
        });
        await queryDb(`UPDATE invoices SET pdf_key = $2 WHERE id = $1`, [invoiceId, uploadedKey]);
      } catch (err) {
        if (uploadedKey) {
          try {
            await deleteR2Object(uploadedKey, { source: "invoice.orphan-cleanup" });
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
