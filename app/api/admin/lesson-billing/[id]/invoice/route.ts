import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { createLessonBillingInvoice } from "@/lib/invoicing";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: billingId } = await params;

  try {
    const billingRes = await queryDb<{ school_id: string }>(
      `SELECT school_id FROM lesson_billing_periods WHERE id = $1 LIMIT 1`,
      [billingId]
    );

    const billing = billingRes.rows[0];
    if (!billing) {
      return NextResponse.json({ message: "Nie znaleziono rozliczenia" }, { status: 404 });
    }

    if (ctx.tenant.role === "MANAGER" && billing.school_id !== ctx.schoolId) {
      return NextResponse.json({ message: "Brak dostępu do rozliczenia" }, { status: 403 });
    }

    const result = await createLessonBillingInvoice(billingId);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      message: result.created ? "Faktura wygenerowana i wysłana mailem" : "Faktura została już wygenerowana",
      paymentId: result.paymentId,
      billingId: result.billingId ?? billingId,
      created: result.created,
    });
  } catch (error) {
    console.error("POST /api/admin/lesson-billing/[id]/invoice:", error);
    return NextResponse.json({ message: "Błąd generowania faktury" }, { status: 500 });
  }
}
