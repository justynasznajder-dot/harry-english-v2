import { NextRequest, NextResponse } from "next/server";
import { fetchRenewalPipeline } from "@/lib/admin-dashboard";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import { requireRenewalTargetSchoolYear } from "@/lib/school-year-planning";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const target = await requireRenewalTargetSchoolYear(schoolId);
    if (!target.ok) {
      return NextResponse.json({ message: target.message, rows: [] }, { status: 200 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const rows = await fetchRenewalPipeline(schoolId, target.year.name, search || undefined);

    return NextResponse.json({
      season: target.year.name,
      plannedNextYear: target.year,
      rows,
    });
  } catch (error) {
    console.error("GET /api/admin/renewals/pipeline:", error);
    return NextResponse.json({ message: "Błąd pobierania pipeline odnowień" }, { status: 500 });
  }
}
