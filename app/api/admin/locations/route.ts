import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getRegistrationSchoolId,
  queryDb,
  resolveAdminPanelTenant,
} from "@/lib/db";

function tokenToUserId(token: string): string | null {
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] || null;
  } catch {
    return null;
  }
}

async function ensureAdmin(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  const userId = tokenToUserId(token);
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

  try {
    const rows =
      tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            name: string;
            address: string | null;
            active: boolean;
          }>(
            `SELECT id, name, address, active
             FROM locations
             WHERE school_id = $1
             ORDER BY name ASC`,
            [tenant.tenantSchoolId]
          )
        : await queryDb<{
            id: string;
            name: string;
            address: string | null;
            active: boolean;
          }>(
            `SELECT id, name, address, active
             FROM locations
             ORDER BY name ASC`
          );

    return NextResponse.json({ locations: rows.rows });
  } catch (e) {
    console.error("GET admin/locations:", e);
    return NextResponse.json({ message: "Błąd pobierania lokalizacji" }, { status: 500 });
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
    const nameRaw = body?.name;
    const addressRaw = body?.address;
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (!name) {
      return NextResponse.json({ message: "Nazwa lokalizacji jest wymagana" }, { status: 400 });
    }

    const address =
      addressRaw != null && String(addressRaw).trim() !== "" ? String(addressRaw).trim() : null;

    let insertSchoolId: string | null =
      tenant.role === "MANAGER" ? tenant.tenantSchoolId : null;
    if (tenant.role === "ADMIN") {
      const fromBody =
        (typeof body?.school_id === "string" && body.school_id.trim()) ||
        (typeof body?.schoolId === "string" && body.schoolId.trim()) ||
        "";
      insertSchoolId = fromBody || getRegistrationSchoolId() || null;
    }
    if (!insertSchoolId) {
      return NextResponse.json(
        {
          message:
            "Brak identyfikatora szkoły — konto zarządcy musi mieć przypisaną szkołę lub podaj schoolId (ADMIN).",
        },
        { status: 400 }
      );
    }

    const inserted = await queryDb<{ id: string }>(
      `INSERT INTO locations (id, school_id, name, address, active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [randomUUID(), insertSchoolId, name, address]
    );

    return NextResponse.json({
      id: inserted.rows[0].id,
      message: "Lokalizacja została dodana",
    });
  } catch (e) {
    console.error("POST admin/locations:", e);
    return NextResponse.json({ message: "Błąd dodawania lokalizacji" }, { status: 500 });
  }
}
