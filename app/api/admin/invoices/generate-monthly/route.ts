import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { generateMonthlyInvoicesForSchool } from "@/lib/invoicing";

export const maxDuration = 120;

function buildMonthlyInvoiceMessage(result: {
  generated: number;
  skipped: number;
  alreadyInvoiced: number;
  errors: unknown[];
}): string {
  if (result.generated > 0) {
    return `Wygenerowano ${result.generated} faktur ratalnych (już było: ${result.alreadyInvoiced}, pominięto: ${result.skipped})`;
  }
  if (result.alreadyInvoiced > 0) {
    return `Brak nowych faktur — ${result.alreadyInvoiced} umów ratalnych ma już fakturę za ten miesiąc`;
  }
  if (result.errors.length > 0) {
    return `Nie wygenerowano faktur (${result.errors.length} błędów)`;
  }
  return "Brak umów ratalnych do zafakturowania w tym miesiącu";
}

/** Ręczne generowanie faktur ratalnych (MONTHLY) dla szkoły — do testów / poza dniem crona. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const result = await generateMonthlyInvoicesForSchool(ctx.schoolId, new Date());

    return NextResponse.json({
      message: buildMonthlyInvoiceMessage(result),
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/invoices/generate-monthly:", error);
    return NextResponse.json({ message: "Błąd generowania faktur ratalnych" }, { status: 500 });
  }
}
