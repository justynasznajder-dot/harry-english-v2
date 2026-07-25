import { NextRequest, NextResponse } from "next/server";
import { fetchGroupsRoster } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

/** Aktywne grupy szkoły z listą dzieci (aktywny rok szkolny). */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const groups = await fetchGroupsRoster(ctx.schoolId);
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("GET /api/admin/groups/roster:", error);
    return NextResponse.json({ message: "Błąd podglądu grup" }, { status: 500 });
  }
}
