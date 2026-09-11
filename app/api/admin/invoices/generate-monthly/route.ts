import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  INVOICE_MANUAL_GENERATE_DISABLED_MESSAGE,
  isInvoiceManualGenerateDisabled,
} from "@/lib/invoice-generate-guard";
import {
  generateMonthlyInvoicesForSchool,
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
    const result = await generateMonthlyInvoicesForSchool(ctx.schoolId, periodMonth, {
      contractIds,
      discountsByContractId,
    });

    return NextResponse.json({
      message: buildMonthlyInvoiceMessage(result),
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/invoices/generate-monthly:", error);
    return NextResponse.json({ message: "Błąd generowania faktur ratalnych" }, { status: 500 });
  }
}
