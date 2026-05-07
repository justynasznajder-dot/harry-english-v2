import { NextRequest, NextResponse } from "next/server";
import { deleteChild, getAllChildren, canAccessSchoolAdminApis, restoreChild, updateChild } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();

    if (body.restore === true) {
      const restored = await restoreChild(id);
      if (!restored) return NextResponse.json({ message: "Dziecko nie zostało znalezione" }, { status: 404 });
      return NextResponse.json({ message: "Dziecko zostało przywrócone" });
    }

    const updated = await updateChild(id, {
      first_name: body.first_name,
      last_name: body.last_name,
      birth_date: body.birth_date,
      active: body.active,
      confirmed: body.confirmed,
    });

    if (!updated) return NextResponse.json({ message: "Dziecko nie zostało znalezione" }, { status: 404 });

    const child = (await getAllChildren()).find((c) => c.id === id);
    return NextResponse.json({ child, message: "Dziecko zostało zaktualizowane" });
  } catch (error) {
    console.error("Update child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas aktualizacji dziecka" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const { id } = await params;
    const deleted = await deleteChild(id);
    if (!deleted) return NextResponse.json({ message: "Dziecko nie zostało znalezione" }, { status: 404 });

    return NextResponse.json({ message: "Dziecko zostało oznaczone jako nieaktywne" });
  } catch (error) {
    console.error("Delete child error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas usuwania dziecka" }, { status: 500 });
  }
}
