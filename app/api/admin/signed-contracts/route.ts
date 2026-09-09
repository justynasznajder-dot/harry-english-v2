import { NextRequest, NextResponse } from "next/server";
import {
  countSignedContracts,
  fetchSignedContractConsents,
} from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { getActiveSchoolYear } from "@/lib/db";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const countOnly = request.nextUrl.searchParams.get("countOnly") === "1";

  try {
    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    const schoolYearId = activeYear?.id ? String(activeYear.id) : null;
    if (!schoolYearId) {
      return NextResponse.json(countOnly ? { count: 0 } : { rows: [] });
    }

    if (countOnly) {
      const count = await countSignedContracts(ctx.schoolId, schoolYearId);
      return NextResponse.json({ count });
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
