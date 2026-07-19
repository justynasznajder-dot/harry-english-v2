import { NextRequest, NextResponse } from "next/server";

import { generateAllMonthlyInvoices } from "@/lib/invoicing";

export const maxDuration = 120;

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Comiesięczne faktury ratalne — uruchamiane 10. dnia miesiąca (Vercel Cron). */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateAllMonthlyInvoices(new Date());
    return NextResponse.json({
      message: "Faktury ratalne wygenerowane",
      ...result,
    });
  } catch (error) {
    console.error("GET /api/cron/monthly-invoices:", error);
    return NextResponse.json({ message: "Błąd generowania faktur ratalnych" }, { status: 500 });
  }
}
