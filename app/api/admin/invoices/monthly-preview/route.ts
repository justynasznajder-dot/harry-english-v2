import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { previewMonthlyInvoicesForSchool } from "@/lib/invoicing";

function parsePeriodMonth(value: string | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Podgląd kwot faktur ratalnych na wybrany miesiąc (bez wystawiania). */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const periodMonth =
    parsePeriodMonth(request.nextUrl.searchParams.get("periodMonth")) ?? new Date();

  try {
    const result = await previewMonthlyInvoicesForSchool(ctx.schoolId, periodMonth);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/invoices/monthly-preview:", error);
    return NextResponse.json({ message: "Błąd podglądu faktur ratalnych" }, { status: 500 });
  }
}
