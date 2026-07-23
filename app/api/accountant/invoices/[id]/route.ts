import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { queryDb } from "@/lib/db";
import { invoicesSupportCorrectiveDocuments } from "@/lib/invoice-schema";
import { getR2ObjectBuffer } from "@/lib/r2-storage";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "Brak identyfikatora faktury" }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") || "json";

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
      buyer_address: string;
      buyer_nip: string | null;
      item_name: string;
      item_qty: string;
      item_discount: string;
      item_unit_price: string;
      item_value: string;
      amount: string;
      payment_status: string | null;
      pdf_key: string | null;
      parent_id: string;
      content_html: string;
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
             i.buyer_address,
             i.buyer_nip,
             i.item_name,
             i.item_qty,
             i.item_discount,
             i.item_unit_price::text,
             i.item_value::text,
             i.amount::text,
             p.status AS payment_status,
             i.pdf_key,
             i.parent_id,
             i.content_html,
             orig.invoice_number AS original_invoice_number
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           LEFT JOIN invoices orig ON orig.id = i.corrects_invoice_id
           WHERE i.id = $1 AND i.school_id = $2
           LIMIT 1`
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
             i.buyer_address,
             i.buyer_nip,
             i.item_name,
             i.item_qty,
             i.item_discount,
             i.item_unit_price::text,
             i.item_value::text,
             i.amount::text,
             p.status AS payment_status,
             i.pdf_key,
             i.parent_id,
             i.content_html,
             NULL::text AS original_invoice_number
           FROM invoices i
           JOIN payments p ON p.id = i.payment_id
           WHERE i.id = $1 AND i.school_id = $2
           LIMIT 1`,
      [id, ctx.schoolId]
    );
    const invoice = r.rows[0];
    if (!invoice) {
      return NextResponse.json({ message: "Nie znaleziono faktury" }, { status: 404 });
    }

    if (format === "pdf") {
      if (!invoice.pdf_key) {
        return NextResponse.json({ message: "Brak pliku faktury" }, { status: 404 });
      }
      if (
        !invoice.pdf_key.startsWith(`${invoice.parent_id}/`) ||
        !invoice.pdf_key.includes("/faktury/") ||
        !invoice.pdf_key.endsWith(".pdf")
      ) {
        return NextResponse.json({ message: "Brak dostępu do pliku" }, { status: 403 });
      }
      const { buffer, contentType } = await getR2ObjectBuffer(invoice.pdf_key, {
        source: "accountant.invoice.pdf",
      });
      const filename = invoice.pdf_key.split("/").pop() ?? `Faktura-${invoice.invoice_number}.pdf`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        paymentId: invoice.payment_id,
        invoiceNumber: invoice.invoice_number,
        documentType: invoice.document_type,
        correctsInvoiceId: invoice.corrects_invoice_id,
        correctionReason: invoice.correction_reason,
        originalInvoiceNumber: invoice.original_invoice_number,
        issueDate: String(invoice.issue_date).slice(0, 10),
        saleDate: String(invoice.sale_date).slice(0, 10),
        dueDate: String(invoice.due_date).slice(0, 10),
        buyerName: invoice.buyer_name,
        buyerAddress: invoice.buyer_address,
        buyerNip: invoice.buyer_nip,
        itemName: invoice.item_name,
        itemQty: invoice.item_qty,
        itemDiscount: invoice.item_discount,
        itemUnitPrice: Number(invoice.item_unit_price),
        itemValue: Number(invoice.item_value),
        amount: Number(invoice.amount),
        paymentStatus: invoice.payment_status,
        hasPdf: Boolean(invoice.pdf_key),
        contentHtml: invoice.content_html,
      },
    });
  } catch (error) {
    console.error("GET /api/accountant/invoices/[id]:", error);
    return NextResponse.json({ message: "Błąd pobierania faktury" }, { status: 500 });
  }
}
