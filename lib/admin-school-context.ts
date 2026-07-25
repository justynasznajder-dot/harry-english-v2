import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getRegistrationSchoolId,
  queryDb,
  resolveAdminPanelTenant,
  resolveAdminUsersSchoolScope,
  type ResolvedAdminPanelTenant,
  type User,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

export type AdminSchoolContext =
  | { ok: true; userId: string; tenant: ResolvedAdminPanelTenant; schoolId: string }
  | { ok: false; response: NextResponse };

export async function requireAdminSchoolContext(
  request: NextRequest
): Promise<AdminSchoolContext> {
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

/** Alias — moduł odnowień używa tego samego kontekstu szkoły. */
export const requireAdminRenewalsContext = requireAdminSchoolContext;
export type AdminRenewalsContext = AdminSchoolContext;

export function tenantNotFoundResponse(message = "Nie znaleziono"): NextResponse {
  return NextResponse.json({ message }, { status: 404 });
}

/** Manager może działać wyłącznie na użytkownikach swojej szkoły. */
export function managerSchoolScopeError(actor: User, target: User | null): NextResponse | null {
  if (actor.role !== "MANAGER") return null;
  if (!actor.school_id) {
    return NextResponse.json(
      { message: "Konto zarządcy nie ma przypisanej szkoły." },
      { status: 400 }
    );
  }
  if (!target) {
    return NextResponse.json({ message: "Użytkownik nie został znaleziony" }, { status: 404 });
  }
  if (target.role === "ADMIN" || target.school_id == null) {
    return NextResponse.json({ message: "Brak uprawnień do tego użytkownika" }, { status: 403 });
  }
  if (target.school_id !== actor.school_id) {
    return NextResponse.json(
      { message: "Możesz zarządzać tylko użytkownikami ze swojej szkoły" },
      { status: 403 }
    );
  }
  return null;
}

/** school_id do zapisów: manager = jego szkoła; admin = body lub env. */
export function resolveInsertSchoolId(
  tenant: ResolvedAdminPanelTenant,
  opts?: { bodySchoolId?: string | null; bodySchoolIdCamel?: string | null }
): string | null {
  if (tenant.role === "MANAGER") {
    const fromBody =
      String(opts?.bodySchoolId ?? "").trim() ||
      String(opts?.bodySchoolIdCamel ?? "").trim();
    if (fromBody && fromBody !== tenant.tenantSchoolId) return null;
    return tenant.tenantSchoolId;
  }
  const fromBody =
    String(opts?.bodySchoolId ?? "").trim() ||
    String(opts?.bodySchoolIdCamel ?? "").trim();
  return fromBody || resolveAdminUsersSchoolScope(tenant) || getRegistrationSchoolId() || null;
}

/** school_id z body/query — odrzuca mismatch dla managera. */
export function resolveSchoolIdForTenant(
  tenant: ResolvedAdminPanelTenant,
  bodySchoolId?: string | null
): string | null {
  if (tenant.role === "MANAGER") {
    const fromBody = String(bodySchoolId ?? "").trim();
    if (fromBody && fromBody !== tenant.tenantSchoolId) return null;
    return tenant.tenantSchoolId;
  }
  return resolveAdminUsersSchoolScope(tenant) || null;
}

/** Klauzula SQL AND col = $N tylko dla managera (admin czyta globalnie). */
export function managerSchoolAndClause(
  tenant: ResolvedAdminPanelTenant,
  column: string,
  paramIndex: number
): { clause: string; schoolId: string | null } {
  if (tenant.role === "MANAGER") {
    return { clause: `AND ${column} = $${paramIndex}`, schoolId: tenant.tenantSchoolId };
  }
  return { clause: "", schoolId: null };
}

export async function assertGroupInSchool(
  groupId: string,
  schoolId: string
): Promise<
  | { ok: true; schoolId: string; teacherId: string | null }
  | { ok: false }
> {
  const r = await queryDb<{
    school_id: string;
    teacher_id: string | null;
  }>(
    `SELECT school_id, teacher_id
     FROM groups
     WHERE id = $1 AND school_id = $2
     LIMIT 1`,
    [groupId, schoolId]
  );
  if (!r.rows[0]) return { ok: false };
  return {
    ok: true,
    schoolId: r.rows[0].school_id,
    teacherId: r.rows[0].teacher_id,
  };
}

export async function assertChildInSchool(
  childId: string,
  schoolId: string
): Promise<{ ok: true; parentId: string } | { ok: false }> {
  const r = await queryDb<{ parent_id: string }>(
    `SELECT parent_id FROM children WHERE id = $1 AND school_id = $2 LIMIT 1`,
    [childId, schoolId]
  );
  if (!r.rows[0]) return { ok: false };
  return { ok: true, parentId: r.rows[0].parent_id };
}

export async function assertLocationInSchool(
  locationId: string,
  schoolId: string
): Promise<{ ok: true } | { ok: false }> {
  const r = await queryDb<{ id: string }>(
    `SELECT id FROM locations WHERE id = $1 AND school_id = $2 LIMIT 1`,
    [locationId, schoolId]
  );
  if (!r.rows[0]) return { ok: false };
  return { ok: true };
}
