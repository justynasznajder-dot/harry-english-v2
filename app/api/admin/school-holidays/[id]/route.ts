import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  try {
    const del = await queryDb(
      ctx.tenant.role === "MANAGER"
        ? `DELETE FROM school_holidays WHERE id = $1 AND school_id = $2 RETURNING id`
        : `DELETE FROM school_holidays WHERE id = $1 RETURNING id`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id]
    );
    if (!del.rowCount) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE school-holidays/[id] error:", error);
    return NextResponse.json({ message: "Błąd usuwania dnia wolnego" }, { status: 500 });
  }
}
