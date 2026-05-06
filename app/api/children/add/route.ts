import { NextRequest, NextResponse } from "next/server";
import { createChild, getChildrenByParentId, getUserById } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const authToken = request.cookies.get("auth-token");
    if (!authToken) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    let userId: string;
    try {
      const tokenData = Buffer.from(authToken.value, "base64").toString();
      userId = tokenData.split(":")[0];
    } catch {
      return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ message: "Użytkownik nie istnieje" }, { status: 404 });
    }

    const body = await request.json();
    const { firstName, lastName, birthDate } = body;
    if (!firstName?.trim() || !lastName?.trim() || !birthDate) {
      return NextResponse.json({ message: "Wszystkie pola są wymagane" }, { status: 400 });
    }

    const newChild = await createChild({
      parentId: userId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: String(birthDate).slice(0, 10),
    });

    const allChildren = await getChildrenByParentId(userId);

    return NextResponse.json({
      message: "Dziecko zostało dodane pomyślnie",
      child: {
        childId: newChild.id,
        firstName: newChild.first_name,
        lastName: newChild.last_name,
        birthDate: newChild.birth_date,
        active: newChild.active,
      },
      children: allChildren.map((c) => ({
        childId: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        birthDate: c.birth_date,
        active: c.active,
      })),
    });
  } catch (error) {
    console.error("Add child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas dodawania dziecka" }, { status: 500 });
  }
}
