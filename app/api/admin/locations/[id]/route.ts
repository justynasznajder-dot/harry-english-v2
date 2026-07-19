import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

type RouteCtx = { params: Promise<{ id: string }> };

type LocationUpdateBody = {
  active?: boolean;
  name?: string;
  address?: string | null;
  sort_order?: number | string;
  is_featured?: boolean;
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

    const hasNameEdit = body.name !== undefined || body.address !== undefined;
    const hasDisplayEdit = body.sort_order !== undefined || body.is_featured !== undefined;

    if (hasNameEdit) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ message: "Nazwa lokalizacji jest wymagana" }, { status: 400 });
      }
      const address =
        body.address != null && String(body.address).trim() !== "" ? String(body.address).trim() : null;

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

      const update = await queryDb<{ id: string }>(
        tenant.role === "MANAGER"
          ? `UPDATE locations
             SET name = $3,
                 address = $4,
                 sort_order = COALESCE($5, sort_order),
                 is_featured = COALESCE($6, is_featured)
             WHERE id = $1 AND school_id = $2
             RETURNING id`
          : `UPDATE locations
             SET name = $2,
                 address = $3,
                 sort_order = COALESCE($4, sort_order),
                 is_featured = COALESCE($5, is_featured)
             WHERE id = $1
             RETURNING id`,
        tenant.role === "MANAGER"
          ? [id, ctx.schoolId, name, address, sortOrderParam, featuredParam]
          : [id, name, address, sortOrderParam, featuredParam]
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

      const update = await queryDb<{ id: string }>(
        tenant.role === "MANAGER"
          ? `UPDATE locations
             SET sort_order = COALESCE($3, sort_order),
                 is_featured = COALESCE($4, is_featured)
             WHERE id = $1 AND school_id = $2
             RETURNING id`
          : `UPDATE locations
             SET sort_order = COALESCE($2, sort_order),
                 is_featured = COALESCE($3, is_featured)
             WHERE id = $1
             RETURNING id`,
        tenant.role === "MANAGER"
          ? [id, ctx.schoolId, sortOrderParam, featuredParam]
          : [id, sortOrderParam, featuredParam]
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
