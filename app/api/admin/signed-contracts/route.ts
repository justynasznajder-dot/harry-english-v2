import { NextRequest, NextResponse } from "next/server";
import { fetchSignedContractConsents } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { getActiveSchoolYear } from "@/lib/db";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  try {
    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    const schoolYearId = activeYear?.id ? String(activeYear.id) : null;
    if (!schoolYearId) {
      return NextResponse.json({ rows: [] });
    }

    const rows = await fetchSignedContractConsents(
      ctx.schoolId,
      schoolYearId,
      search || undefined
    );
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("GET /api/admin/signed-contracts:", error);
    return NextResponse.json(
      { message: "Błąd pobierania podpisanych umów" },
      { status: 500 }
    );
  }
}
