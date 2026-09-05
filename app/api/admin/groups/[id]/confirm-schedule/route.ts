import { NextRequest, NextResponse } from "next/server";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { confirmScheduleAndGenerateLessons } from "@/lib/lesson-generation";

/** Potwierdza harmonogram grupy na aktywny rok i generuje podaną liczbę zajęć. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: groupId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      lessonCount?: number | string;
    };
    const lessonCount = Math.floor(Number(body.lessonCount));
    if (!Number.isFinite(lessonCount) || lessonCount < 1 || lessonCount > 500) {
      return NextResponse.json(
        { message: "Podaj liczbę zajęć w zakresie 1–500" },
        { status: 400 },
      );
    }

    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const result = await confirmScheduleAndGenerateLessons({
      schoolId: ctx.schoolId,
      groupId,
      teacherId: group.teacherId,
      lessonCount,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      created: result.created,
      templatesConfirmed: result.templatesConfirmed ?? 0,
      message:
        result.created > 0
          ? `Wygenerowano ${result.created} ${
              result.created === 1 ? "zajęcie" : result.created < 5 ? "zajęcia" : "zajęć"
            }. Harmonogram potwierdzony na aktywny rok.`
          : "Harmonogram potwierdzony. Nie dodano nowych zajęć (brak wolnych terminów w zakresie roku lub wszystkie już istnieją).",
    });
  } catch (error) {
    console.error("POST groups/[id]/confirm-schedule:", error);
    return NextResponse.json({ message: "Błąd generowania zajęć" }, { status: 500 });
  }
}
