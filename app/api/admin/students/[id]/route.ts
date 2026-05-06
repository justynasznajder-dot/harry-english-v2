import { deleteChild, getAllChildren, canAccessSchoolAdminApis, restoreChild, updateChild } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// PUT - aktualizuj studenta
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = request.cookies.get("auth-token");
    if (!authToken) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    const userId = Buffer.from(authToken.value, "base64").toString().split(":")[0];
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    if (body.restore === true) {
      const restored = await restoreChild(id);
      if (!restored) return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
      return NextResponse.json({ message: "Student został przywrócony" });
    }

    const ok = await updateChild(id, {
      first_name: body.first_name,
      last_name: body.last_name,
      birth_date: body.birth_year ? `${body.birth_year}-01-01` : undefined,
      active: body.active,
      resignation_requested: body.resignation_requested,
      resignation_reason: body.resignation_reason,
      resignation_date: body.resignation_date,
    });
    if (!ok) return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
    const child = (await getAllChildren()).find((c) => c.id === id);
    return NextResponse.json({ student: child ? { student_id: child.id } : null, message: "Student został zaktualizowany" });
  } catch (error) {
    console.error("Update student error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas aktualizacji studenta" }, { status: 500 });
  }
}

// DELETE - usuń studenta
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = request.cookies.get("auth-token");
    if (!authToken) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    const userId = Buffer.from(authToken.value, "base64").toString().split(":")[0];
    if (!(await canAccessSchoolAdminApis(userId))) return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    const { id } = await params;
    const deleted = await deleteChild(id);
    if (!deleted) return NextResponse.json({ message: "Student nie został znaleziony" }, { status: 404 });
    return NextResponse.json({ message: "Student został oznaczony jako były uczeń" });
  } catch (error) {
    console.error("Delete student error:", error);
    return NextResponse.json({ message: "Wystąpił błąd podczas usuwania studenta" }, { status: 500 });
  }
}
