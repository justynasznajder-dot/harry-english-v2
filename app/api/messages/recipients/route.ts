import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { queryDb } from "@/lib/db";
import {
  fetchRecipientsForRole,
  requireMessageActor,
  type RecipientFilters,
} from "@/lib/messages";

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

  if (actor.user.role === "MANAGER") {
    if (sp.get("all") === "true") filters.all = true;
    const groupId = sp.get("groupId");
    if (groupId) filters.groupId = groupId;
    const locationId = sp.get("locationId");
    if (locationId) filters.locationId = locationId;
    const schoolYearId = sp.get("schoolYearId");
    if (schoolYearId) filters.schoolYearId = schoolYearId;
    const teacherId = sp.get("teacherId");
    if (teacherId) filters.teacherId = teacherId;
    const enrollmentStatus = sp.get("enrollmentStatus");
    if (enrollmentStatus) filters.enrollmentStatus = enrollmentStatus;
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
  if (!actor.ok || actor.user.role !== "MANAGER") {
    return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
  }

  try {
    const [groups, locations, schoolYears, teachers] = await Promise.all([
      queryDb<{ id: string; name: string }>(
        `SELECT id, name FROM groups WHERE school_id = $1 AND active = TRUE ORDER BY name`,
        [actor.user.schoolId]
      ),
      queryDb<{ id: string; name: string }>(
        `SELECT id, name FROM locations WHERE school_id = $1 AND active = TRUE ORDER BY name`,
        [actor.user.schoolId]
      ),
      queryDb<{ id: string; name: string }>(
        `SELECT id, name FROM school_years WHERE school_id = $1 ORDER BY date_from DESC`,
        [actor.user.schoolId]
      ),
      queryDb<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM users
         WHERE school_id = $1 AND role = 'TEACHER' AND active = TRUE
         ORDER BY last_name, first_name`,
        [actor.user.schoolId]
      ),
    ]);

    return NextResponse.json({
      groups: groups.rows,
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
