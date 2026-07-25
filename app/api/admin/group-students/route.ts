import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import {
  assertChildInSchool,
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId, childId } = body as { groupId?: string; childId?: string };
    if (!groupId || !childId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const child = await assertChildInSchool(childId, ctx.schoolId);
    if (!child.ok) return tenantNotFoundResponse("Nie znaleziono ucznia");

    const exists = await queryDb<{ id: string }>(
      `SELECT gs.id
       FROM group_students gs
       INNER JOIN groups g ON g.id = gs.group_id AND g.school_id = $3
       WHERE gs.group_id = $1 AND gs.child_id = $2 AND gs.left_at IS NULL
       LIMIT 1`,
      [groupId, childId, ctx.schoolId]
    );
    if (exists.rows[0]) {
      return NextResponse.json(
        { message: "Uczeń jest już aktywnie przypisany do grupy" },
        { status: 409 }
      );
    }

    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    await queryDb(
      `INSERT INTO group_students (id, school_id, group_id, child_id, enrolled_at, school_year_id)
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [randomUUID(), ctx.schoolId, groupId, childId, activeYear?.id ?? null]
    );
    return NextResponse.json({ message: "Uczeń został dodany do grupy" });
  } catch (error) {
    console.error("POST group-students error:", error);
    return NextResponse.json({ message: "Błąd dodawania ucznia do grupy" }, { status: 500 });
  }
}
