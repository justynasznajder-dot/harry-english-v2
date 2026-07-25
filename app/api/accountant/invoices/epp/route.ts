import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { queryDb } from "@/lib/db";
import {
  buildEppFileBuffer,
  eppFilename,
  type EppInvoiceInput,
} from "@/lib/epp";
import {
  invoicesSupportCorrectiveDocuments,
  invoicesSupportInvoiceItems,
} from "@/lib/invoice-schema";

export async function GET(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { searchParams } = new URL(request.url);
  const yearMonth = searchParams.get("yearMonth")?.trim() || "";
  const schoolYearId = searchParams.get("schoolYearId")?.trim() || "";
  const billingType = (searchParams.get("billingType") || "all").toLowerCase();

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { message: "Podaj yearMonth w formacie YYYY-MM" },
      { status: 400 }
    );
  }
  if (!schoolYearId) {
    return NextResponse.json({ message: "Podaj schoolYearId" }, { status: 400 });
  }
  if (!["all", "company", "private"].includes(billingType)) {
    return NextResponse.json({ message: "Nieprawidłowy billingType" }, { status: 400 });
  }

  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  const dateFrom = `${yearMonth}-01`;
  const dateTo = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

  const billingClause =
    billingType === "company"
      ? "AND i.buyer_nip IS NOT NULL AND btrim(i.buyer_nip) <> ''"
      : billingType === "private"
        ? "AND (i.buyer_nip IS NULL OR btrim(i.buyer_nip) = '')"
        : "";

  try {
    const hasCorrective = await invoicesSupportCorrectiveDocuments();
    const hasItems = await invoicesSupportInvoiceItems();
    const itemCountSelect = hasItems
      ? `COALESCE((SELECT COUNT(*)::int FROM invoice_items ii WHERE ii.invoice_id = i.id), 1) AS item_count`
      : `1 AS item_count`;
    const r = await queryDb<{
      invoice_number: string;
      document_type: string;
      original_invoice_number: string | null;
      issue_date: string;
      sale_date: string;
      due_date: string;
      buyer_name: string;
      buyer_address: string;
      buyer_nip: string | null;
      amount: string;
      payment_status: string | null;
      issue_place: string;
      seller_name: string;
      seller_address: string;
      seller_nip: string;
      issuer_name: string;
      client_number: string | null;
      buyer_email: string | null;
      item_count: number;
    }>(
      hasCorrective
        ? `SELECT
             i.invoice_number,
             COALESCE(i.document_type, 'SALE') AS document_type,
             orig.invoice_number AS original_invoice_number,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_address,
             i.buyer_nip,
             i.amount::text AS amount,
             p.status AS payment_status,
             i.issue_place,
             i.seller_name,
             i.seller_address,
             i.seller_nip,
             i.issuer_name,
             u.client_number,
             u.email AS buyer_email,
             ${itemCountSelect}
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           JOIN users u ON u.id = i.parent_id
           LEFT JOIN invoices orig ON orig.id = i.corrects_invoice_id
           WHERE i.school_id = $1
             AND i.school_year_id = $2
             AND i.issue_date >= $3::date
             AND i.issue_date <= $4::date
             ${billingClause}
           ORDER BY i.issue_date ASC, i.invoice_number ASC`
        : `SELECT
             i.invoice_number,
             'SALE'::text AS document_type,
             NULL::text AS original_invoice_number,
             i.issue_date::text,
             i.sale_date::text,
             i.due_date::text,
             i.buyer_name,
             i.buyer_address,
             i.buyer_nip,
             i.amount::text AS amount,
             p.status AS payment_status,
             i.issue_place,
             i.seller_name,
             i.seller_address,
             i.seller_nip,
             i.issuer_name,
             u.client_number,
             u.email AS buyer_email,
             ${itemCountSelect}
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           JOIN users u ON u.id = i.parent_id
           WHERE i.school_id = $1
             AND i.school_year_id = $2
             AND i.issue_date >= $3::date
             AND i.issue_date <= $4::date
             ${billingClause}
           ORDER BY i.issue_date ASC, i.invoice_number ASC`,
      [ctx.schoolId, schoolYearId, dateFrom, dateTo]
    );

    if (r.rows.length === 0) {
      return NextResponse.json(
        {
          message: `Brak faktur dla wybranego roku szkolnego i miesiąca ${yearMonth}`,
        },
        { status: 404 }
      );
    }

    const invoices: EppInvoiceInput[] = r.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      documentType: row.document_type,
      originalInvoiceNumber: row.original_invoice_number,
      issueDate: String(row.issue_date).slice(0, 10),
      saleDate: String(row.sale_date).slice(0, 10),
      dueDate: String(row.due_date).slice(0, 10),
      buyerCode: String(row.client_number ?? "").trim() || row.buyer_name.slice(0, 20),
      buyerName: row.buyer_name,
      buyerAddress: row.buyer_address,
      buyerNip: row.buyer_nip,
      buyerEmail: row.buyer_email,
      amount: Number(row.amount),
      itemCount: Number(row.item_count) || 1,
      paymentStatus: row.payment_status,
      issuePlace: row.issue_place,
      sellerName: row.seller_name,
      sellerAddress: row.seller_address,
      sellerNip: row.seller_nip,
      issuerName: row.issuer_name,
    }));

    const buffer = buildEppFileBuffer({
      yearMonth,
      invoices,
      generatedAt: new Date(),
      programName: "HarryEnglish",
    });
    const filename = eppFilename(yearMonth);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Invoice-Count": String(invoices.length),
      },
    });
  } catch (error) {
    console.error("GET /api/accountant/invoices/epp:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Nie udało się wygenerować pliku EPP";
    return NextResponse.json({ message }, { status: 500 });
  }
}
