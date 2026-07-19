import { NextRequest, NextResponse } from "next/server";
import {
  deleteChild,
  getChildByIdForSchool,
  restoreChild,
  updateChild,
} from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.restore === true) {
      const restored = await restoreChild(id, ctx.schoolId);
      if (!restored) return tenantNotFoundResponse("Dziecko nie zostało znalezione");
      return NextResponse.json({ message: "Dziecko zostało przywrócone" });
    }

    const updated = await updateChild(id, ctx.schoolId, {
      first_name: body.first_name,
      last_name: body.last_name,
      birth_date: body.birth_date,
      active: body.active,
      confirmed: body.confirmed,
    });

    if (!updated) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

    const child = await getChildByIdForSchool(id, ctx.schoolId);
    return NextResponse.json({ child, message: "Dziecko zostało zaktualizowane" });
  } catch (error) {
    console.error("Update child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas aktualizacji dziecka" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { id } = await params;
    const deleted = await deleteChild(id, ctx.schoolId);
    if (!deleted) return tenantNotFoundResponse("Dziecko nie zostało znalezione");

    return NextResponse.json({ message: "Dziecko zostało oznaczone jako nieaktywne" });
  } catch (error) {
    console.error("Delete child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas usuwania dziecka" }, { status: 500 });
  }
}
