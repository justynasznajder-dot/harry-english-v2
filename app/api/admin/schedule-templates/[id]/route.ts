import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const body = await request.json();
    if (typeof body.onceWeeklyDay !== "boolean") {
      return NextResponse.json(
        { message: "Podaj onceWeeklyDay (true/false)" },
        { status: 400 }
      );
    }

    const existing = await queryDb<{
      id: string;
      group_id: string;
      lessons_per_week: number | null;
    }>(
      `SELECT st.id, st.group_id, g.lessons_per_week
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.id = $1 AND g.school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    const row = existing.rows[0];
    if (!row) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }

    if (Number(row.lessons_per_week) !== 2 && body.onceWeeklyDay) {
      return NextResponse.json(
        {
          message:
            "Dzień dla dzieci 1× można oznaczyć tylko w grupie z zajęciami 2× w tygodniu",
        },
        { status: 400 }
      );
    }

    if (body.onceWeeklyDay) {
      await queryDb(
        `UPDATE schedule_templates
         SET once_weekly_day = FALSE
         WHERE group_id = $1 AND once_weekly_day = TRUE AND id <> $2`,
        [row.group_id, id]
      );
    }

    await queryDb(
      `UPDATE schedule_templates
       SET once_weekly_day = $2
       WHERE id = $1`,
      [id, body.onceWeeklyDay]
    );

    return NextResponse.json({ message: "Zaktualizowano termin" });
  } catch (error) {
    console.error("PATCH schedule template error:", error);
    return NextResponse.json({ message: "Błąd aktualizacji terminu" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const res = await queryDb<{ id: string }>(
      `DELETE FROM schedule_templates st
       USING groups g
       WHERE st.id = $1
         AND st.group_id = g.id
         AND g.school_id = $2
       RETURNING st.id`,
      [id, ctx.schoolId]
    );
    if (!res.rows[0]) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }
    return NextResponse.json({ message: "Termin usunięty" });
  } catch (error) {
    console.error("DELETE schedule template error:", error);
    return NextResponse.json({ message: "Błąd usuwania terminu" }, { status: 500 });
  }
}
