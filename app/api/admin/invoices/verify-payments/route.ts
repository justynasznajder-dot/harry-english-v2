import { NextRequest, NextResponse } from "next/server";

import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { verifyInvoicePaymentsFromBank } from "@/lib/bank-payment-verify";
import { isBankStatementsDriveConfigured } from "@/lib/google-drive";

export const maxDuration = 120;

function parseCalendarYear(body: { periodMonth?: string; calendarYear?: number }): number | null {
  if (typeof body.calendarYear === "number" && Number.isInteger(body.calendarYear)) {
    if (body.calendarYear >= 2000 && body.calendarYear <= 2100) return body.calendarYear;
  }
  const period = String(body.periodMonth ?? "").trim();
  const m = /^(\d{4})-\d{2}$/.exec(period);
  if (m) return Number(m[1]);
  return null;
}

function buildMessage(result: Awaited<ReturnType<typeof verifyInvoicePaymentsFromBank>>): string {
  const errors = result.importedFiles.filter((f) => f.error);
  const importedOk = result.importedFiles.filter((f) => !f.error && !f.skipped).length;
  const parts: string[] = [];

  if (importedOk > 0) {
    parts.push(
      `Zaimportowano ${importedOk} wyciąg${importedOk === 1 ? "" : importedOk < 5 ? "i" : "ów"} (${result.transfersImported} przelewów)`
    );
  } else if (result.importedFiles.every((f) => f.skipped) && result.importedFiles.length > 0) {
    parts.push("Brak nowych wyciągów do importu");
  } else if (result.importedFiles.length === 0) {
    parts.push("Brak plików CSV w folderze roku na Drive");
  }

  if (result.matched.length > 0) {
    parts.push(
      `oznaczono ${result.matched.length} płatność${result.matched.length === 1 ? "" : result.matched.length < 5 ? "i" : "i"} jako opłaconą`
    );
  } else {
    parts.push("brak nowych dopasowań płatności");
  }

  if (errors.length > 0) {
    parts.push(`${errors.length} plik(ów) z błędem`);
  }

  return parts.join(" — ");
}

/** Import wyciągów z Google Drive (folder roku) + weryfikacja płatności faktur. */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  if (!isBankStatementsDriveConfigured()) {
    return NextResponse.json(
      {
        message:
          "Google Drive nie jest skonfigurowany. Ustaw GOOGLE_SERVICE_ACCOUNT_EMAIL i GOOGLE_PRIVATE_KEY (oraz udostępnij folder wyciągów service accountowi).",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      periodMonth?: string;
      calendarYear?: number;
    };
    const calendarYear = parseCalendarYear(body);
    if (calendarYear == null) {
      return NextResponse.json(
        { message: "Podaj periodMonth (YYYY-MM) lub calendarYear — wskazuje folder roku na Drive." },
        { status: 400 }
      );
    }

    const result = await verifyInvoicePaymentsFromBank(ctx.schoolId, { calendarYear });
    return NextResponse.json({
      message: buildMessage(result),
      calendarYear,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/invoices/verify-payments:", error);
    const msg = error instanceof Error ? error.message : "Błąd weryfikacji płatności";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
