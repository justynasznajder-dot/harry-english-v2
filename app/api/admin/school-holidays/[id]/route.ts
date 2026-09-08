import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";
import { restoreScheduleSlotsAfterHolidayRemoval } from "@/lib/school-holiday-lessons";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  try {
    let restoreLessons = false;
    try {
      const body = (await request.json()) as { restoreLessons?: unknown };
      restoreLessons = Boolean(body?.restoreLessons);
    } catch {
      /* puste body — tylko usunięcie dnia wolnego */
    }

    const existing = await queryDb<{
      id: string;
      school_id: string;
      school_year_id: string | null;
      name: string;
      date_from: string;
      date_to: string;
      type: string;
      created_at: Date | string;
    }>(
      ctx.tenant.role === "MANAGER"
        ? `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays WHERE id = $1 AND school_id = $2`
        : `SELECT id, school_id, school_year_id, name, date_from::text, date_to::text, type, created_at
           FROM school_holidays WHERE id = $1`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id],
    );
    const holiday = existing.rows[0];
    if (!holiday) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    const groupsRes = await queryDb<{ group_id: string; group_name: string }>(
      `SELECT shg.group_id, g.name AS group_name
       FROM school_holiday_groups shg
       INNER JOIN groups g ON g.id = shg.group_id
       WHERE shg.holiday_id = $1
       ORDER BY g.name`,
      [id],
    );
    const groupIds = groupsRes.rows.map((r) => r.group_id);

    const del = await queryDb(
      ctx.tenant.role === "MANAGER"
        ? `DELETE FROM school_holidays WHERE id = $1 AND school_id = $2 RETURNING id`
        : `DELETE FROM school_holidays WHERE id = $1 RETURNING id`,
      ctx.tenant.role === "MANAGER" ? [id, ctx.schoolId] : [id],
    );
    if (!del.rowCount) {
      return NextResponse.json({ message: "Nie znaleziono dnia wolnego" }, { status: 404 });
    }

    const rangeLabel =
      holiday.date_from === holiday.date_to
        ? holiday.date_from
        : `${holiday.date_from}–${holiday.date_to}`;

    let restore: Awaited<ReturnType<typeof restoreScheduleSlotsAfterHolidayRemoval>> | null =
      null;
    if (restoreLessons) {
      restore = await restoreScheduleSlotsAfterHolidayRemoval({
        schoolId: holiday.school_id,
        dateFrom: holiday.date_from,
        dateTo: holiday.date_to,
        groupIds: groupIds.length > 0 ? groupIds : null,
        actorUserId: ctx.userId,
      });
    }

    await writeAdminDeletionLog({
      schoolId: holiday.school_id,
      actorUserId: ctx.userId,
      action: "HOLIDAY_DELETE",
      summary: restoreLessons
        ? `Usunięto dzień wolny „${holiday.name}” (${rangeLabel}) i przywrócono zajęcia z harmonogramu`
        : `Usunięto dzień wolny „${holiday.name}” (${rangeLabel})`,
      payload: {
        holiday: {
          id: holiday.id,
          school_id: holiday.school_id,
          school_year_id: holiday.school_year_id,
          name: holiday.name,
          date_from: holiday.date_from,
          date_to: holiday.date_to,
          type: holiday.type,
          created_at:
            holiday.created_at instanceof Date
              ? holiday.created_at.toISOString()
              : String(holiday.created_at),
        },
        group_ids: groupIds,
        groups: groupsRes.rows,
        applies_to_all_groups: groupIds.length === 0,
        restoreLessons,
        restore,
      },
    });

    let message = "Usunięto dzień wolny.";
    if (restoreLessons && restore) {
      if (restore.restored > 0) {
        message += ` Przywrócono ${restore.restored} zajęć według harmonogramu`;
        if (restore.trimmed > 0) {
          message += ` i usunięto ${restore.trimmed} ostatnich z końca kalendarza`;
        }
        message += ` (${restore.groupsProcessed} grup).`;
      } else {
        message +=
          " Nie przywrócono zajęć (brak pasującego harmonogramu, nauczyciela lub terminy już były).";
      }
    }

    return NextResponse.json({
      ok: true,
      message,
      restoreLessons,
      lessonsRestored: restore?.restored ?? 0,
      lessonsTrimmed: restore?.trimmed ?? 0,
      groupsProcessed: restore?.groupsProcessed ?? 0,
    });
  } catch (error) {
    console.error("DELETE school-holidays/[id] error:", error);
    return NextResponse.json({ message: "Błąd usuwania dnia wolnego" }, { status: 500 });
  }
}
