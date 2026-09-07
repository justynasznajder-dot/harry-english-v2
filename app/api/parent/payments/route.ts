import { NextRequest, NextResponse } from "next/server";
import {
  fetchComplimentaryParentPaymentOverview,
  fetchParentPaymentOverview,
  fetchParentPayments,
} from "@/lib/parent-portal";
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
      const overview = await fetchComplimentaryParentPaymentOverview(parentId, schoolId);
      const schoolYearsMap = new Map<
        string,
        { id: string; name: string; active: boolean; dateFrom: string | null }
      >();
      for (const child of overview.children) {
        if (!child.schoolYearId || !child.schoolYearName) continue;
        if (schoolYearsMap.has(child.schoolYearId)) continue;
        schoolYearsMap.set(child.schoolYearId, {
          id: child.schoolYearId,
          name: child.schoolYearName,
          active: true,
          dateFrom: child.schoolYearDateFrom,
        });
      }
      const schoolYears = Array.from(schoolYearsMap.values()).sort((a, b) =>
        String(b.dateFrom ?? "").localeCompare(String(a.dateFrom ?? ""), "pl")
      );

      return NextResponse.json({
        complimentaryAccess: true,
        schoolYears,
        payments: [],
        overview,
      });
    }

    const [payments, overview] = await Promise.all([
      fetchParentPayments(parentId, schoolId),
      fetchParentPaymentOverview(parentId, schoolId),
    ]);

    const schoolYearsMap = new Map<
      string,
      { id: string; name: string; active: boolean; dateFrom: string | null }
    >();
    for (const p of payments) {
      if (!p.schoolYearId || !p.schoolYearName) continue;
      if (schoolYearsMap.has(p.schoolYearId)) continue;
      schoolYearsMap.set(p.schoolYearId, {
        id: p.schoolYearId,
        name: p.schoolYearName,
        active: p.schoolYearActive,
        dateFrom: p.schoolYearDateFrom,
      });
    }
    for (const child of overview.children) {
      if (!child.schoolYearId || !child.schoolYearName) continue;
      if (schoolYearsMap.has(child.schoolYearId)) continue;
      schoolYearsMap.set(child.schoolYearId, {
        id: child.schoolYearId,
        name: child.schoolYearName,
        active: true,
        dateFrom: child.schoolYearDateFrom,
      });
    }
    const schoolYears = Array.from(schoolYearsMap.values()).sort((a, b) =>
      String(b.dateFrom ?? "").localeCompare(String(a.dateFrom ?? ""), "pl")
    );

    return NextResponse.json({
      complimentaryAccess: false,
      schoolYears,
      overview,
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
        invoiceNumber: p.invoiceNumber,
        hasInvoicePdf: p.hasInvoicePdf,
        schoolYearId: p.schoolYearId,
        schoolYearName: p.schoolYearName,
        schoolYearActive: p.schoolYearActive,
      })),
    });
  } catch (error) {
    console.error("GET /api/parent/payments:", error);
    return NextResponse.json({ message: "Błąd pobierania płatności" }, { status: 500 });
  }
}
