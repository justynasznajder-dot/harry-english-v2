import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { queryDb } from "@/lib/db";
import { invoicesSupportCorrectiveDocuments } from "@/lib/invoice-schema";

export async function GET(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { searchParams } = new URL(request.url);
  const schoolYearId = searchParams.get("schoolYearId")?.trim() || null;
  const billingType = (searchParams.get("billingType") || "all").toLowerCase();
  const yearMonth = searchParams.get("yearMonth")?.trim() || "";

  if (!schoolYearId) {
    return NextResponse.json({ message: "Podaj schoolYearId" }, { status: 400 });
  }
  if (!["all", "company", "private"].includes(billingType)) {
    return NextResponse.json({ message: "Nieprawidłowy billingType" }, { status: 400 });
  }
  if (yearMonth && !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { message: "Nieprawidłowy yearMonth (YYYY-MM)" },
      { status: 400 }
    );
  }

  const billingClause =
    billingType === "company"
      ? "AND i.buyer_nip IS NOT NULL AND btrim(i.buyer_nip) <> ''"
      : billingType === "private"
        ? "AND (i.buyer_nip IS NULL OR btrim(i.buyer_nip) = '')"
        : "";

  const queryParams: string[] = [ctx.schoolId, schoolYearId];
  let monthClause = "";
  if (yearMonth) {
    const year = Number(yearMonth.slice(0, 4));
    const month = Number(yearMonth.slice(5, 7));
    const lastDay = new Date(year, month, 0).getDate();
    const dateFrom = `${yearMonth}-01`;
    const dateTo = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
    monthClause = `AND i.issue_date >= $3::date AND i.issue_date <= $4::date`;
    queryParams.push(dateFrom, dateTo);
  }

  try {
    const hasCorrective = await invoicesSupportCorrectiveDocuments();
    const r = await queryDb<{
      id: string;
      payment_id: string;
      invoice_number: string;
      document_type: string;
      corrects_invoice_id: string | null;
      correction_reason: string | null;
      issue_date: string;
      sale_date: string;
      due_date: string;
      buyer_name: string;
      buyer_nip: string | null;
      amount: string;
      item_name: string;
      payment_status: string | null;
      pdf_key: string | null;
      original_invoice_number: string | null;
    }>(
      hasCorrective
        ? `SELECT
             i.id,
             i.payment_id,
             i.invoice_number,
             COALESCE(i.document_type, 'SALE') AS document_type,
             i.corrects_invoice_id,
             i.correction_reason,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_nip,
             i.amount::text AS amount,
             i.item_name,
             p.status AS payment_status,
             i.pdf_key,
             orig.invoice_number AS original_invoice_number
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           LEFT JOIN invoices orig ON orig.id = i.corrects_invoice_id
           WHERE i.school_id = $1
             AND i.school_year_id = $2
             ${billingClause}
             ${monthClause}
           ORDER BY i.issue_date DESC, i.created_at DESC`
        : `SELECT
             i.id,
             i.payment_id,
             i.invoice_number,
             'SALE'::text AS document_type,
             NULL::text AS corrects_invoice_id,
             NULL::text AS correction_reason,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_nip,
             i.amount::text AS amount,
             i.item_name,
             p.status AS payment_status,
             i.pdf_key,
             NULL::text AS original_invoice_number
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           WHERE i.school_id = $1
             AND i.school_year_id = $2
             ${billingClause}
             ${monthClause}
           ORDER BY i.issue_date DESC, i.created_at DESC`,
      queryParams
    );

    const invoices = r.rows.map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      invoiceNumber: row.invoice_number,
      documentType: row.document_type,
      correctsInvoiceId: row.corrects_invoice_id,
      correctionReason: row.correction_reason,
      originalInvoiceNumber: row.original_invoice_number,
      issueDate: String(row.issue_date).slice(0, 10),
      saleDate: String(row.sale_date).slice(0, 10),
      dueDate: String(row.due_date).slice(0, 10),
      buyerName: row.buyer_name,
      buyerNip: row.buyer_nip,
      billingType:
        row.buyer_nip && String(row.buyer_nip).trim() !== "" ? "company" : "private",
      amount: Number(row.amount),
      itemName: row.item_name,
      paymentStatus: row.payment_status,
      hasPdf: Boolean(row.pdf_key),
    }));

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("GET /api/accountant/invoices:", error);
    return NextResponse.json({ message: "Błąd pobierania faktur" }, { status: 500 });
  }
}
