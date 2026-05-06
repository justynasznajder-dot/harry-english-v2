import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";

function tokenToUserId(token: string): string | null {
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] || null;
  } catch {
    return null;
  }
}

async function ensureSchoolAdmin(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  const userId = tokenToUserId(token);
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id } = await context.params;
  try {
    const del = await queryDb(
      tenant.role === "MANAGER"
        ? `DELETE FROM school_holidays WHERE id = $1 AND school_id = $2 RETURNING id`
        : `DELETE FROM school_holidays WHERE id = $1 RETURNING id`,
      tenant.role === "MANAGER" ? [id, tenant.tenantSchoolId] : [id]
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
