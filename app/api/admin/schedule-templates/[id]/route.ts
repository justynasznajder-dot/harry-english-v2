import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const res = await queryDb<{ id: string }>(
      `DELETE FROM schedule_templates st
       USING groups g
       WHERE st.id = $1
         AND st.group_id = g.id
         AND g.school_id = $2
       RETURNING st.id`,
      [id, ctx.schoolId]
    );
    if (!res.rows[0]) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }
    return NextResponse.json({ message: "Termin usunięty" });
  } catch (error) {
    console.error("DELETE schedule template error:", error);
    return NextResponse.json({ message: "Błąd usuwania terminu" }, { status: 500 });
  }
}
