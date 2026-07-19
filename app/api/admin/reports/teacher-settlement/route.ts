import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  fetchTeacherSettlement,
  getSchoolYearScope,
  summarizeTeacherRows,
} from "@/lib/settlement-reports";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const schoolYearId = request.nextUrl.searchParams.get("school_year_id")?.trim();
  const periodMonth = request.nextUrl.searchParams.get("period_month")?.trim();

  if (!schoolYearId) {
    return NextResponse.json({ message: "Brak parametru school_year_id" }, { status: 400 });
  }
  if (periodMonth && !/^\d{4}-\d{2}$/.test(periodMonth)) {
    return NextResponse.json({ message: "period_month musi być w formacie YYYY-MM" }, { status: 400 });
  }

  try {
    const schoolId = ctx.tenant.role === "MANAGER" ? ctx.schoolId : null;
    const year = await getSchoolYearScope(schoolYearId, schoolId);
    if (!year) {
      return NextResponse.json({ message: "Nie znaleziono roku szkolnego" }, { status: 404 });
    }

    const rows = await fetchTeacherSettlement(year, periodMonth || undefined);

    return NextResponse.json({
      year: {
        id: year.id,
        name: year.name,
        date_from: String(year.date_from).slice(0, 10),
        date_to: String(year.date_to).slice(0, 10),
      },
      period_month: periodMonth || null,
      rows,
      totals_by_teacher: summarizeTeacherRows(rows),
      note: "Liczone są wyłącznie zajęcia ze statusem COMPLETED.",
    });
  } catch (error) {
    console.error("GET reports/teacher-settlement error:", error);
    return NextResponse.json({ message: "Błąd raportu rozliczenia lektorów" }, { status: 500 });
  }
}
