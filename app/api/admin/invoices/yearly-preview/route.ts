import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { previewYearlyInvoicesForSchool } from "@/lib/invoicing";
import { firstDayOfMonthUtcDate } from "@/lib/school-timezone";

function parsePeriodMonth(value: string | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Podgląd płatności jednorazowych (YEARLY) na wybrany miesiąc (bez wystawiania). */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const periodMonth =
    parsePeriodMonth(request.nextUrl.searchParams.get("periodMonth")) ??
    firstDayOfMonthUtcDate();

  try {
    const result = await previewYearlyInvoicesForSchool(ctx.schoolId, periodMonth);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/invoices/yearly-preview:", error);
    return NextResponse.json(
      { message: "Błąd podglądu płatności jednorazowych" },
      { status: 500 }
    );
  }
}
