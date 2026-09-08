import { NextRequest, NextResponse } from "next/server";
import { queryDb, runPgTransaction } from "@/lib/db";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";

/**
 * Usuwa wszystkie wygenerowane zajęcia grupy w aktywnym roku szkolnym
 * (SCHEDULED / COMPLETED / CANCELLED), żeby dało się ponownie edytować harmonogram.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: groupId } = await params;
  try {
    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const groupRes = await queryDb<{ name: string; school_id: string }>(
      `SELECT name, school_id FROM groups WHERE id = $1 LIMIT 1`,
      [groupId],
    );
    const groupRow = groupRes.rows[0];
    if (!groupRow) return tenantNotFoundResponse("Nie znaleziono grupy");

    const yearRes = await queryDb<{ id: string; name: string }>(
      `SELECT id, name
       FROM school_years
       WHERE school_id = $1 AND active = TRUE
       LIMIT 1`,
      [groupRow.school_id],
    );
    const activeYear = yearRes.rows[0];
    if (!activeYear) {
      return NextResponse.json(
        { message: "Brak aktywnego roku szkolnego — nie ma czego usuwać" },
        { status: 400 },
      );
    }

    const snapshot = await queryDb<{
      id: string;
      status: string;
      scheduled_at: Date | string;
      duration_min: number;
      location_id: string;
      teacher_id: string;
      schedule_template_id: string | null;
      school_year_id: string | null;
      notes: string | null;
      cancellation_reason: string | null;
    }>(
      `SELECT id, status::text AS status, scheduled_at, duration_min,
              location_id, teacher_id, schedule_template_id, school_year_id,
              notes, cancellation_reason
       FROM lessons
       WHERE group_id = $1
         AND school_year_id = $2
         AND status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')
       ORDER BY scheduled_at ASC`,
      [groupId, activeYear.id],
    );

    if (snapshot.rows.length === 0) {
      return NextResponse.json({
        deleted: 0,
        scheduledDeleted: 0,
        completedDeleted: 0,
        cancelledDeleted: 0,
        message: "Brak wygenerowanych zajęć do usunięcia",
      });
    }

    const ids = snapshot.rows.map((r) => r.id);
    const scheduledDeleted = snapshot.rows.filter((r) => r.status === "SCHEDULED").length;
    const completedDeleted = snapshot.rows.filter((r) => r.status === "COMPLETED").length;
    const cancelledDeleted = snapshot.rows.filter((r) => r.status === "CANCELLED").length;

    await runPgTransaction(async (client) => {
      await client.query(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [ids]);
      await client.query(`DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`, [ids]);
      await client.query(
        `DELETE FROM lessons
         WHERE id = ANY($1::text[])
           AND group_id = $2
           AND school_year_id = $3`,
        [ids, groupId, activeYear.id],
      );
    });

    await writeAdminDeletionLog({
      schoolId: groupRow.school_id,
      actorUserId: ctx.userId,
      action: "LESSONS_GENERATED_CLEAR",
      summary: `Usunięto ${ids.length} wygenerowanych zajęć grupy „${groupRow.name}” (rok ${activeYear.name})`,
      payload: {
        groupId,
        groupName: groupRow.name,
        schoolYearId: activeYear.id,
        schoolYearName: activeYear.name,
        deletedCount: ids.length,
        scheduledDeleted,
        completedDeleted,
        cancelledDeleted,
        source: "POST /api/admin/groups/[id]/clear-generated-lessons",
        lessons: snapshot.rows.map((r) => ({
          id: r.id,
          status: r.status,
          scheduled_at:
            r.scheduled_at instanceof Date
              ? r.scheduled_at.toISOString()
              : String(r.scheduled_at),
          duration_min: r.duration_min,
          location_id: r.location_id,
          teacher_id: r.teacher_id,
          schedule_template_id: r.schedule_template_id,
          school_year_id: r.school_year_id,
          notes: r.notes,
          cancellation_reason: r.cancellation_reason,
        })),
      },
    });

    return NextResponse.json({
      deleted: ids.length,
      scheduledDeleted,
      completedDeleted,
      cancelledDeleted,
      schoolYearName: activeYear.name,
      message: `Usunięto ${ids.length} ${
        ids.length === 1 ? "zajęcie" : ids.length < 5 ? "zajęcia" : "zajęć"
      } z roku ${activeYear.name}. Możesz teraz edytować harmonogram i wygenerować zajęcia od nowa.`,
    });
  } catch (error) {
    console.error("POST groups/[id]/clear-generated-lessons:", error);
    return NextResponse.json(
      { message: "Błąd usuwania wygenerowanych zajęć" },
      { status: 500 },
    );
  }
}
