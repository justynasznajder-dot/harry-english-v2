import { NextRequest, NextResponse } from "next/server";
import { DuplicateEnrollmentError, getUserById, insertEnrollmentRequestsForParent, queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

const LOCATION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    const active = searchParams.get("active");

    const values: unknown[] = [ctx.schoolId];
    const where: string[] = ["c.school_id = $1"];
    if (parentId) {
      values.push(parentId);
      where.push(`c.parent_id = $${values.length}`);
    }
    if (active !== null) {
      values.push(active === "true");
      where.push(`c.active = $${values.length}`);
    }

    const rows = await queryDb<{
      child_id: string;
      parent_id: string;
      first_name: string;
      last_name: string;
      birth_date: string;
      active: boolean;
      confirmed: boolean;
      access_level: string | null;
      enrollment_request_id: string | null;
      client_number: string | null;
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      parent_client_number: string | null;
      group_name: string | null;
      created_at: Date;
    }>(
      `SELECT
         c.id AS child_id,
         c.parent_id,
         c.first_name,
         c.last_name,
         c.birth_date::text AS birth_date,
         c.active,
         c.confirmed,
         c.access_level,
         c.enrollment_request_id,
         c.client_number,
         u.first_name AS parent_first_name,
         u.last_name AS parent_last_name,
         u.email AS parent_email,
         u.client_number AS parent_client_number,
         g.name AS group_name,
         c.created_at
       FROM children c
       JOIN users u ON u.id = c.parent_id
       LEFT JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       LEFT JOIN groups g ON g.id = gs.group_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC`,
      values
    );

    return NextResponse.json({
      children: rows.rows,
    });
  } catch (error) {
    console.error("Get children error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas pobierania dzieci" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const {
      parentId,
      firstName,
      lastName,
      birthDate,
      preferredLocationId: preferredLocationIdRaw,
    } = body as {
      parentId?: string;
      firstName?: string;
      lastName?: string;
      birthDate?: string;
      preferredLocationId?: string | null;
    };

    if (!parentId || !firstName?.trim() || !lastName?.trim() || !birthDate) {
      return NextResponse.json({ message: "Wszystkie pola są wymagane" }, { status: 400 });
    }

    const parent = await getUserById(parentId);
    if (!parent || parent.role !== "PARENT" || !parent.school_id) {
      return NextResponse.json(
        { message: "Rodzic nie istnieje lub nie ma przypisanej szkoły" },
        { status: 400 }
      );
    }

    if (ctx.tenant.role === "MANAGER" && parent.school_id !== ctx.schoolId) {
      return NextResponse.json(
        { message: "Możesz dodawać zgłoszenia tylko dla rodziców ze swojej szkoły" },
        { status: 403 }
      );
    }

    const preferredLocationId = String(preferredLocationIdRaw ?? "").trim() || null;
    if (preferredLocationId) {
      if (!LOCATION_ID_REGEX.test(preferredLocationId)) {
        return NextResponse.json({ message: "Nieprawidłowa lokalizacja" }, { status: 400 });
      }
      const locOk = await queryDb<{ ok: boolean }>(
        `SELECT TRUE AS ok
         FROM locations
         WHERE id = $1 AND school_id = $2 AND active = TRUE
         LIMIT 1`,
        [preferredLocationId, parent.school_id]
      );
      if (!locOk.rows[0]?.ok) {
        return NextResponse.json({ message: "Nieprawidłowa lokalizacja" }, { status: 400 });
      }
    }

    const { enrollmentCount } = await insertEnrollmentRequestsForParent({
      parentId,
      children: [
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthDate: String(birthDate).slice(0, 10),
          preferredLocationId,
        },
      ],
    });

    return NextResponse.json({
      enrollmentCount,
      message: "Utworzono zgłoszenie — przejdź do Zgłoszeń, aby wysłać propozycję grupy",
    });
  } catch (error) {
    console.error("Create child enrollment error:", error);
    if (error instanceof DuplicateEnrollmentError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("Rodzic nie istnieje")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Wystąpił błąd podczas tworzenia zgłoszenia" }, { status: 500 });
  }
}
