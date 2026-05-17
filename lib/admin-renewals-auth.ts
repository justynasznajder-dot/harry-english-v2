import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getRegistrationSchoolId,
  resolveAdminPanelTenant,
  type ResolvedAdminPanelTenant,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

export type AdminRenewalsContext =
  | { ok: true; userId: string; tenant: ResolvedAdminPanelTenant; schoolId: string }
  | { ok: false; response: NextResponse };

export async function requireAdminRenewalsContext(
  request: NextRequest
): Promise<AdminRenewalsContext> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 }),
    };
  }
  if (!(await canAccessSchoolAdminApis(userId))) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 }),
    };
  }

  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json({ message: resolved.message }, { status: resolved.status }),
    };
  }

  const schoolId =
    resolved.tenant.role === "MANAGER"
      ? resolved.tenant.tenantSchoolId
      : getRegistrationSchoolId();
  if (!schoolId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak przypisanej szkoły" }, { status: 400 }),
    };
  }

  return { ok: true, userId, tenant: resolved.tenant, schoolId };
}
