import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@/lib/db";
import { SCHOOL_A, SCHOOL_B } from "./helpers/admin-route-mocks";

const dbMocks = vi.hoisted(() => ({
  queryDb: vi.fn(),
  canAccessSchoolAdminApis: vi.fn(),
  resolveAdminPanelTenant: vi.fn(),
  getRegistrationSchoolId: vi.fn(() => "efcb641a-e5bd-4e59-aa39-c08fd1b318e9"),
  resolveAdminUsersSchoolScope: vi.fn(() => "efcb641a-e5bd-4e59-aa39-c08fd1b318e9"),
  getTokenFromRequest: vi.fn(),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    queryDb: dbMocks.queryDb,
    canAccessSchoolAdminApis: dbMocks.canAccessSchoolAdminApis,
    resolveAdminPanelTenant: dbMocks.resolveAdminPanelTenant,
    getRegistrationSchoolId: dbMocks.getRegistrationSchoolId,
    resolveAdminUsersSchoolScope: dbMocks.resolveAdminUsersSchoolScope,
  };
});

vi.mock("@/lib/auth", () => ({
  getTokenFromRequest: dbMocks.getTokenFromRequest,
}));

import {
  assertChildInSchool,
  assertGroupInSchool,
  assertLocationInSchool,
  managerSchoolAndClause,
  managerSchoolScopeError,
  requireAdminSchoolContext,
  resolveInsertSchoolId,
  resolveSchoolIdForTenant,
} from "@/lib/admin-school-context";

describe("admin-school-context helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("managerSchoolScopeError", () => {
    const manager: User = {
      id: "m1",
      school_id: SCHOOL_A,
      email: "m@test.pl",
      password_hash: "hash",
      role: "MANAGER",
      access_level: "ACTIVE",
      first_name: "M",
      last_name: "G",
      phone: null,
      active: true,
      confirmed: true,
      must_change_password: false,
      client_number: null,
      reset_token: null,
      reset_token_expiry: null,
      resignation_date: null,
      last_login: null,
      created_at: new Date(),
    };

    it("blokuje managera przed użytkownikiem z innej szkoły", () => {
      const target: User = {
        ...manager,
        id: "p1",
        role: "PARENT",
        school_id: SCHOOL_B,
      };
      const err = managerSchoolScopeError(manager, target);
      expect(err?.status).toBe(403);
    });

    it("pozwala managerowi na użytkownika ze swojej szkoły", () => {
      const target: User = {
        ...manager,
        id: "p1",
        role: "PARENT",
        school_id: SCHOOL_A,
      };
      expect(managerSchoolScopeError(manager, target)).toBeNull();
    });
  });

  describe("resolveInsertSchoolId", () => {
    it("manager: odrzuca schoolId z body innej szkoły", () => {
      const id = resolveInsertSchoolId(
        { role: "MANAGER", tenantSchoolId: SCHOOL_A },
        { bodySchoolId: SCHOOL_B }
      );
      expect(id).toBeNull();
    });

    it("manager: zwraca własną szkołę", () => {
      const id = resolveInsertSchoolId(
        { role: "MANAGER", tenantSchoolId: SCHOOL_A },
        { bodySchoolId: SCHOOL_A }
      );
      expect(id).toBe(SCHOOL_A);
    });
  });

  describe("resolveSchoolIdForTenant", () => {
    it("manager: odrzuca obcą szkołę w body", () => {
      expect(
        resolveSchoolIdForTenant({ role: "MANAGER", tenantSchoolId: SCHOOL_A }, SCHOOL_B)
      ).toBeNull();
    });
  });

  describe("managerSchoolAndClause", () => {
    it("dodaje filtr SQL tylko dla managera", () => {
      const mgr = managerSchoolAndClause(
        { role: "MANAGER", tenantSchoolId: SCHOOL_A },
        "g.school_id",
        2
      );
      expect(mgr.clause).toContain("g.school_id = $2");
      expect(mgr.schoolId).toBe(SCHOOL_A);

      const admin = managerSchoolAndClause({ role: "ADMIN", tenantSchoolId: null }, "g.school_id", 2);
      expect(admin.clause).toBe("");
      expect(admin.schoolId).toBeNull();
    });
  });

  describe("assert*InSchool", () => {
    it("assertGroupInSchool wymaga dopasowania school_id w SQL", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });
      const result = await assertGroupInSchool("group-1", SCHOOL_A);
      expect(result.ok).toBe(false);
      const [sql, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/school_id = \$2/i);
      expect(params).toEqual(["group-1", SCHOOL_A]);
    });

    it("assertChildInSchool wymaga dopasowania school_id w SQL", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [{ parent_id: "parent-1" }] });
      const result = await assertChildInSchool("child-1", SCHOOL_A);
      expect(result.ok).toBe(true);
      const [, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(["child-1", SCHOOL_A]);
    });

    it("assertLocationInSchool wymaga dopasowania school_id w SQL", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });
      await assertLocationInSchool("loc-1", SCHOOL_B);
      const [, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(["loc-1", SCHOOL_B]);
    });
  });

  describe("requireAdminSchoolContext", () => {
    it("manager otrzymuje schoolId ze swojego tenantu", async () => {
      dbMocks.getTokenFromRequest.mockResolvedValueOnce({
        userId: "mgr",
        role: "MANAGER",
        schoolId: SCHOOL_A,
        accessLevel: "ACTIVE",
      });
      dbMocks.canAccessSchoolAdminApis.mockResolvedValueOnce(true);
      dbMocks.resolveAdminPanelTenant.mockResolvedValueOnce({
        ok: true,
        tenant: { role: "MANAGER", tenantSchoolId: SCHOOL_A },
      });

      const req = new NextRequest("http://localhost/api/admin/groups", {
        headers: { cookie: "auth-token=x" },
      });
      const ctx = await requireAdminSchoolContext(req);
      expect(ctx.ok).toBe(true);
      if (ctx.ok) {
        expect(ctx.schoolId).toBe(SCHOOL_A);
        expect(ctx.tenant.role).toBe("MANAGER");
      }
    });
  });
});
