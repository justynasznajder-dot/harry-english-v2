import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<boolean> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return false;
  return canAccessSchoolAdminApis(userId);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await ensureAdmin(request))) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await queryDb(`UPDATE group_students SET left_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ message: "Uczeń został usunięty z grupy" });
  } catch (error) {
    console.error("DELETE group-student error:", error);
    return NextResponse.json({ message: "Błąd usuwania ucznia z grupy" }, { status: 500 });
  }
}
