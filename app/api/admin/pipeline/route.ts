import { NextRequest, NextResponse } from "next/server";
import {
  countStudentPipeline,
  fetchStudentPipeline,
} from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    if (request.nextUrl.searchParams.get("countOnly") === "1") {
      const count = await countStudentPipeline(ctx.schoolId);
      return NextResponse.json({ count });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const rows = await fetchStudentPipeline(ctx.schoolId, search || undefined);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/admin/pipeline:", error);
    return NextResponse.json({ message: "Błąd pobierania pipeline" }, { status: 500 });
  }
}
