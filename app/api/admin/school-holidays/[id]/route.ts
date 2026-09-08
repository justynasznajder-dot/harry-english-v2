import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { writeAdminDeletionLog } from "@/lib/admin-deletion-log";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await context.params;
  try {
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
    await writeAdminDeletionLog({
      schoolId: holiday.school_id,
      actorUserId: ctx.userId,
      action: "HOLIDAY_DELETE",
      summary: `Usunięto dzień wolny „${holiday.name}” (${rangeLabel})`,
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
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE school-holidays/[id] error:", error);
    return NextResponse.json({ message: "Błąd usuwania dnia wolnego" }, { status: 500 });
  }
}
