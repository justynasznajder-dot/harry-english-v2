import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getRegistrationSchoolId,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  resolveAdminPanelTenant,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

export async function GET(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const schoolClause = tenant.role === "MANAGER" ? `AND g.school_id = $1` : "";
  const listParams = tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : [];

  try {
    const groups = await queryDb<{
      id: string;
      name: string;
      level: string | null;
      max_students: number;
      active: boolean;
      teacher_id: string | null;
      teacher_name: string | null;
      location_name: string | null;
      location_id: string | null;
      school_year_id: string | null;
      schedule: string | null;
      students_count: string;
      price_monthly: string | null;
      price_yearly: string | null;
    }>(
      `SELECT
         g.id,
         g.name,
         g.level,
         g.max_students,
         g.active,
         g.location_id,
         g.school_year_id,
         g.teacher_id,
         g.price_monthly::text AS price_monthly,
         g.price_yearly::text AS price_yearly,
         CASE WHEN t.id IS NULL THEN NULL ELSE CONCAT(t.first_name, ' ', t.last_name) END AS teacher_name,
         COALESCE(gl.name, MAX(l.name)) AS location_name,
         COALESCE(
           NULLIF(
             STRING_AGG(
               DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
               ', '
             ),
             ''
           ),
           '-'
         ) AS schedule,
         COUNT(DISTINCT gs.id) FILTER (WHERE gs.left_at IS NULL)::text AS students_count
       FROM groups g
       LEFT JOIN users t ON t.id = g.teacher_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       LEFT JOIN group_students gs ON gs.group_id = g.id
       WHERE 1=1 ${schoolClause}
       GROUP BY g.id, t.id, gl.name
       ORDER BY g.created_at DESC`,
      listParams
    );

    return NextResponse.json({ groups: groups.rows });
  } catch (error) {
    console.error("GET groups error:", error);
    return NextResponse.json({ message: "Błąd pobierania grup" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminId = await ensureAdmin(request);
  if (!adminId) return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });

  const resolved = await resolveAdminPanelTenant(adminId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;

  try {
    const body = await request.json();
    const {
      name,
      level,
      teacherId,
      maxStudents = 12,
      active = true,
      schoolYearId,
      locationId,
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
      priceMonthly,
      priceYearly,
    }: {
      name?: string;
      level?: string;
      teacherId?: string | null;
      maxStudents?: number;
      active?: boolean;
      schoolYearId?: string | null;
      locationId?: string | null;
      school_id?: string;
      schoolId?: string;
      priceMonthly?: number | string | null;
      priceYearly?: number | string | null;
    } = body;

    if (!name) return NextResponse.json({ message: "Nazwa grupy jest wymagana" }, { status: 400 });
    if (!teacherId) {
      return NextResponse.json({ message: "Wybierz nauczyciela dla grupy" }, { status: 400 });
    }

    let insertSchoolId: string | null =
      tenant.role === "MANAGER" ? tenant.tenantSchoolId : null;
    if (tenant.role === "ADMIN") {
      const fromBody =
        (typeof bodySchoolId === "string" && bodySchoolId.trim()) ||
        (typeof bodySchoolIdCamel === "string" && bodySchoolIdCamel.trim()) ||
        "";
      insertSchoolId = fromBody || getRegistrationSchoolId() || null;
    }
    if (!insertSchoolId) {
      return NextResponse.json(
        { message: "Brak identyfikatora szkoły (school_id / schoolId lub SCHOOL_ID w środowisku)" },
        { status: 400 }
      );
    }

    const inserted = await queryDb<{ id: string }>(
      `INSERT INTO groups (
         id, school_id, teacher_id, name, level, max_students, active,
         created_at, school_year_id, location_id, price_monthly, price_yearly
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11)
       RETURNING id`,
      [
        randomUUID(),
        insertSchoolId,
        teacherId ?? null,
        name.trim(),
        level ?? null,
        maxStudents,
        active,
        schoolYearId ?? null,
        locationId ?? null,
        priceMonthly != null && priceMonthly !== "" ? Number(priceMonthly) : null,
        priceYearly != null && priceYearly !== "" ? Number(priceYearly) : null,
      ]
    );

    return NextResponse.json({ id: inserted.rows[0].id, message: "Grupa została utworzona" });
  } catch (error) {
    console.error("POST groups error:", error);
    return NextResponse.json({ message: "Błąd tworzenia grupy" }, { status: 500 });
  }
}
