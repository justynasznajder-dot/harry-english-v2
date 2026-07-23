import { NextRequest, NextResponse } from "next/server";

import { queryDb } from "@/lib/db";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { getR2ObjectBuffer } from "@/lib/r2-storage";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { id: paymentId } = await context.params;
  if (!paymentId) {
    return NextResponse.json({ message: "Brak identyfikatora płatności" }, { status: 400 });
  }

  const { parentId, schoolId } = auth.ctx;

  try {
    const res = await queryDb<{
      payment_id: string;
      invoice_number: string | null;
      pdf_key: string | null;
    }>(
      `SELECT i.payment_id, i.invoice_number, i.pdf_key
       FROM invoices i
       JOIN payments p ON p.id = i.payment_id
       WHERE i.payment_id = $1 AND p.parent_id = $2 AND p.school_id = $3
       LIMIT 1`,
      [paymentId, parentId, schoolId]
    );
    const invoice = res.rows[0];
    if (!invoice) {
      return NextResponse.json({ message: "Nie znaleziono faktury" }, { status: 404 });
    }
    if (!invoice.pdf_key) {
      return NextResponse.json({ message: "Brak pliku faktury" }, { status: 404 });
    }
    if (!invoice.pdf_key.startsWith(`${parentId}/`)) {
      return NextResponse.json({ message: "Brak dostępu do pliku" }, { status: 403 });
    }
    if (!invoice.pdf_key.includes("/faktury/") || !invoice.pdf_key.endsWith(".pdf")) {
      return NextResponse.json({ message: "Nieprawidłowy plik faktury" }, { status: 403 });
    }

    const { buffer, contentType } = await getR2ObjectBuffer(invoice.pdf_key, {
      source: "parent.payments.invoice",
    });
    const fallbackName = invoice.invoice_number
      ? `Faktura-${invoice.invoice_number.replace(/\//g, "-")}.pdf`
      : "faktura.pdf";
    const filename = invoice.pdf_key.split("/").pop() ?? fallbackName;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/parent/payments/[id]/invoice:", error);
    return NextResponse.json({ message: "Nie udało się pobrać faktury" }, { status: 500 });
  }
}
