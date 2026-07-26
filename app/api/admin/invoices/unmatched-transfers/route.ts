import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  listPendingInvoicesForManualMatch,
  listUnmatchedTransfersWithoutClientRef,
} from "@/lib/bank-payment-verify";

/** Przelewy bez nr klienta/umowy w tytule + lista faktur do ręcznego przypisania. */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const [transfers, pendingInvoices] = await Promise.all([
      listUnmatchedTransfersWithoutClientRef(ctx.schoolId),
      listPendingInvoicesForManualMatch(ctx.schoolId),
    ]);
    return NextResponse.json({ transfers, pendingInvoices });
  } catch (error) {
    console.error("GET /api/admin/invoices/unmatched-transfers:", error);
    return NextResponse.json({ message: "Błąd pobierania przelewów" }, { status: 500 });
  }
}
