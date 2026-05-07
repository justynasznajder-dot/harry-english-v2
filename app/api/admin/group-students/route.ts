import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

async function ensureAdmin(request: NextRequest): Promise<boolean> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) return false;
  return canAccessSchoolAdminApis(userId);
}

export async function POST(request: NextRequest) {
  if (!(await ensureAdmin(request))) {
    return NextResponse.json({ message: "Brak autoryzacji" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { groupId, childId } = body as { groupId?: string; childId?: string };
    if (!groupId || !childId) return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });

    const exists = await queryDb<{ id: string }>(
      `SELECT id FROM group_students WHERE group_id = $1 AND child_id = $2 AND left_at IS NULL LIMIT 1`,
      [groupId, childId]
    );
    if (exists.rows[0]) {
      return NextResponse.json({ message: "Uczeń jest już aktywnie przypisany do grupy" }, { status: 409 });
    }

    await queryDb(
      `INSERT INTO group_students (id, group_id, child_id, enrolled_at)
       VALUES ($1, $2, $3, NOW())`,
      [randomUUID(), groupId, childId]
    );
    return NextResponse.json({ message: "Uczeń został dodany do grupy" });
  } catch (error) {
    console.error("POST group-students error:", error);
    return NextResponse.json({ message: "Błąd dodawania ucznia do grupy" }, { status: 500 });
  }
}
