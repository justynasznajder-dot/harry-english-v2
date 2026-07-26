import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { manualMatchTransferToPayment } from "@/lib/bank-payment-verify";

/** Ręczne przypisanie przelewu do faktury i oznaczenie płatności jako PAID. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      transferId?: string;
      paymentId?: string;
    };
    const transferId = String(body.transferId ?? "").trim();
    const paymentId = String(body.paymentId ?? "").trim();
    if (!transferId || !paymentId) {
      return NextResponse.json(
        { message: "Wymagane: transferId oraz paymentId." },
        { status: 400 }
      );
    }

    const result = await manualMatchTransferToPayment({
      schoolId: ctx.schoolId,
      transferId,
      paymentId,
    });

    return NextResponse.json({
      message: `Faktura ${result.invoiceNumber} oznaczona jako opłacona`,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/invoices/manual-match:", error);
    const msg = error instanceof Error ? error.message : "Błąd ręcznego przypisania";
    const status =
      msg.includes("Nie znaleziono") || msg.includes("już") || msg.includes("anulowanej")
        ? 400
        : 500;
    return NextResponse.json({ message: msg }, { status });
  }
}
