import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { queryDb } from "@/lib/db";
import { getR2ObjectBuffer } from "@/lib/r2-storage";

/** Pobranie PDF wystawionej faktury (admin / manager). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "Brak identyfikatora faktury" }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format") || "pdf";
  if (format !== "pdf") {
    return NextResponse.json({ message: "Obsługiwany jest tylko format=pdf" }, { status: 400 });
  }

  try {
    const r = await queryDb<{
      id: string;
      invoice_number: string;
      parent_id: string;
      pdf_key: string | null;
    }>(
      `SELECT id, invoice_number, parent_id, pdf_key
       FROM invoices
       WHERE id = $1 AND school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    const invoice = r.rows[0];
    if (!invoice) {
      return NextResponse.json({ message: "Nie znaleziono faktury" }, { status: 404 });
    }
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
      source: "admin.invoice.pdf",
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
  } catch (error) {
    console.error("GET /api/admin/invoices/[id]:", error);
    return NextResponse.json({ message: "Błąd pobierania faktury" }, { status: 500 });
  }
}
