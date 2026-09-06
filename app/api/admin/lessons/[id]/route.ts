import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Usuwa pojedyncze zajęcia z kalendarza.
 * Tylko status SCHEDULED — COMPLETED i CANCELLED nie można usuwać.
 * Fizyczny DELETE (nie CANCELLED), żeby regeneracja mogła zapełnić slot ponownie.
 */
export async function DELETE(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: lessonId } = await context.params;

  try {
    const lessonRes = await queryDb<{
      id: string;
      status: string;
      group_id: string;
      school_id: string;
    }>(
      `SELECT l.id, l.status::text AS status, l.group_id, g.school_id
       FROM lessons l
       JOIN groups g ON g.id = l.group_id
       WHERE l.id = $1
         ${ctx.tenant.role === "MANAGER" ? "AND g.school_id = $2" : ""}
       LIMIT 1`,
      ctx.tenant.role === "MANAGER" ? [lessonId, ctx.schoolId] : [lessonId],
    );

    const lesson = lessonRes.rows[0];
    if (!lesson) {
      return NextResponse.json({ message: "Nie znaleziono zajęć" }, { status: 404 });
    }

    if (ctx.tenant.role === "MANAGER") {
      const group = await assertGroupInSchool(lesson.group_id, ctx.schoolId);
      if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");
    }

    if (lesson.status === "COMPLETED") {
      return NextResponse.json(
        { message: "Nie można usunąć odbytych zajęć" },
        { status: 400 },
      );
    }

    if (lesson.status !== "SCHEDULED") {
      return NextResponse.json(
        { message: "Można usunąć tylko zaplanowane zajęcia" },
        { status: 400 },
      );
    }

    const deleted = await queryDb<{ id: string }>(
      `DELETE FROM lessons
       WHERE id = $1 AND status = 'SCHEDULED'
       RETURNING id`,
      [lessonId],
    );

    if ((deleted.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Nie udało się usunąć zajęć" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: "Zajęcia usunięte z kalendarza",
      deleted: true,
      groupId: lesson.group_id,
    });
  } catch (error) {
    console.error("DELETE lessons/[id] error:", error);
    return NextResponse.json({ message: "Błąd usuwania zajęć" }, { status: 500 });
  }
}
