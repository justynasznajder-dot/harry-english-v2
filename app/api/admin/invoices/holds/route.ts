import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  previewMonthlyInvoicesForSchool,
  setContractMonthlyInvoiceHold,
} from "@/lib/invoicing";
import { firstDayOfMonthUtcDate } from "@/lib/school-timezone";

function parsePeriodMonth(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Wstrzymaj / wznów / zleć wystawienie ręczne dla pozycji faktury ratalnej. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      contractId?: string;
      held?: boolean;
      manualIssue?: boolean;
      periodMonth?: string;
    };
    const contractId = String(body.contractId ?? "").trim();
    if (!contractId) {
      return NextResponse.json({ message: "Brak contractId" }, { status: 400 });
    }
    if (typeof body.held !== "boolean") {
      return NextResponse.json({ message: "Pole held musi być boolean" }, { status: 400 });
    }

    const manualIssue = body.manualIssue === true;
    if (manualIssue && !body.held) {
      return NextResponse.json(
        { message: "manualIssue wymaga held=true" },
        { status: 400 }
      );
    }

    const periodMonth = parsePeriodMonth(body.periodMonth) ?? firstDayOfMonthUtcDate();
    await setContractMonthlyInvoiceHold(ctx.schoolId, contractId, periodMonth, body.held, {
      manualIssue: manualIssue || undefined,
    });

    const preview = await previewMonthlyInvoicesForSchool(ctx.schoolId, periodMonth);

    let message: string;
    if (!body.held) {
      message = "Wznowiono generowanie faktury dla dziecka w tym miesiącu";
    } else if (manualIssue) {
      message = "Zlecono wystawienie ręczne — pozycja czeka na księgową";
    } else {
      message = "Wstrzymano generowanie faktury dla dziecka w tym miesiącu";
    }

    return NextResponse.json({
      message,
      held: body.held,
      manualIssue,
      ...preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd wstrzymania faktury";
    const status = message.includes("Nie znaleziono") ? 400 : 500;
    if (status === 500) {
      console.error("POST /api/admin/invoices/holds:", error);
    }
    return NextResponse.json({ message }, { status });
  }
}
