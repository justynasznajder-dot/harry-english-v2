import { NextRequest, NextResponse } from "next/server";
import { queryDb, runPgTransaction } from "@/lib/db";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { purgeFutureOrphanScheduledLessons } from "@/lib/lesson-generation";
import { sqlSchoolTimestampAsTimestamptz } from "@/lib/school-timezone";

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
    const existing = await queryDb<{
      id: string;
      group_id: string;
      day_of_week: number;
      start_time: string;
    }>(
      `SELECT
         st.id,
         st.group_id,
         st.day_of_week,
         TO_CHAR(st.start_time, 'HH24:MI:SS') AS start_time
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.id = $1 AND g.school_id = $2
       LIMIT 1`,
      [id, ctx.schoolId]
    );
    const template = existing.rows[0];
    if (!template) {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }

    const lessonsRemoved = await runPgTransaction(async (client) => {
      // Przyszłe SCHEDULED z tego szablonu LUB z tym samym dniem/godziną w grupie
      // (na wypadek zajęć bez schedule_template_id / po wcześniejszym odpięciu).
      const toRemove = await client.query<{ id: string }>(
        `SELECT l.id
         FROM lessons l
         WHERE l.group_id = $1
           AND l.status = 'SCHEDULED'
           AND ${sqlSchoolTimestampAsTimestamptz("l.scheduled_at")} > NOW()
           AND (
             l.schedule_template_id = $2
             OR (
               EXTRACT(ISODOW FROM l.scheduled_at)::int = $3
               AND TO_CHAR(l.scheduled_at, 'HH24:MI:SS') = $4
             )
           )`,
        [template.group_id, id, template.day_of_week, template.start_time]
      );
      const lessonIds = toRemove.rows.map((r) => r.id);

      if (lessonIds.length > 0) {
        await client.query(`DELETE FROM attendance WHERE lesson_id = ANY($1::text[])`, [
          lessonIds,
        ]);
        await client.query(
          `DELETE FROM progress_notes WHERE lesson_id = ANY($1::text[])`,
          [lessonIds]
        );
        await client.query(
          `DELETE FROM lessons
           WHERE id = ANY($1::text[])
             AND status = 'SCHEDULED'`,
          [lessonIds]
        );
      }

      // Zakończone / przeszłe: odłącz od szablonu, żeby dało się usunąć termin.
      await client.query(
        `UPDATE lessons
         SET schedule_template_id = NULL
         WHERE schedule_template_id = $1`,
        [id]
      );

      const delTpl = await client.query<{ id: string }>(
        `DELETE FROM schedule_templates st
         USING groups g
         WHERE st.id = $1
           AND st.group_id = g.id
           AND g.school_id = $2
         RETURNING st.id`,
        [id, ctx.schoolId]
      );
      if (!delTpl.rows[0]) {
        throw new Error("TEMPLATE_NOT_FOUND");
      }

      return lessonIds.length;
    });

    const orphansRemoved = await purgeFutureOrphanScheduledLessons(template.group_id);
    const totalRemoved = lessonsRemoved + orphansRemoved;

    return NextResponse.json({
      message:
        totalRemoved > 0
          ? `Termin usunięty. Usunięto też ${totalRemoved} ${
              totalRemoved === 1
                ? "nadchodzące zajęcie"
                : totalRemoved < 5
                  ? "nadchodzące zajęcia"
                  : "nadchodzących zajęć"
            } z kalendarza.`
          : "Termin usunięty",
      lessonsRemoved: totalRemoved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
      return tenantNotFoundResponse("Nie znaleziono terminu");
    }
    console.error("DELETE schedule template error:", error);
    return NextResponse.json({ message: "Błąd usuwania terminu" }, { status: 500 });
  }
}
