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

    const activeMembership = await queryDb<{ id: string; group_id: string; group_name: string }>(
      `SELECT gs.id, gs.group_id, g.name AS group_name
       FROM group_students gs
       INNER JOIN groups g ON g.id = gs.group_id AND g.school_id = $2
       WHERE gs.child_id = $1
         AND gs.left_at IS NULL
         AND (
           gs.school_year_id IS NULL
           OR EXISTS (
             SELECT 1
             FROM school_years sy
             WHERE sy.id = gs.school_year_id
               AND sy.school_id = $2
               AND sy.active = TRUE
           )
         )
       ORDER BY gs.enrolled_at DESC NULLS LAST
       LIMIT 1`,
      [childId, ctx.schoolId]
    );
    if (activeMembership.rows[0]) {
      const current = activeMembership.rows[0];
      if (current.group_id === groupId) {
        return NextResponse.json(
          { message: "Uczeń jest już aktywnie przypisany do tej grupy" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          message: `Uczeń jest już w grupie „${current.group_name}”. Najpierw usuń go z tamtej grupy.`,
        },
        { status: 409 }
      );
    }

    const hasSignedContract = await childHasSignedContract(childId);
    await queryDb(`UPDATE children SET confirmed = $2 WHERE id = $1`, [
      childId,
      hasSignedContract,
    ]);

    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    const schoolYearId = activeYear?.id ?? null;

    // Ponowne dodanie po „Usuń z grupy”: ten sam group+child+rok → unique constraint.
    // Przywróć istniejące członkostwo zamiast INSERT.
    const inactiveSame = await queryDb<{ id: string }>(
      `SELECT id
       FROM group_students
       WHERE group_id = $1
         AND child_id = $2
         AND left_at IS NOT NULL
         AND school_year_id IS NOT DISTINCT FROM $3::text
       ORDER BY left_at DESC
       LIMIT 1`,
      [groupId, childId, schoolYearId]
    );

    if (inactiveSame.rows[0]) {
      await queryDb(
        `UPDATE group_students
         SET left_at = NULL,
             enrolled_at = NOW(),
             lessons_per_week = $2,
             school_id = $3
         WHERE id = $1`,
        [inactiveSame.rows[0].id, membershipLpw, ctx.schoolId]
      );
      return NextResponse.json({
        message: hasSignedContract
          ? "Uczeń został ponownie dodany do grupy (potwierdzony — podpisana umowa)"
          : "Uczeń został ponownie dodany do grupy (niepotwierdzony — brak podpisanej umowy)",
        confirmed: hasSignedContract,
        lessonsPerWeek: membershipLpw,
        reactivated: true,
      });
    }

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
        schoolYearId,
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
