import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { queryDb } from "@/lib/db";
import {
  INVOICE_DESC_LESSON_PREFIX,
  INVOICE_DESC_MONTHLY_PREFIX,
  INVOICE_DESC_YEARLY_PREFIX,
} from "@/lib/invoicing";
import { invoicesSupportCorrectiveDocuments } from "@/lib/invoice-schema";

function parsePeriodMonth(value: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return `${raw}-01`;
}

/** Lista wystawionych faktur szkoły (filtrowana po miesiącu rozliczeniowym). */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const periodMonthStr =
    parsePeriodMonth(request.nextUrl.searchParams.get("periodMonth")) ??
    (() => {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    })();

  try {
    const hasCorrective = await invoicesSupportCorrectiveDocuments();
    const r = await queryDb<{
      id: string;
      payment_id: string;
      invoice_number: string;
      document_type: string;
      issue_date: string;
      sale_date: string;
      due_date: string;
      buyer_name: string;
      buyer_nip: string | null;
      amount: string;
      item_name: string;
      payment_status: string | null;
      period_month: string | null;
      description: string | null;
      pdf_key: string | null;
      parent_email: string | null;
      parent_first_name: string | null;
      parent_last_name: string | null;
    }>(
      hasCorrective
        ? `SELECT
             i.id,
             i.payment_id,
             i.invoice_number,
             COALESCE(i.document_type, 'SALE') AS document_type,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_nip,
             i.amount::text AS amount,
             i.item_name,
             p.status AS payment_status,
             p.period_month::text,
             p.description,
             i.pdf_key,
             u.email AS parent_email,
             u.first_name AS parent_first_name,
             u.last_name AS parent_last_name
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           LEFT JOIN users u ON u.id = i.parent_id
           WHERE i.school_id = $1
             AND p.period_month = $2::date
           ORDER BY i.issue_date DESC, i.created_at DESC`
        : `SELECT
             i.id,
             i.payment_id,
             i.invoice_number,
             'SALE'::text AS document_type,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_nip,
             i.amount::text AS amount,
             i.item_name,
             p.status AS payment_status,
             p.period_month::text,
             p.description,
             i.pdf_key,
             u.email AS parent_email,
             u.first_name AS parent_first_name,
             u.last_name AS parent_last_name
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           LEFT JOIN users u ON u.id = i.parent_id
           WHERE i.school_id = $1
             AND p.period_month = $2::date
           ORDER BY i.issue_date DESC, i.created_at DESC`,
      [ctx.schoolId, periodMonthStr]
    );

    const invoices = r.rows.map((row) => {
      const description = String(row.description ?? "");
      const kind = description.startsWith(INVOICE_DESC_MONTHLY_PREFIX)
        ? "MONTHLY"
        : description.startsWith(INVOICE_DESC_YEARLY_PREFIX)
          ? "YEARLY"
          : description.startsWith(INVOICE_DESC_LESSON_PREFIX)
            ? "PER_LESSON"
            : "OTHER";
      return {
        id: row.id,
        paymentId: row.payment_id,
        invoiceNumber: row.invoice_number,
        documentType: row.document_type,
        issueDate: String(row.issue_date).slice(0, 10),
        saleDate: String(row.sale_date).slice(0, 10),
        dueDate: String(row.due_date).slice(0, 10),
        buyerName: row.buyer_name,
        buyerNip: row.buyer_nip,
        amount: Number(row.amount),
        itemName: row.item_name,
        paymentStatus: row.payment_status,
        periodMonth: row.period_month ? String(row.period_month).slice(0, 7) : null,
        kind,
        hasPdf: Boolean(row.pdf_key),
        parentEmail: row.parent_email,
        parentName: `${row.parent_first_name ?? ""} ${row.parent_last_name ?? ""}`.trim(),
      };
    });

    return NextResponse.json({
      periodMonth: periodMonthStr.slice(0, 7),
      invoices,
    });
  } catch (error) {
    console.error("GET /api/admin/invoices:", error);
    return NextResponse.json({ message: "Błąd pobierania faktur" }, { status: 500 });
  }
}
