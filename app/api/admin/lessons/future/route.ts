import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { assertGroupInSchool, requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId } = body as { groupId?: string };
    if (!groupId) {
      return NextResponse.json({ message: "Brak identyfikatora grupy" }, { status: 400 });
    }

    if (ctx.tenant.role === "MANAGER") {
      const group = await assertGroupInSchool(groupId, ctx.schoolId);
      if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");
    } else {
      const groupCheck = await queryDb<{ id: string }>(
        `SELECT id FROM groups WHERE id = $1 LIMIT 1`,
        [groupId]
      );
      if (!groupCheck.rows[0]) return tenantNotFoundResponse("Nie znaleziono grupy");
    }

    const deleted = await queryDb<{ id: string }>(
      `DELETE FROM lessons
       WHERE group_id = $1
         AND scheduled_at > NOW()
         AND status = 'SCHEDULED'
       RETURNING id`,
      [groupId]
    );

    const count = deleted.rowCount ?? 0;
    return NextResponse.json({
      deleted: count,
      message:
        count > 0
          ? `Usunięto ${count} nadchodzących zajęć z kalendarza`
          : "Brak nadchodzących zajęć do usunięcia",
    });
  } catch (error) {
    console.error("DELETE lessons/future error:", error);
    return NextResponse.json({ message: "Błąd usuwania zajęć" }, { status: 500 });
  }
}
