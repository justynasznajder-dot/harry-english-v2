import { NextRequest, NextResponse } from "next/server";
import { fetchStudentPipeline } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  try {
    const rows = await fetchStudentPipeline(ctx.schoolId, search || undefined);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/admin/pipeline:", error);
    return NextResponse.json({ message: "Błąd pobierania pipeline" }, { status: 500 });
  }
}
