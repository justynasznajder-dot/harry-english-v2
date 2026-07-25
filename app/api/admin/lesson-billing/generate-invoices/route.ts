import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { generateLessonBillingInvoicesForSchool } from "@/lib/invoicing";
import { firstDayOfMonthUtcDate } from "@/lib/school-timezone";

export const maxDuration = 120;

function parsePeriodMonth(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function buildMessage(result: {
  generated: number;
  alreadyInvoiced: number;
  eligible: number;
  errors: unknown[];
}): string {
  if (result.generated > 0) {
    return `Wygenerowano ${result.generated} faktur za zajęcia (już było: ${result.alreadyInvoiced})`;
  }
  if (result.alreadyInvoiced > 0) {
    return `Brak nowych faktur — ${result.alreadyInvoiced} rozliczeń ma już fakturę`;
  }
  if (result.errors.length > 0) {
    return `Nie wygenerowano faktur (${result.errors.length} błędów)`;
  }
  if (result.eligible === 0) {
    return "Brak zapisanych rozliczeń do zafakturowania w tym miesiącu";
  }
  return "Brak faktur do wygenerowania";
}

/** Zbiorcze generowanie faktur za pojedyncze zajęcia dla miesiąca. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { periodMonth?: string };
    const periodMonth = parsePeriodMonth(body.periodMonth) ?? firstDayOfMonthUtcDate();
    const result = await generateLessonBillingInvoicesForSchool(ctx.schoolId, periodMonth);

    return NextResponse.json({
      message: buildMessage(result),
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/lesson-billing/generate-invoices:", error);
    return NextResponse.json(
      { message: "Błąd generowania faktur za zajęcia" },
      { status: 500 }
    );
  }
}
