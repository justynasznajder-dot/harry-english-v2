import { NextRequest, NextResponse } from "next/server";

import { requireAccountantSchoolContext } from "@/lib/accountant-school-context";
import {
  createParentMonthlyInvoice,
  isContractMonthlyInvoiceHeld,
  previewMonthlyInvoicesForSchool,
} from "@/lib/invoicing";
import { firstDayOfMonthUtcDate } from "@/lib/school-timezone";
import { queryDb } from "@/lib/db";

function parsePeriodMonth(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Podgląd faktur wstrzymanych przez managera (miesiąc rozliczeniowy). */
export async function GET(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const periodMonth =
    parsePeriodMonth(request.nextUrl.searchParams.get("periodMonth")) ??
    firstDayOfMonthUtcDate();

  try {
    const preview = await previewMonthlyInvoicesForSchool(ctx.schoolId, periodMonth);
    return NextResponse.json({
      periodMonth: preview.periodMonth,
      dueDate: preview.dueDate,
      heldParents: preview.heldParents,
    });
  } catch (error) {
    console.error("GET /api/accountant/invoices/held:", error);
    return NextResponse.json({ message: "Błąd podglądu wstrzymanych faktur" }, { status: 500 });
  }
}

/** Ręczne wystawienie faktury ratalnej dla wstrzymanej umowy (dziecka). */
export async function POST(request: NextRequest) {
  const ctx = await requireAccountantSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      contractId?: string;
      parentId?: string;
      periodMonth?: string;
    };
    const contractId = String(body.contractId ?? "").trim();
    if (!contractId) {
      return NextResponse.json({ message: "Brak contractId" }, { status: 400 });
    }

    const periodMonth = parsePeriodMonth(body.periodMonth) ?? firstDayOfMonthUtcDate();

    const contractRes = await queryDb<{ id: string; parent_id: string }>(
      `SELECT id, parent_id
       FROM contracts
       WHERE id = $1 AND school_id = $2
       LIMIT 1`,
      [contractId, ctx.schoolId]
    );
    const contract = contractRes.rows[0];
    if (!contract) {
      return NextResponse.json({ message: "Nie znaleziono umowy" }, { status: 404 });
    }

    if (!(await isContractMonthlyInvoiceHeld(ctx.schoolId, contractId, periodMonth))) {
      return NextResponse.json(
        { message: "Ta umowa nie ma wstrzymanego generowania faktury w tym miesiącu" },
        { status: 409 }
      );
    }

    const result = await createParentMonthlyInvoice(
      contract.parent_id,
      ctx.schoolId,
      periodMonth,
      { onlyContractIds: [contractId] }
    );

    if (!result.ok) {
      return NextResponse.json(
        { message: result.message },
        { status: result.status ?? 400 }
      );
    }

    const preview = await previewMonthlyInvoicesForSchool(ctx.schoolId, periodMonth);

    return NextResponse.json({
      message: result.created
        ? "Wystawiono fakturę ręcznie"
        : "Faktura była już wystawiona",
      created: result.created,
      paymentId: result.paymentId,
      periodMonth: preview.periodMonth,
      dueDate: preview.dueDate,
      heldParents: preview.heldParents,
    });
  } catch (error) {
    console.error("POST /api/accountant/invoices/held:", error);
    return NextResponse.json({ message: "Błąd ręcznego wystawiania faktury" }, { status: 500 });
  }
}
