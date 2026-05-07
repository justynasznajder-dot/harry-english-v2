import { getAllChildren, getChildrenByParentId, createChild, updateChild, canAccessSchoolAdminApis } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";

// GET - pobierz studentów z filtrami
export async function GET(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const filterUserId = searchParams.get("userId");
    const filterActive = searchParams.get("active");
    let children = filterUserId ? await getChildrenByParentId(filterUserId) : await getAllChildren();
    if (filterActive !== null) children = children.filter((c) => c.active === (filterActive === "true"));

    return NextResponse.json({
      students: children.map((c) => ({
        student_id: c.id,
        user_id: c.parent_id,
        first_name: c.first_name,
        last_name: c.last_name,
        birth_year: c.birth_date.slice(0, 4),
        location: "",
        active: c.active,
        resignation_requested: c.resignation_requested,
        resignation_reason: c.resignation_reason,
        resignation_date: c.resignation_date,
        created_at: c.created_at,
      })),
    });
  } catch (error) {
    console.error("Get students error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas pobierania studentów" }, { status: 500 });
  }
}

// POST - dodaj nowego studenta
export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const body = await request.json();
    const child = await createChild({
      parentId: body.userId,
      firstName: body.firstName,
      lastName: body.lastName,
      birthDate: `${body.birthYear}-01-01`,
    });
    if (body.active !== undefined) await updateChild(child.id, { active: Boolean(body.active) });

    return NextResponse.json({
      student: {
        student_id: child.id,
        user_id: child.parent_id,
        first_name: child.first_name,
        last_name: child.last_name,
        birth_year: child.birth_date.slice(0, 4),
        location: "",
        active: body.active ?? child.active,
      },
      message: "Student został utworzony",
    });
  } catch (error) {
    console.error("Create student error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas tworzenia studenta" }, { status: 500 });
  }
}
