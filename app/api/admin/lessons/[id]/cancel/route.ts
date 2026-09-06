import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { topUpLessonsAfterCancellation } from "@/lib/lesson-generation";
import { requireMessageActor } from "@/lib/messages";
import { notifyParents } from "@/lib/parent-notifications";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteCtx) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const actor = await requireMessageActor(ctx.userId);
  if (!actor.ok) {
    return NextResponse.json({ message: actor.message }, { status: actor.status });
  }

  const { id: lessonId } = await context.params;

  let parentMessage: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.parent_message === "string") {
      parentMessage = body.parent_message;
    }
  } catch {
    // brak body — domyślna wiadomość
  }

  try {
    const lessonRes = await queryDb<{
      id: string;
      status: string;
      group_id: string;
      group_name: string;
      school_id: string;
      location_name: string | null;
      date_pl: string;
      time_pl: string;
    }>(
      `SELECT
         l.id,
         l.status,
         l.group_id,
         g.name AS group_name,
         g.school_id,
         loc.name AS location_name,
         to_char(l.scheduled_at, 'DD.MM.YYYY') AS date_pl,
         to_char(l.scheduled_at, 'HH24:MI') AS time_pl
       FROM lessons l
       INNER JOIN groups g ON g.id = l.group_id
       LEFT JOIN locations loc ON loc.id = l.location_id
       WHERE l.id = $1
         ${ctx.tenant.role === "MANAGER" ? "AND g.school_id = $2" : ""}
       LIMIT 1`,
      ctx.tenant.role === "MANAGER" ? [lessonId, ctx.schoolId] : [lessonId],
    );

    const lesson = lessonRes.rows[0];
    if (!lesson) {
      return NextResponse.json({ message: "Nie znaleziono zajęć" }, { status: 404 });
    }

    if (lesson.status === "CANCELLED") {
      return NextResponse.json({ message: "Te zajęcia są już anulowane" }, { status: 400 });
    }

    if (lesson.status !== "SCHEDULED") {
      return NextResponse.json(
        { message: "Można anulować tylko zaplanowane zajęcia" },
        { status: 400 },
      );
    }

    if (lesson.school_id !== actor.user.schoolId) {
      return NextResponse.json({ message: "Brak dostępu do tych zajęć" }, { status: 403 });
    }

    await queryDb(
      `UPDATE lessons
       SET status = 'CANCELLED',
           cancellation_reason = COALESCE(NULLIF(TRIM(cancellation_reason), ''), 'Odwołanie zajęć')
       WHERE id = $1`,
      [lessonId],
    );

    const topUp = await topUpLessonsAfterCancellation(lesson.school_id, lesson.group_id);

    const parentsRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
    }>(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
       FROM users u
       INNER JOIN children c ON c.parent_id = u.id AND c.active = TRUE
       INNER JOIN group_students gs ON gs.child_id = c.id AND gs.left_at IS NULL
       WHERE gs.group_id = $1
         AND u.role = 'PARENT'
         AND u.active = TRUE
         AND u.email IS NOT NULL
         AND TRIM(u.email::text) <> ''`,
      [lesson.group_id],
    );

    const parents = parentsRes.rows;
    const locationPart = lesson.location_name?.trim() ? ` (${lesson.location_name.trim()})` : "";
    const subject = `Odwołanie zajęć — ${lesson.group_name}`;
    const customMessage = typeof parentMessage === "string" ? parentMessage.trim() : "";
    const content =
      `Informujemy, że zajęcia grupy ${lesson.group_name}${locationPart} zaplanowane na ${lesson.date_pl} o godzinie ${lesson.time_pl} zostały odwołane.\n\n` +
      (customMessage ||
        "Prosimy o uwzględnienie tej informacji w planie dnia dziecka.");

    const notifyResult =
      parents.length > 0
        ? await notifyParents({
            actor: actor.user,
            parents,
            subject,
            content,
          })
        : { parentsNotified: 0, emailsSent: 0, emailsFailed: 0 };

    const { parentsNotified, emailsSent, emailsFailed } = notifyResult;
    let message = "Zajęcia anulowane.";
    if (topUp.created > 0) {
      message += " Dodano kolejny termin w harmonogramie grupy.";
    } else if (topUp.eligible) {
      message += " Nie udało się dodać kolejnego terminu (brak wolnych slotów do końca roku).";
    }
    if (parentsNotified > 0) {
      message += ` Wysłano powiadomienia do ${parentsNotified} rodziców`;
      if (emailsSent > 0) message += ` (e-mail: ${emailsSent})`;
      if (emailsFailed > 0) message += ` — nie udało się wysłać ${emailsFailed} e-maili`;
      message += ".";
    } else {
      message += " W grupie nie ma aktywnych uczniów z przypisanymi rodzicami.";
    }

    return NextResponse.json({
      message,
      parentsNotified,
      emailsSent,
      emailsFailed,
      topUpCreated: topUp.created,
      topUpEligible: topUp.eligible,
    });
  } catch (error) {
    console.error("POST lessons/[id]/cancel error:", error);
    return NextResponse.json({ message: "Błąd anulowania zajęć" }, { status: 500 });
  }
}
