import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  getActiveSchoolYear,
  getRegistrationSchoolId,
  queryDb,
  resolveAdminPanelTenant,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

const HOLIDAY_TYPES = ["HOLIDAY", "PUBLIC", "SCHOOL", "CANCELLED"] as const;

async function ensureSchoolAdmin(request: NextRequest): Promise<string | null> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return null;
  return (await canAccessSchoolAdminApis(userId)) ? userId : null;
}

/** Z pola formularza / JSON: YYYY-MM-DD lub DD.MM.RRRR → YYYY-MM-DD */
function normalizeRequestYmd(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1] ?? t.slice(0, 10);
  const pl = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (pl) {
    const dd = pl[1].padStart(2, "0");
    const mm = pl[2].padStart(2, "0");
    return `${pl[3]}-${mm}-${dd}`;
  }
  return t.slice(0, 10);
}

/** Granice roku z wiersza PG (string YYYY-MM-DD lub Date — na wypadek innych zapytań). */
function ymdFromDbValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1] ?? v.slice(0, 10);
    return v.slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return "";
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
  try {
    const { searchParams } = new URL(request.url);
    const schoolYearId = searchParams.get("school_year_id");

    const withYearManager = `SELECT h.id, h.school_id, h.school_year_id, h.name, h.date_from::text, h.date_to::text, h.type, h.created_at
           FROM school_holidays h
           INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.id::text = $2 AND sy.school_id = $1
           WHERE h.date_from <= sy.date_to
             AND h.date_to >= sy.date_from
             AND (
               h.school_year_id IS NULL
               OR h.school_year_id::text = sy.id::text
             )
           ORDER BY h.date_from ASC`;

    const withYearAdmin = `SELECT h.id, h.school_id, h.school_year_id, h.name, h.date_from::text, h.date_to::text, h.type, h.created_at
           FROM school_holidays h
           INNER JOIN school_years sy ON sy.school_id = h.school_id AND sy.id::text = $1
           WHERE h.date_from <= sy.date_to
             AND h.date_to >= sy.date_from
             AND (
               h.school_year_id IS NULL
               OR h.school_year_id::text = sy.id::text
             )
           ORDER BY h.date_from ASC`;

    const r = await queryDb<{
      id: string;
      school_id: string;
      school_year_id: string | null;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      created_at: Date;
    }>(
      schoolYearId
        ? tenant.role === "MANAGER"
          ? withYearManager
          : withYearAdmin
        : tenant.role === "MANAGER"
          ? `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays
           WHERE school_id = $1
           ORDER BY date_from DESC`
          : `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays
           ORDER BY date_from DESC`,
      schoolYearId
        ? tenant.role === "MANAGER"
          ? [tenant.tenantSchoolId, schoolYearId]
          : [schoolYearId]
        : tenant.role === "MANAGER"
          ? [tenant.tenantSchoolId]
          : []
    );

    const holidays = r.rows.map((row) => ({
      ...row,
      date_from: String(row.date_from).slice(0, 10),
      date_to: String(row.date_to).slice(0, 10),
    }));

    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("GET school-holidays error:", error);
    return NextResponse.json({ message: "Błąd pobierania dni wolnych" }, { status: 500 });
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
      type = "HOLIDAY",
      school_id: bodySchoolId,
      schoolId: bodySchoolIdCamel,
    } = body as {
      name?: string;
      date_from?: string;
      date_to?: string;
      type?: string;
      school_id?: string;
      schoolId?: string;
    };
    if (!name?.trim() || !date_from || !date_to) {
      return NextResponse.json({ message: "Brak nazwy lub zakresu dat" }, { status: 400 });
    }
    if (!HOLIDAY_TYPES.includes(type as (typeof HOLIDAY_TYPES)[number])) {
      return NextResponse.json({ message: "Nieprawidłowy typ (HOLIDAY, PUBLIC, SCHOOL, CANCELLED)" }, { status: 400 });
    }

    const df = normalizeRequestYmd(date_from);
    const dt = normalizeRequestYmd(date_to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(df) || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      return NextResponse.json({ message: "Nieprawidłowy format dat (oczekiwane RRRR-MM-DD)" }, { status: 400 });
    }
    if (df > dt) {
      return NextResponse.json({ message: "Data „od” nie może być późniejsza niż „do”" }, { status: 400 });
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

    const active = await getActiveSchoolYear(insertSchoolId);
    if (!active) {
      return NextResponse.json({ message: "Brak aktywnego roku szkolnego" }, { status: 400 });
    }

    const yFrom = ymdFromDbValue((active as { date_from: unknown }).date_from);
    const yTo = ymdFromDbValue((active as { date_to: unknown }).date_to);
    const yearId = String((active as { id: string }).id);

    if (!yFrom || !yTo || df < yFrom || dt > yTo) {
      return NextResponse.json(
        { message: `Dzień wolny poza zakresem aktywnego roku szkolnego (${yFrom} — ${yTo})` },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const ins = await queryDb(
      `INSERT INTO school_holidays (id, school_id, school_year_id, name, date_from, date_to, type, created_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, NOW())
       RETURNING id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at`,
      [id, insertSchoolId, yearId, name.trim(), df, dt, type]
    );
    const row = ins.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      holiday: {
        ...row,
        date_from: String(row.date_from).slice(0, 10),
        date_to: String(row.date_to).slice(0, 10),
      },
    });
  } catch (error) {
    console.error("POST school-holidays error:", error);
    return NextResponse.json({ message: "Błąd dodawania dnia wolnego" }, { status: 500 });
  }
}
