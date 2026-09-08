import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";

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
      group_name: string;
      scheduled_at: Date | string;
      duration_min: number;
      location_id: string;
      teacher_id: string;
      schedule_template_id: string | null;
      school_year_id: string | null;
      notes: string | null;
      cancellation_reason: string | null;
    }>(
      `SELECT l.id, l.status::text AS status, l.group_id, g.school_id, g.name AS group_name,
              l.scheduled_at, l.duration_min, l.location_id, l.teacher_id,
              l.schedule_template_id, l.school_year_id, l.notes, l.cancellation_reason
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

    await queryDb(`DELETE FROM attendance WHERE lesson_id = $1`, [lessonId]);
    await queryDb(`DELETE FROM progress_notes WHERE lesson_id = $1`, [lessonId]);

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

    const whenIso =
      lesson.scheduled_at instanceof Date
        ? lesson.scheduled_at.toISOString()
        : String(lesson.scheduled_at);

    await writeAdminDeletionLog({
      schoolId: lesson.school_id,
      actorUserId: ctx.userId,
      action: "LESSON_DELETE",
      summary: `Usunięto zajęcia „${lesson.group_name}” (${whenIso})`,
      payload: {
        lesson: {
          id: lesson.id,
          group_id: lesson.group_id,
          group_name: lesson.group_name,
          scheduled_at: whenIso,
          duration_min: lesson.duration_min,
          status: lesson.status,
          location_id: lesson.location_id,
          teacher_id: lesson.teacher_id,
          schedule_template_id: lesson.schedule_template_id,
          school_year_id: lesson.school_year_id,
          notes: lesson.notes,
          cancellation_reason: lesson.cancellation_reason,
        },
        source: "DELETE /api/admin/lessons/[id]",
      },
    });

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
