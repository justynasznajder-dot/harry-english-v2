import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCHOOL_A,
  SCHOOL_B,
  adminJsonRequest,
  readJson,
  sqlUsesManagerSchoolFilter,
} from "./helpers/admin-route-mocks";

const dbMocks = vi.hoisted(() => ({
  queryDb: vi.fn(),
  canAccessSchoolAdminApis: vi.fn(),
  resolveAdminPanelTenant: vi.fn(),
  getRegistrationSchoolId: vi.fn(),
  resolveAdminUsersSchoolScope: vi.fn(),
  getTokenFromRequest: vi.fn(),
  deleteChild: vi.fn(),
  updateChild: vi.fn(),
  restoreChild: vi.fn(),
  getChildByIdForSchool: vi.fn(),
  getActiveSchoolYear: vi.fn(),
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
    deleteChild: dbMocks.deleteChild,
    updateChild: dbMocks.updateChild,
    restoreChild: dbMocks.restoreChild,
    getChildByIdForSchool: dbMocks.getChildByIdForSchool,
    getActiveSchoolYear: dbMocks.getActiveSchoolYear,
  };
});

vi.mock("@/lib/auth", () => ({
  getTokenFromRequest: dbMocks.getTokenFromRequest,
}));

import { POST as postGroupStudent } from "@/app/api/admin/group-students/route";
import { PATCH as patchGroupStudent, DELETE as deleteGroupStudent } from "@/app/api/admin/group-students/[id]/route";
import { DELETE as deleteScheduleTemplate } from "@/app/api/admin/schedule-templates/[id]/route";
import { DELETE as deleteChildRoute } from "@/app/api/admin/children/[id]/route";
import { POST as postScheduleTemplate } from "@/app/api/admin/schedule-templates/route";

