import { NextRequest, NextResponse } from "next/server";
import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import { invoicesSupportCorrectiveDocuments } from "@/lib/invoice-schema";
import { previewCorrectiveInvoice } from "@/lib/invoicing";

export async function POST(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  if (!(await invoicesSupportCorrectiveDocuments())) {
    return NextResponse.json(
      {
        message:
          "Faktury korygujące wymagają migracji bazy (accountant_corrective_invoices). Skontaktuj się z administratorem.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const originalInvoiceId = String(body.originalInvoiceId ?? "").trim();
    const correctionReason = String(body.correctionReason ?? "").trim();
    const itemName = String(body.itemName ?? "").trim();
    const itemQty = String(body.itemQty ?? "1 szt").trim() || "1 szt";
    const itemDiscount = String(body.itemDiscount ?? "0 %").trim() || "0 %";
    const itemUnitPrice = Number(body.itemUnitPrice);
    const itemValue = Number(body.itemValue ?? body.amount);
    const amount = Number(body.amount ?? body.itemValue);

    if (!originalInvoiceId) {
      return NextResponse.json({ message: "Brak faktury źródłowej" }, { status: 400 });
    }
    if (!correctionReason) {
      return NextResponse.json({ message: "Podaj powód korekty" }, { status: 400 });
    }
    if (!Number.isFinite(itemUnitPrice) || !Number.isFinite(itemValue) || !Number.isFinite(amount)) {
      return NextResponse.json({ message: "Nieprawidłowe kwoty" }, { status: 400 });
    }

    const result = await previewCorrectiveInvoice({
      schoolId: ctx.schoolId,
      originalInvoiceId,
      correctionReason,
      itemName,
      itemQty,
      itemDiscount,
      itemUnitPrice,
      itemValue,
      amount,
      issueDate: body.issueDate ? String(body.issueDate).slice(0, 10) : undefined,
      saleDate: body.saleDate ? String(body.saleDate).slice(0, 10) : undefined,
      dueDate: body.dueDate ? String(body.dueDate).slice(0, 10) : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      html: result.html,
      invoiceNumber: result.invoiceNumber,
      originalInvoiceNumber: result.originalInvoiceNumber,
    });
  } catch (error) {
    console.error("POST /api/accountant/invoices/corrective/preview:", error);
    return NextResponse.json(
      { message: "Nie udało się przygotować podglądu korekty" },
      { status: 500 }
    );
  }
}
