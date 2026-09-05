import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { buildLocationStoredName } from "@/lib/location-display";

type RouteCtx = { params: Promise<{ id: string }> };

type LocationUpdateBody = {
  active?: boolean;
  name?: string;
  town?: string | null;
  facility?: string | null;
  address?: string | null;
  sort_order?: number | string;
  is_featured?: boolean;
  is_new?: boolean;
  is_special?: boolean;
};

function parseSortOrder(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 9999) {
    return null;
  }
  return parsed;
}

export async function PUT(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  const { tenant } = ctx;

  try {
    let body: LocationUpdateBody = {};
    try {
      body = (await request.json()) as LocationUpdateBody;
    } catch {
      /* brak body - domyślnie dezaktywacja */
    }

    const hasContentEdit =
      body.name !== undefined ||
      body.town !== undefined ||
      body.facility !== undefined ||
      body.address !== undefined ||
      body.is_special !== undefined;
    const hasDisplayEdit =
      body.sort_order !== undefined ||
      body.is_featured !== undefined ||
      body.is_new !== undefined;

    if (hasContentEdit) {
      const existing = await queryDb<{
        name: string;
        town: string | null;
        facility: string | null;
        address: string | null;
        is_special: boolean;
        is_featured: boolean;
        is_new: boolean;
        sort_order: number;
      }>(
        tenant.role === "MANAGER"
          ? `SELECT name, town, facility, address, is_special, is_featured, is_new, sort_order
             FROM locations WHERE id = $1 AND school_id = $2 LIMIT 1`
          : `SELECT name, town, facility, address, is_special, is_featured, is_new, sort_order
             FROM locations WHERE id = $1 LIMIT 1`,
        tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id]
      );
      const current = existing.rows[0];
      if (!current) {
        return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
      }

      const isSpecial =
        typeof body.is_special === "boolean" ? body.is_special : current.is_special;
      const town =
        body.town !== undefined
          ? body.town != null
            ? String(body.town).trim()
            : ""
          : String(current.town ?? "").trim();
      const facility =
        body.facility !== undefined
          ? body.facility != null
            ? String(body.facility).trim()
            : ""
          : String(current.facility ?? "").trim();
      const specialName =
        body.name !== undefined ? String(body.name ?? "").trim() : current.name;

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

      const address =
        body.address !== undefined
          ? body.address != null && String(body.address).trim() !== ""
            ? String(body.address).trim()
            : null
          : current.address;

      const sortOrderParam = parseSortOrder(body.sort_order);
      if (body.sort_order !== undefined && sortOrderParam === null) {
        return NextResponse.json(
          { message: "Kolejność musi być liczbą całkowitą od 0 do 9999" },
          { status: 400 }
        );
      }

      let featuredParam: boolean | null = null;
      if (body.is_featured !== undefined) {
        if (typeof body.is_featured !== "boolean") {
          return NextResponse.json({ message: "Nieprawidłowa wartość wyróżnienia" }, { status: 400 });
        }
        featuredParam = body.is_featured;
      }

      let isNewParam: boolean | null = null;
      if (body.is_new !== undefined) {
        if (typeof body.is_new !== "boolean") {
          return NextResponse.json({ message: "Nieprawidłowa wartość Nowość!" }, { status: 400 });
        }
        isNewParam = body.is_new;
      }

      const update = await queryDb<{ id: string }>(
        tenant.role === "MANAGER"
          ? `UPDATE locations
             SET name = $3,
                 town = $4,
                 facility = $5,
                 address = $6,
                 is_special = $7,
                 sort_order = COALESCE($8, sort_order),
                 is_featured = COALESCE($9, is_featured),
                 is_new = COALESCE($10, is_new)
             WHERE id = $1 AND school_id = $2
             RETURNING id`
          : `UPDATE locations
             SET name = $2,
                 town = $3,
                 facility = $4,
                 address = $5,
                 is_special = $6,
                 sort_order = COALESCE($7, sort_order),
                 is_featured = COALESCE($8, is_featured),
                 is_new = COALESCE($9, is_new)
             WHERE id = $1
             RETURNING id`,
        tenant.role === "MANAGER"
          ? [
              id,
              ctx.schoolId,
              name,
              isSpecial ? null : town,
              isSpecial ? null : facility,
              address,
              isSpecial,
              sortOrderParam,
              featuredParam,
              isNewParam,
            ]
          : [
              id,
              name,
              isSpecial ? null : town,
              isSpecial ? null : facility,
              address,
              isSpecial,
              sortOrderParam,
              featuredParam,
              isNewParam,
            ]
      );
      if (!update.rows[0]) {
        return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
      }
      return NextResponse.json({ message: "Lokalizacja została zaktualizowana" });
    }

    if (hasDisplayEdit) {
      const sortOrderParam = parseSortOrder(body.sort_order);
      if (body.sort_order !== undefined && sortOrderParam === null) {
        return NextResponse.json(
          { message: "Kolejność musi być liczbą całkowitą od 0 do 9999" },
          { status: 400 }
        );
      }

      let featuredParam: boolean | null = null;
      if (body.is_featured !== undefined) {
        if (typeof body.is_featured !== "boolean") {
          return NextResponse.json({ message: "Nieprawidłowa wartość wyróżnienia" }, { status: 400 });
        }
        featuredParam = body.is_featured;
      }

      let isNewParam: boolean | null = null;
      if (body.is_new !== undefined) {
        if (typeof body.is_new !== "boolean") {
          return NextResponse.json({ message: "Nieprawidłowa wartość Nowość!" }, { status: 400 });
        }
        isNewParam = body.is_new;
      }

      const update = await queryDb<{ id: string }>(
        tenant.role === "MANAGER"
          ? `UPDATE locations
             SET sort_order = COALESCE($3, sort_order),
                 is_featured = COALESCE($4, is_featured),
                 is_new = COALESCE($5, is_new)
             WHERE id = $1 AND school_id = $2
             RETURNING id`
          : `UPDATE locations
             SET sort_order = COALESCE($2, sort_order),
                 is_featured = COALESCE($3, is_featured),
                 is_new = COALESCE($4, is_new)
             WHERE id = $1
             RETURNING id`,
        tenant.role === "MANAGER"
          ? [id, ctx.schoolId, sortOrderParam, featuredParam, isNewParam]
          : [id, sortOrderParam, featuredParam, isNewParam]
      );
      if (!update.rows[0]) {
        return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
      }
      return NextResponse.json({ message: "Ustawienia wyświetlania zostały zapisane" });
    }

    const nextActive = typeof body.active === "boolean" ? body.active : false;

    const update = await queryDb<{ id: string }>(
      tenant.role === "MANAGER"
        ? `UPDATE locations SET active = $3 WHERE id = $1 AND school_id = $2 RETURNING id`
        : `UPDATE locations SET active = $2 WHERE id = $1 RETURNING id`,
      tenant.role === "MANAGER" ? [id, ctx.schoolId, nextActive] : [id, nextActive]
    );

    if (!update.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
    }

    return NextResponse.json({
      message: nextActive
        ? "Lokalizacja została ponownie oznaczona jako aktywna"
        : "Lokalizacja została oznaczona jako nieaktywna",
    });
  } catch (error) {
    console.error("PUT admin/locations/[id]:", error);
    return NextResponse.json(
      { message: "Nie udało się zaktualizować lokalizacji" },
      { status: 500 }
    );
  }
}
