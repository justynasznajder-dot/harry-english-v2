import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { queryDb } from "@/lib/db";
import {
  fetchRecipientsForRole,
  requireMessageActor,
  type RecipientFilters,
} from "@/lib/messages";

function parseIdList(raw: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  const sp = request.nextUrl.searchParams;
  const filters: RecipientFilters = {};

  const search = sp.get("search")?.trim();
  if (search) filters.search = search;

  if (actor.user.role === "MANAGER" || actor.user.role === "TEACHER") {
    const audience = sp.get("audience");
    if (audience === "teachers" && actor.user.role === "MANAGER") {
      filters.audience = "teachers";
    }
    if (actor.user.role === "MANAGER" && sp.get("all") === "true") filters.all = true;
    const bulkParents = sp.get("bulkParents");
    if (actor.user.role === "MANAGER" && (bulkParents === "active" || bulkParents === "all")) {
      filters.bulkParents = bulkParents;
    }
    const groupIds = [
      ...parseIdList(sp.get("groupIds")),
      ...parseIdList(sp.get("group_ids")),
    ];
    const legacyGroupId = sp.get("groupId")?.trim();
    if (legacyGroupId) groupIds.push(legacyGroupId);
    const uniqueGroupIds = [...new Set(groupIds)];
    if (uniqueGroupIds.length > 0) filters.groupIds = uniqueGroupIds;
    const locationIds = [
      ...parseIdList(sp.get("locationIds")),
      ...parseIdList(sp.get("location_ids")),
    ];
    const legacyLocationId = sp.get("locationId")?.trim();
    if (legacyLocationId) locationIds.push(legacyLocationId);
    const uniqueLocationIds = [...new Set(locationIds)];
    if (uniqueLocationIds.length > 0) filters.locationIds = uniqueLocationIds;
    const schoolYearId = sp.get("schoolYearId");
    if (schoolYearId) filters.schoolYearId = schoolYearId;
    const teacherId = sp.get("teacherId");
    if (teacherId) filters.teacherId = teacherId;
    const enrollmentStatus = sp.get("enrollmentStatus");
    if (enrollmentStatus) filters.enrollmentStatus = enrollmentStatus;
    if (sp.get("renewalNoResponse") === "true") filters.renewalNoResponse = true;
  }

  try {
    const { parents, teachers } = await fetchRecipientsForRole({
      userId: actor.user.id,
      role: actor.user.role,
      schoolId: actor.user.schoolId,
      filters,
    });

    return NextResponse.json({
      parents: parents.map((p) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email,
        role: p.role,
        accessLevel: p.access_level ?? null,
        childNames: p.child_names ?? null,
      })),
      teachers: teachers.map((t) => ({
        id: t.id,
        firstName: t.first_name,
        lastName: t.last_name,
        email: t.email,
        role: t.role,
      })),
    });
  } catch (error) {
    console.error("GET /api/messages/recipients error:", error);
    return NextResponse.json({ message: "Błąd pobierania odbiorców" }, { status: 500 });
  }
}

/** Opcjonalne dane filtrów dla managera (grupy, lokalizacje, rok szkolny). */
export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok || (actor.user.role !== "MANAGER" && actor.user.role !== "TEACHER")) {
    return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
  }

  const isTeacher = actor.user.role === "TEACHER";

  try {
    const [groups, locations, schoolYears, teachers] = await Promise.all([
      queryDb<{ id: string; name: string; location_id: string | null }>(
        isTeacher
          ? `SELECT id, name, location_id FROM groups
             WHERE school_id = $1 AND teacher_id = $2 AND active = TRUE
             ORDER BY name`
          : `SELECT id, name, location_id FROM groups WHERE school_id = $1 AND active = TRUE ORDER BY name`,
        isTeacher ? [actor.user.schoolId, actor.user.id] : [actor.user.schoolId]
      ),
      queryDb<{ id: string; name: string }>(
        isTeacher
          ? `SELECT DISTINCT l.id, l.name
             FROM locations l
             JOIN groups g ON g.location_id = l.id AND g.school_id = $1 AND g.teacher_id = $2 AND g.active = TRUE
             ORDER BY l.name`
          : `SELECT id, name FROM locations WHERE school_id = $1 AND active = TRUE ORDER BY name`,
        isTeacher ? [actor.user.schoolId, actor.user.id] : [actor.user.schoolId]
      ),
      queryDb<{ id: string; name: string }>(
        isTeacher
          ? `SELECT DISTINCT sy.id, sy.name
             FROM school_years sy
             JOIN groups g ON g.school_year_id = sy.id AND g.school_id = $1 AND g.teacher_id = $2 AND g.active = TRUE
             ORDER BY sy.date_from DESC`
          : `SELECT id, name FROM school_years WHERE school_id = $1 ORDER BY date_from DESC`,
        isTeacher ? [actor.user.schoolId, actor.user.id] : [actor.user.schoolId]
      ),
      isTeacher
        ? Promise.resolve({ rows: [] as { id: string; first_name: string; last_name: string }[] })
        : queryDb<{ id: string; first_name: string; last_name: string }>(
            `SELECT id, first_name, last_name FROM users
             WHERE school_id = $1 AND role = 'TEACHER' AND active = TRUE
             ORDER BY last_name, first_name`,
            [actor.user.schoolId]
          ),
    ]);

    return NextResponse.json({
      groups: groups.rows.map((g) => ({
        id: g.id,
        name: g.name,
        locationId: g.location_id,
      })),
      locations: locations.rows,
      schoolYears: schoolYears.rows,
      teachers: teachers.rows.map((t) => ({
        id: t.id,
        name: `${t.first_name} ${t.last_name}`.trim(),
      })),
    });
  } catch (error) {
    console.error("POST /api/messages/recipients filters error:", error);
    return NextResponse.json({ message: "Błąd pobierania filtrów" }, { status: 500 });
  }
}
