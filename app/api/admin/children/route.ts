import { NextRequest, NextResponse } from "next/server";
import {
  createChild,
  getUserById,
  canAccessSchoolAdminApis,
  queryDb,
  getRegistrationSchoolId,
  type ChildAccessLevel,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { syncParentUserAccessLevel } from "@/lib/enrollment-sync";

const MANUAL_CHILD_ACCESS_LEVELS = ["NEW", "PROPOSED", "SIGNED", "COMPLETED"] as const;

function parseManualChildAccessLevel(raw: unknown): ChildAccessLevel | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase();
  return (MANUAL_CHILD_ACCESS_LEVELS as readonly string[]).includes(v)
    ? (v as ChildAccessLevel)
    : null;
}

export async function GET(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const actor = await getUserById(userId);
    if (!actor) return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });

    const scopeSchoolId =
      actor.role === "MANAGER"
        ? actor.school_id
        : actor.role === "ADMIN"
          ? getRegistrationSchoolId()
          : null;
    if (actor.role === "MANAGER" && !scopeSchoolId) {
      return NextResponse.json(
        { message: "Konto zarządcy nie ma przypisanej szkoły." },
        { status: 400 }
      );
    }
    if (!scopeSchoolId) {
      return NextResponse.json({ message: "Brak zakresu szkoły" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    const active = searchParams.get("active");

    const values: unknown[] = [scopeSchoolId];
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
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
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
         u.first_name AS parent_first_name,
         u.last_name AS parent_last_name,
         u.email AS parent_email,
         g.name AS group_name,
         c.created_at
       FROM children c
       JOIN users u ON u.id = c.parent_id AND u.school_id = c.school_id
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
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const actor = await getUserById(userId);
    if (!actor) return NextResponse.json({ message: "Nie znaleziono użytkownika" }, { status: 401 });

    const body = await request.json();
    const { parentId, firstName, lastName, birthDate, accessLevel: accessLevelRaw } = body;
    if (!parentId || !firstName || !lastName || !birthDate) {
      return NextResponse.json({ message: "Wszystkie pola są wymagane" }, { status: 400 });
    }

    const accessLevel = parseManualChildAccessLevel(accessLevelRaw) ?? "NEW";

    const parent = await getUserById(parentId);
    if (!parent || parent.role !== "PARENT" || !parent.school_id) {
      return NextResponse.json(
        { message: "Rodzic nie istnieje lub nie ma przypisanej szkoły" },
        { status: 400 }
      );
    }

    if (actor.role === "MANAGER") {
      if (!actor.school_id || parent.school_id !== actor.school_id) {
        return NextResponse.json(
          { message: "Możesz dodawać dzieci tylko rodzicom ze swojej szkoły" },
          { status: 403 }
        );
      }
    }

    const child = await createChild({
      parentId,
      firstName,
      lastName,
      birthDate: String(birthDate).slice(0, 10),
      schoolId: parent.school_id,
      accessLevel,
    });

    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({
      child: {
        child_id: child.id,
        parent_id: child.parent_id,
        first_name: child.first_name,
        last_name: child.last_name,
        birth_date: child.birth_date,
        active: true,
        confirmed: false,
        access_level: child.access_level,
        parent_first_name: parent.first_name,
        parent_last_name: parent.last_name,
        parent_email: parent.email,
        group_name: null,
      },
      message: "Dziecko zostało utworzone",
    });
  } catch (error) {
    console.error("Create child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas tworzenia dziecka" }, { status: 500 });
  }
}
