import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

export async function DELETE(request: NextRequest) {
  const userId = await ensureAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  try {
    const body = await request.json();
    const { groupId } = body as { groupId?: string };
    if (!groupId) {
      return NextResponse.json({ message: "Brak identyfikatora grupy" }, { status: 400 });
    }

    const groupCheck = await queryDb<{ id: string }>(
      tenant.role === "MANAGER"
        ? `SELECT id FROM groups WHERE id = $1 AND school_id = $2 LIMIT 1`
        : `SELECT id FROM groups WHERE id = $1 LIMIT 1`,
      tenant.role === "MANAGER" ? [groupId, tenant.tenantSchoolId] : [groupId],
    );
    if (!groupCheck.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });
    }

    const deleted = await queryDb<{ id: string }>(
      `DELETE FROM lessons
       WHERE group_id = $1
         AND scheduled_at > NOW()
         AND status = 'SCHEDULED'
       RETURNING id`,
      [groupId],
    );

    const count = deleted.rowCount ?? 0;
    return NextResponse.json({
      deleted: count,
      message: count > 0 ? `Usunięto ${count} nadchodzących zajęć z kalendarza` : "Brak nadchodzących zajęć do usunięcia",
    });
  } catch (error) {
    console.error("DELETE lessons/future error:", error);
    return NextResponse.json({ message: "Błąd usuwania zajęć" }, { status: 500 });
  }
}
