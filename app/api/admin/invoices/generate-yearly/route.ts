import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  INVOICE_MANUAL_GENERATE_DISABLED_MESSAGE,
  isInvoiceManualGenerateDisabled,
} from "@/lib/invoice-generate-guard";
import {
  generateYearlyInvoicesForSchool,
  parseDiscountsByContractId,
} from "@/lib/invoicing";
import { firstDayOfMonthUtcDate } from "@/lib/school-timezone";

export const maxDuration = 120;

function parsePeriodMonth(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function buildYearlyInvoiceMessage(result: {
  generated: number;
  skipped: number;
  alreadyInvoiced: number;
  errors: unknown[];
}): string {
  if (result.generated > 0) {
    return `Wygenerowano ${result.generated} faktur jednorazowych (już było: ${result.alreadyInvoiced}, pominięto: ${result.skipped})`;
  }
  if (result.alreadyInvoiced > 0) {
    return `Brak nowych faktur — ${result.alreadyInvoiced} umów jednorazowych ma już fakturę`;
  }
  if (result.errors.length > 0) {
    return `Nie wygenerowano faktur (${result.errors.length} błędów)`;
  }
  return "Brak umów jednorazowych do zafakturowania w tym miesiącu";
}

/** Ręczne generowanie faktur jednorazowych (YEARLY) dla szkoły. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  if (isInvoiceManualGenerateDisabled(ctx.schoolId)) {
    return NextResponse.json(
      { message: INVOICE_MANUAL_GENERATE_DISABLED_MESSAGE },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      periodMonth?: string;
      contractIds?: unknown;
      discountsByContractId?: unknown;
    };
    const periodMonth = parsePeriodMonth(body.periodMonth) ?? firstDayOfMonthUtcDate();
    const contractIds = Array.isArray(body.contractIds)
      ? body.contractIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : null;
    if (contractIds && contractIds.length === 0) {
      return NextResponse.json(
        { message: "Zaznacz co najmniej jedną fakturę do wygenerowania" },
        { status: 400 }
      );
    }
    const discountsByContractId = parseDiscountsByContractId(body.discountsByContractId);
    const result = await generateYearlyInvoicesForSchool(ctx.schoolId, periodMonth, {
      contractIds,
      discountsByContractId,
    });

    return NextResponse.json({
      message: buildYearlyInvoiceMessage(result),
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/invoices/generate-yearly:", error);
    return NextResponse.json(
      { message: "Błąd generowania faktur jednorazowych" },
      { status: 500 }
    );
  }
}
