import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureSchoolAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteCtx) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }

  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }

  const { id } = await context.params;
  const { tenant } = resolved;

  try {
    let body: { active?: boolean; name?: string; address?: string | null } = {};
    try {
      body = (await request.json()) as { active?: boolean; name?: string; address?: string | null };
    } catch {
      /* brak body - domyślnie dezaktywacja */
    }

    const hasEditPayload = body.name !== undefined || body.address !== undefined;
    if (hasEditPayload) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ message: "Nazwa lokalizacji jest wymagana" }, { status: 400 });
      }
      const address =
        body.address != null && String(body.address).trim() !== "" ? String(body.address).trim() : null;

      const update = await queryDb<{ id: string }>(
        tenant.role === "MANAGER"
          ? `UPDATE locations
             SET name = $3, address = $4
             WHERE id = $1 AND school_id = $2
             RETURNING id`
          : `UPDATE locations
             SET name = $2, address = $3
             WHERE id = $1
             RETURNING id`,
        tenant.role === "MANAGER" ? [id, tenant.tenantSchoolId, name, address] : [id, name, address]
      );
      if (!update.rows[0]) {
        return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
      }
      return NextResponse.json({ message: "Lokalizacja została zaktualizowana" });
    }

    const nextActive = typeof body.active === "boolean" ? body.active : false;

    const update = await queryDb<{ id: string }>(
      tenant.role === "MANAGER"
        ? `UPDATE locations SET active = $3 WHERE id = $1 AND school_id = $2 RETURNING id`
        : `UPDATE locations SET active = $2 WHERE id = $1 RETURNING id`,
      tenant.role === "MANAGER" ? [id, tenant.tenantSchoolId, nextActive] : [id, nextActive]
    );

    if (!update.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
    }

    return NextResponse.json({
      message: nextActive
        ? "Lokalizacja została ponownie oznaczona jako aktywna"
        : "Lokalizacja została oznaczona jako nieaktywna",
    });
  } catch (error) {
    console.error("PUT admin/locations/[id]:", error);
    return NextResponse.json(
      { message: "Nie udało się zaktualizować lokalizacji" },
      { status: 500 }
    );
  }
}
