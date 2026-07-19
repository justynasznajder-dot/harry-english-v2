import { vi } from "vitest";
import { NextRequest } from "next/server";

/** Dev / prod school IDs from project rules — used only in tests. */
export const SCHOOL_A = "efcb641a-e5bd-4e59-aa39-c08fd1b318e9";
export const SCHOOL_B = "c93d5ac1-fa59-497f-b450-a4e50e1fb50d";

export const MANAGER_USER_ID = "test-manager-user-id";

export const queryDbMock = vi.fn();
export const canAccessSchoolAdminApisMock = vi.fn();
export const resolveAdminPanelTenantMock = vi.fn();
export const getRegistrationSchoolIdMock = vi.fn();
export const getTokenFromRequestMock = vi.fn();
export const deleteChildMock = vi.fn();
export const updateChildMock = vi.fn();
export const restoreChildMock = vi.fn();
export const getChildByIdForSchoolMock = vi.fn();

export function resetAdminRouteMocks() {
  queryDbMock.mockReset();
  canAccessSchoolAdminApisMock.mockReset();
  resolveAdminPanelTenantMock.mockReset();
  getRegistrationSchoolIdMock.mockReset();
  getTokenFromRequestMock.mockReset();
  deleteChildMock.mockReset();
  updateChildMock.mockReset();
  restoreChildMock.mockReset();
  getChildByIdForSchoolMock.mockReset();
}

export function setupManagerSchoolA() {
  getTokenFromRequestMock.mockResolvedValue({
    userId: MANAGER_USER_ID,
    role: "MANAGER",
    schoolId: SCHOOL_A,
    accessLevel: "ACTIVE",
  });
  canAccessSchoolAdminApisMock.mockResolvedValue(true);
  resolveAdminPanelTenantMock.mockResolvedValue({
    ok: true,
    tenant: { role: "MANAGER", tenantSchoolId: SCHOOL_A },
  });
  getRegistrationSchoolIdMock.mockReturnValue(SCHOOL_A);
}

export function adminJsonRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { cookie: "auth-token=test-token" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Returns true when SQL contains school_id filter and params include manager's school. */
export function sqlUsesManagerSchoolFilter(sql: string, params: unknown[], schoolId: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();
  return normalized.includes("school_id") && params.some((p) => p === schoolId);
}
