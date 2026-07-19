import { NextRequest, NextResponse } from "next/server";
import { fetchGroupOccupancy } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const rows = await fetchGroupOccupancy(ctx.schoolId);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/admin/groups/occupancy:", error);
    return NextResponse.json({ message: "Błąd prognozy obłożenia" }, { status: 500 });
  }
}
