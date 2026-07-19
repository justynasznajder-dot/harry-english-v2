import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, resolveInsertSchoolId } from "@/lib/admin-school-context";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const rows =
      ctx.tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            name: string;
            address: string | null;
            active: boolean;
            sort_order: number;
            is_featured: boolean;
          }>(
            `SELECT id, name, address, active, sort_order, is_featured
             FROM locations
             WHERE school_id = $1
             ORDER BY sort_order ASC, is_featured DESC, name ASC`,
            [ctx.schoolId]
          )
        : await queryDb<{
            id: string;
            name: string;
            address: string | null;
            active: boolean;
            sort_order: number;
            is_featured: boolean;
          }>(
            `SELECT id, name, address, active, sort_order, is_featured
             FROM locations
             WHERE active = TRUE
             ORDER BY sort_order ASC, is_featured DESC, name ASC`
          );

    return NextResponse.json({ locations: rows.rows });
  } catch (e) {
    console.error("GET admin/locations:", e);
    return NextResponse.json({ message: "Błąd pobierania lokalizacji" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

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

    const insertSchoolId = resolveInsertSchoolId(ctx.tenant, {
      bodySchoolId: body?.school_id,
      bodySchoolIdCamel: body?.schoolId,
    });
    if (!insertSchoolId) {
      return NextResponse.json(
        {
          message:
            ctx.tenant.role === "MANAGER"
              ? "Manager może dodać lokalizację tylko dla swojej szkoły"
              : "Brak identyfikatora szkoły — podaj schoolId lub ustaw SCHOOL_ID w środowisku.",
        },
        { status: ctx.tenant.role === "MANAGER" ? 403 : 400 }
      );
    }

    let sortOrder = 100;
    if (body?.sort_order !== undefined) {
      const parsed = Number(body.sort_order);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
        return NextResponse.json(
          { message: "Kolejność musi być liczbą całkowitą od 0 do 9999" },
          { status: 400 }
        );
      }
      sortOrder = parsed;
    }

    const inserted = await queryDb<{ id: string }>(
      `INSERT INTO locations (id, school_id, name, address, active, sort_order)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING id`,
      [randomUUID(), insertSchoolId, name, address, sortOrder]
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
