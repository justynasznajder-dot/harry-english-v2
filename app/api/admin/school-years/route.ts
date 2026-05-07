import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getRegistrationSchoolId,
  queryDb,
  resolveAdminPanelTenant,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureSchoolAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

export async function GET(request: NextRequest) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  const schoolClause = tenant.role === "MANAGER" ? `WHERE school_id = $1` : "";
  const listParams = tenant.role === "MANAGER" ? [tenant.tenantSchoolId] : [];
  try {
    const r = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      date_from: string;
      date_to: string;
      active: boolean;
      created_at: Date;
    }>(
      `SELECT id, school_id, name, date_from::text, date_to::text, active, created_at
       FROM school_years
       ${schoolClause}
       ORDER BY date_from DESC`,
      listParams
    );
    const years = r.rows.map((row) => ({
      ...row,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
      isActive: row.active,
    }));
    return NextResponse.json({ years });
  } catch (error) {
    console.error("GET school-years error:", error);
    return NextResponse.json({ message: "Błąd pobierania lat szkolnych" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await ensureSchoolAdmin(request);
  if (!userId) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const resolved = await resolveAdminPanelTenant(userId);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  const { tenant } = resolved;
  try {
    const body = await request.json();
    const {
      name,
      date_from,
      date_to,
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
    } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
      school_id?: string;
      schoolId?: string;
    };
    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }

    let insertSchoolId: string | null =
      tenant.role === "MANAGER" ? tenant.tenantSchoolId : null;
    if (tenant.role === "MANAGER") {
      const fromBody =
        (typeof bodySchoolId === "string" && bodySchoolId.trim()) ||
        (typeof bodySchoolIdCamel === "string" && bodySchoolIdCamel.trim()) ||
        "";
      if (fromBody && fromBody !== tenant.tenantSchoolId) {
        return NextResponse.json(
          { message: "Manager może tworzyć rok szkolny tylko dla swojej szkoły" },
          { status: 403 }
        );
      }
    }
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

    const active = await queryDb<{ id: string }>(
      `SELECT id FROM school_years WHERE school_id = $1 AND active = TRUE LIMIT 1`,
      [insertSchoolId]
    );
    if (active.rows[0]) {
      return NextResponse.json(
        { message: "Najpierw zakończ bieżący rok szkolny" },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const ins = await queryDb<{
      id: string;
      school_id: string;
      name: string;
      date_from: string;
      date_to: string;
      active: boolean;
      created_at: Date;
    }>(
      `INSERT INTO school_years (id, school_id, name, date_from, date_to, active, created_at)
       VALUES ($1, $2, $3, $4::date, $5::date, TRUE, NOW())
       RETURNING id, school_id, name, date_from::text, date_to::text, active, created_at`,
      [id, insertSchoolId, name.trim(), date_from, date_to]
    );
    const row = ins.rows[0];
    return NextResponse.json({
      year: row
        ? {
            ...row,
            date_from: String(row.date_from).slice(0, 10),
            date_to: String(row.date_to).slice(0, 10),
            isActive: row.active,
          }
        : null,
    });
  } catch (error) {
    console.error("POST school-years error:", error);
    return NextResponse.json({ message: "Błąd tworzenia roku szkolnego" }, { status: 500 });
  }
}
