import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await ensureAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id } = await params;
  try {
    const group = await queryDb(
      `SELECT g.*, CONCAT(u.first_name, ' ', u.last_name) AS teacher_name, gl.name AS location_name
       FROM groups g
       LEFT JOIN users u ON u.id = g.teacher_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       WHERE g.id = $1 ${tenant.role === "MANAGER" ? "AND g.school_id = $2" : ""}
       LIMIT 1`,
      tenant.role === "MANAGER" ? [id, tenant.tenantSchoolId] : [id]
    );
    if (!group.rows[0]) return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });

    const scheduleTemplates = await queryDb(
      `SELECT st.*, l.name AS location_name
       FROM schedule_templates st
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE st.group_id = $1
       ORDER BY st.day_of_week, st.start_time`,
      [id]
    );
    const students = await queryDb(
      `SELECT
         gs.id,
         gs.enrolled_at,
         gs.left_at,
         c.id AS child_id,
         c.first_name,
         c.last_name,
         c.birth_date,
         c.active,
         c.confirmed
       FROM group_students gs
       JOIN children c ON c.id = gs.child_id
       WHERE gs.group_id = $1
       ORDER BY gs.enrolled_at DESC`,
      [id]
    );
    const nearestLessons = await queryDb(
      `SELECT *
       FROM lessons
       WHERE group_id = $1
       ORDER BY scheduled_at ASC
       LIMIT 20`,
      [id]
    );
    const locations = await queryDb(
      tenant.role === "MANAGER"
        ? `SELECT id, name FROM locations WHERE school_id = $1 AND active = TRUE ORDER BY name`
        : `SELECT id, name FROM locations WHERE active = TRUE ORDER BY name`,
      tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : []
    );

    return NextResponse.json({
      group: group.rows[0],
      scheduleTemplates: scheduleTemplates.rows,
      students: students.rows,
      nearestLessons: nearestLessons.rows,
      locations: locations.rows,
    });
  } catch (error) {
    console.error("GET group detail error:", error);
    return NextResponse.json({ message: "Błąd pobierania szczegółów grupy" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await ensureAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, level, teacherId, maxStudents, active, schoolYearId, locationId } = body;
    await queryDb(
      `UPDATE groups
       SET name = COALESCE($2, name),
           level = COALESCE($3, level),
           teacher_id = $4,
           max_students = COALESCE($5, max_students),
           active = COALESCE($6, active),
           school_year_id = $7,
           location_id = $8
       WHERE id = $1 ${tenant.role === "MANAGER" ? "AND school_id = $9" : ""}`,
      tenant.role === "MANAGER"
        ? [id, name ?? null, level ?? null, teacherId ?? null, maxStudents ?? null, active ?? null, schoolYearId ?? null, locationId ?? null, tenant.tenantSchoolId]
        : [id, name ?? null, level ?? null, teacherId ?? null, maxStudents ?? null, active ?? null, schoolYearId ?? null, locationId ?? null]
    );
    return NextResponse.json({ message: "Grupa została zaktualizowana" });
  } catch (error) {
    console.error("PUT group error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji grupy" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await ensureAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const { id } = await params;
  try {
    await queryDb(
      tenant.role === "MANAGER"
        ? `UPDATE groups SET active = FALSE WHERE id = $1 AND school_id = $2`
        : `UPDATE groups SET active = FALSE WHERE id = $1`,
      tenant.role === "MANAGER" ? [id, tenant.tenantSchoolId] : [id]
    );
    return NextResponse.json({ message: "Grupa została oznaczona jako nieaktywna" });
  } catch (error) {
    console.error("DELETE group error:", error);
    return NextResponse.json({ message: "Błąd usuwania grupy" }, { status: 500 });
  }
}
