import { NextRequest, NextResponse } from "next/server";
import { fetchParentPayments } from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { isComplimentaryForParent } from "@/lib/school-discounts";
import { getUserById } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    const user = await getUserById(parentId);
    const complimentary = user
      ? await isComplimentaryForParent(schoolId, {
          parentId: user.id,
          parentEmail: user.email,
        })
      : false;

    if (complimentary) {
      return NextResponse.json({ complimentaryAccess: true, payments: [] });
    }

    const payments = await fetchParentPayments(parentId, schoolId);

    return NextResponse.json({
      complimentaryAccess: false,
      payments: payments.map((p) => ({
        id: p.id,
        childId: p.childId,
        childName: p.childName,
        amount: p.amount,
        status: p.status,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        periodMonth: p.periodMonth,
        description: p.description,
        paymentType: p.paymentType,
        source: p.source,
        billingPeriodStatus: p.billingPeriodStatus,
      })),
    });
  } catch (error) {
    console.error("GET /api/parent/payments:", error);
    return NextResponse.json({ message: "Błąd pobierania płatności" }, { status: 500 });
  }
}
