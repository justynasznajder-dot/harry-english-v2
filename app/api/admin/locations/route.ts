import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, resolveInsertSchoolId } from "@/lib/admin-school-context";
import { buildLocationStoredName } from "@/lib/location-display";

const LOCATION_SELECT = `id, name, town, facility, address, active, sort_order, is_featured, is_new, is_special`;

function parseSortOrder(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
    return null;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const rows =
      ctx.tenant.role === "MANAGER"
        ? await queryDb<{
            id: string;
            name: string;
            town: string | null;
            facility: string | null;
            address: string | null;
            active: boolean;
            sort_order: number;
            is_featured: boolean;
            is_new: boolean;
            is_special: boolean;
          }>(
            `SELECT ${LOCATION_SELECT}
             FROM locations
             WHERE school_id = $1
             ORDER BY is_special ASC, sort_order ASC, is_featured DESC, name ASC`,
            [ctx.schoolId]
          )
        : await queryDb<{
            id: string;
            name: string;
            town: string | null;
            facility: string | null;
            address: string | null;
            active: boolean;
            sort_order: number;
            is_featured: boolean;
            is_new: boolean;
            is_special: boolean;
          }>(
            `SELECT ${LOCATION_SELECT}
             FROM locations
             WHERE active = TRUE
             ORDER BY is_special ASC, sort_order ASC, is_featured DESC, name ASC`
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
    const isSpecial = body?.is_special === true || body?.isSpecial === true;
    const town = typeof body?.town === "string" ? body.town.trim() : "";
    const facility = typeof body?.facility === "string" ? body.facility.trim() : "";
    const specialName =
      typeof body?.name === "string"
        ? body.name.trim()
        : typeof body?.specialName === "string"
          ? body.specialName.trim()
          : "";

    const name = buildLocationStoredName({
      isSpecial,
      town,
      facility,
      specialName,
    });

    if (!name) {
      return NextResponse.json(
        {
          message: isSpecial
            ? "Nazwa pozycji specjalnej jest wymagana"
            : "Podaj miejscowość i placówkę",
        },
        { status: 400 }
      );
    }
    if (!isSpecial && (!town || !facility)) {
      return NextResponse.json(
        { message: "Podaj miejscowość i placówkę" },
        { status: 400 }
      );
    }

    const addressRaw = body?.address;
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
    if (body?.sort_order !== undefined || body?.sortOrder !== undefined) {
      const parsed = parseSortOrder(body?.sort_order ?? body?.sortOrder);
      if (parsed === null) {
        return NextResponse.json(
          { message: "Kolejność musi być liczbą całkowitą od 0 do 9999" },
          { status: 400 }
        );
      }
      sortOrder = parsed;
    }

    const isFeatured = body?.is_featured === true || body?.isFeatured === true;
    const isNew = body?.is_new === true || body?.isNew === true;

    const inserted = await queryDb<{ id: string }>(
      `INSERT INTO locations (
         id, school_id, name, town, facility, address, active,
         sort_order, is_featured, is_new, is_special
       )
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10)
       RETURNING id`,
      [
        randomUUID(),
        insertSchoolId,
        name,
        isSpecial ? null : town,
        isSpecial ? null : facility,
        address,
        sortOrder,
        isFeatured,
        isNew,
        isSpecial,
      ]
    );

    return NextResponse.json({
      id: inserted.rows[0].id,
      message: isSpecial ? "Pozycja specjalna została dodana" : "Lokalizacja została dodana",
    });
  } catch (e) {
    console.error("POST admin/locations:", e);
    return NextResponse.json({ message: "Błąd dodawania lokalizacji" }, { status: 500 });
  }
}
