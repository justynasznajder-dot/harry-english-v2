import { NextRequest, NextResponse } from "next/server";
import { fetchFullDashboard } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const daysRaw = request.nextUrl.searchParams.get("negotiatingDays");
  const negotiatingDaysThreshold = Math.max(1, Math.min(30, Number(daysRaw) || 3));

  try {
    const data = await fetchFullDashboard(ctx.schoolId, negotiatingDaysThreshold);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/dashboard:", error);
    return NextResponse.json({ message: "Błąd pobierania pulpitu" }, { status: 500 });
  }
}