describe("admin routes — tenant isolation (manager)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getTokenFromRequest.mockResolvedValue({
      userId: "test-manager",
      role: "MANAGER",
      schoolId: SCHOOL_A,
      accessLevel: "ACTIVE",
    });
    dbMocks.canAccessSchoolAdminApis.mockResolvedValue(true);
    dbMocks.resolveAdminPanelTenant.mockResolvedValue({
      ok: true,
      tenant: { role: "MANAGER", tenantSchoolId: SCHOOL_A },
    });
    dbMocks.getRegistrationSchoolId.mockReturnValue(SCHOOL_A);
    dbMocks.resolveAdminUsersSchoolScope.mockReturnValue(SCHOOL_A);
  });

  describe("POST /api/admin/group-students", () => {
    it("zwraca 404 gdy grupa należy do innej szkoły", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });

      const res = await postGroupStudent(
        adminJsonRequest("POST", "http://localhost/api/admin/group-students", {
          groupId: "group-other-school",
          childId: "child-1",
        })
      );

      expect(res.status).toBe(404);
      const body = await readJson(res);
      expect(body.message).toMatch(/grupy/i);

      const [sql, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(sqlUsesManagerSchoolFilter(sql, params, SCHOOL_A)).toBe(true);
    });

    it("zwraca 404 gdy uczeń należy do innej szkoły", async () => {
      dbMocks.queryDb
        .mockResolvedValueOnce({
          rows: [{ school_id: SCHOOL_A, school_year_id: "sy-1", teacher_id: "t-1" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await postGroupStudent(
        adminJsonRequest("POST", "http://localhost/api/admin/group-students", {
          groupId: "group-1",
          childId: "child-other-school",
        })
      );

      expect(res.status).toBe(404);
      const body = await readJson(res);
      expect(body.message).toMatch(/uczn/i);
    });
  });

  describe("PATCH /api/admin/group-students/[id]", () => {
    it("UPDATE zawiera filtr school_id — brak wiersza = 404", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });

      const res = await patchGroupStudent(
        adminJsonRequest("PATCH", "http://localhost/api/admin/group-students/gs-1", {
          lessonUnitPrice: 50,
        }),
        { params: Promise.resolve({ id: "gs-1" }) }
      );

      expect(res.status).toBe(404);
      const [sql, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(sql.toLowerCase()).toContain("g.school_id");
      expect(params).toContain(SCHOOL_A);
    });
  });

  describe("DELETE /api/admin/group-students/[id]", () => {
    it("DELETE zawiera filtr school_id — brak wiersza = 404", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });

      const res = await deleteGroupStudent(
        adminJsonRequest("DELETE", "http://localhost/api/admin/group-students/gs-1"),
        { params: Promise.resolve({ id: "gs-1" }) }
      );

      expect(res.status).toBe(404);
      const [sql, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(sql.toLowerCase()).toContain("g.school_id");
      expect(params).toEqual(["gs-1", SCHOOL_A]);
    });
  });

  describe("POST /api/admin/schedule-templates", () => {
    it("zwraca 404 gdy grupa jest z innej szkoły", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });

      const res = await postScheduleTemplate(
        adminJsonRequest("POST", "http://localhost/api/admin/schedule-templates", {
          groupId: "group-b",
          dayOfWeek: 1,
          startTime: "18:00",
          locationId: "loc-1",
        })
      );

      expect(res.status).toBe(404);
      expect(dbMocks.queryDb.mock.calls[0]?.[1]).toEqual(["group-b", SCHOOL_A]);
    });

    it("zwraca 404 gdy lokalizacja jest z innej szkoły", async () => {
      dbMocks.queryDb
        .mockResolvedValueOnce({
          rows: [{ school_id: SCHOOL_A, school_year_id: "sy-1", teacher_id: "t-1" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await postScheduleTemplate(
        adminJsonRequest("POST", "http://localhost/api/admin/schedule-templates", {
          groupId: "group-1",
          dayOfWeek: 1,
          startTime: "18:00",
          locationId: "loc-other",
        })
      );

      expect(res.status).toBe(404);
      const body = await readJson(res);
      expect(body.message).toMatch(/lokalizacji/i);
    });
  });

  describe("DELETE /api/admin/schedule-templates/[id]", () => {
    it("DELETE JOIN groups z school_id — brak dopasowania = 404", async () => {
      dbMocks.queryDb.mockResolvedValueOnce({ rows: [] });

      const res = await deleteScheduleTemplate(
        adminJsonRequest("DELETE", "http://localhost/api/admin/schedule-templates/st-1"),
        { params: Promise.resolve({ id: "st-1" }) }
      );

      expect(res.status).toBe(404);
      const [sql, params] = dbMocks.queryDb.mock.calls[0] as [string, unknown[]];
      expect(sql.toLowerCase()).toContain("g.school_id");
      expect(params).toEqual(["st-1", SCHOOL_A]);
    });
  });

  describe("DELETE /api/admin/children/[id]", () => {
    it("deleteChild wywoływane z schoolId managera, nie obcej szkoły", async () => {
      dbMocks.deleteChild.mockResolvedValueOnce(false);

      const res = await deleteChildRoute(
        adminJsonRequest("DELETE", "http://localhost/api/admin/children/child-b"),
        { params: Promise.resolve({ id: "child-b" }) }
      );

      expect(res.status).toBe(404);
      expect(dbMocks.deleteChild).toHaveBeenCalledWith("child-b", SCHOOL_A);
      expect(dbMocks.deleteChild).not.toHaveBeenCalledWith("child-b", SCHOOL_B);
    });

    it("deleteChild z właściwą szkołą — sukces", async () => {
      dbMocks.deleteChild.mockResolvedValueOnce(true);

      const res = await deleteChildRoute(
        adminJsonRequest("DELETE", "http://localhost/api/admin/children/child-a"),
        { params: Promise.resolve({ id: "child-a" }) }
      );

      expect(res.status).toBe(200);
      expect(dbMocks.deleteChild).toHaveBeenCalledWith("child-a", SCHOOL_A);
    });
  });
});
