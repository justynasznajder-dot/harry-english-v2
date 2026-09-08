import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId } = body as { groupId?: string };
    if (!groupId) {
      return NextResponse.json({ message: "Brak identyfikatora grupy" }, { status: 400 });
    }

    let schoolId = ctx.schoolId;
    if (ctx.tenant.role === "MANAGER") {
      const group = await assertGroupInSchool(groupId, ctx.schoolId);
      if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");
    } else {
      const groupCheck = await queryDb<{ id: string; school_id: string; name: string }>(
        `SELECT id, school_id, name FROM groups WHERE id = $1 LIMIT 1`,
        [groupId],
      );
      if (!groupCheck.rows[0]) return tenantNotFoundResponse("Nie znaleziono grupy");
      schoolId = groupCheck.rows[0].school_id;
    }

    const groupNameRes = await queryDb<{ name: string; school_id: string }>(
      `SELECT name, school_id FROM groups WHERE id = $1 LIMIT 1`,
      [groupId],
    );
    const groupRow = groupNameRes.rows[0];
    if (!groupRow) return tenantNotFoundResponse("Nie znaleziono grupy");
    schoolId = groupRow.school_id;

    const snapshot = await queryDb<{
      id: string;
      group_id: string;
      scheduled_at: Date | string;
      duration_min: number;
      status: string;
      location_id: string;
      teacher_id: string;
      schedule_template_id: string | null;
      school_year_id: string | null;
      notes: string | null;
      cancellation_reason: string | null;
    }>(
      `SELECT id, group_id, scheduled_at, duration_min, status::text AS status,
              location_id, teacher_id, schedule_template_id, school_year_id,
              notes, cancellation_reason
       FROM lessons
       WHERE group_id = $1
         AND scheduled_at > NOW()
         AND status = 'SCHEDULED'
       ORDER BY scheduled_at ASC`,
      [groupId],
    );

    const ids = snapshot.rows.map((r) => r.id);
    if (ids.length > 0) {
      await queryDb(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [ids]);
      await queryDb(`DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`, [ids]);
    }

    const deleted = await queryDb<{ id: string }>(
      `DELETE FROM lessons
       WHERE group_id = $1
         AND scheduled_at > NOW()
         AND status = 'SCHEDULED'
       RETURNING id`,
      [groupId],
    );

    const count = deleted.rowCount ?? 0;

    if (count > 0) {
      await writeAdminDeletionLog({
        schoolId,
        actorUserId: ctx.userId,
        action: "LESSONS_FUTURE_DELETE",
        summary: `Usunięto ${count} nadchodzących zajęć grupy „${groupRow.name}”`,
        payload: {
          groupId,
          groupName: groupRow.name,
          deletedCount: count,
          source: "DELETE /api/admin/lessons/future",
          lessons: snapshot.rows.map((r) => ({
            id: r.id,
            group_id: r.group_id,
            group_name: groupRow.name,
            scheduled_at:
              r.scheduled_at instanceof Date
                ? r.scheduled_at.toISOString()
                : String(r.scheduled_at),
            duration_min: r.duration_min,
            status: r.status,
            location_id: r.location_id,
            teacher_id: r.teacher_id,
            schedule_template_id: r.schedule_template_id,
            school_year_id: r.school_year_id,
            notes: r.notes,
            cancellation_reason: r.cancellation_reason,
          })),
        },
      });
    }

    return NextResponse.json({
      deleted: count,
      message:
        count > 0
          ? `Usunięto ${count} nadchodzących zajęć z kalendarza`
          : "Brak nadchodzących zajęć do usunięcia",
    });
  } catch (error) {
    console.error("DELETE lessons/future error:", error);
    return NextResponse.json({ message: "Błąd usuwania zajęć" }, { status: 500 });
  }
}
