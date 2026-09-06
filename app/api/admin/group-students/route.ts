import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import {
  assertChildInSchool,
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { childHasSignedContract } from "@/lib/enrollment-sync";
import { normalizeLessonsPerWeek } from "@/lib/lessons-per-week";

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId, childId, lessonsPerWeek } = body as {
      groupId?: string;
      childId?: string;
      lessonsPerWeek?: number | string | null;
    };
    if (!groupId || !childId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const groupMeta = await queryDb<{ lessons_per_week: number | null }>(
      `SELECT lessons_per_week FROM groups WHERE id = $1 LIMIT 1`,
      [groupId]
    );
    const groupLpw = normalizeLessonsPerWeek(groupMeta.rows[0]?.lessons_per_week) ?? 1;
    let membershipLpw = normalizeLessonsPerWeek(lessonsPerWeek);
    if (groupLpw <= 1) {
      membershipLpw = 1;
    } else if (membershipLpw == null) {
      membershipLpw = 2;
    }

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

    const hasSignedContract = await childHasSignedContract(childId);
    await queryDb(`UPDATE children SET confirmed = $2 WHERE id = $1`, [
      childId,
      hasSignedContract,
    ]);

    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    await queryDb(
      `INSERT INTO group_students (
         id, school_id, group_id, child_id, enrolled_at, school_year_id, lessons_per_week
       )
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [
        randomUUID(),
        ctx.schoolId,
        groupId,
        childId,
        activeYear?.id ?? null,
        membershipLpw,
      ]
    );
    return NextResponse.json({
      message: hasSignedContract
        ? "Uczeń został dodany do grupy (potwierdzony — podpisana umowa)"
        : "Uczeń został dodany do grupy (niepotwierdzony — brak podpisanej umowy)",
      confirmed: hasSignedContract,
      lessonsPerWeek: membershipLpw,
    });
  } catch (error) {
    console.error("POST group-students error:", error);
    return NextResponse.json({ message: "Błąd dodawania ucznia do grupy" }, { status: 500 });
  }
}
