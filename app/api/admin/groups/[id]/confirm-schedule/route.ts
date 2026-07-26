import { NextRequest, NextResponse } from "next/server";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { confirmScheduleAndGenerateLessons } from "@/lib/lesson-generation";

/** Potwierdza harmonogram grupy na aktywny rok i generuje zajęcia (z uwzględnieniem dni wolnych). */
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

    const result = await confirmScheduleAndGenerateLessons({
      schoolId: ctx.schoolId,
      groupId,
      teacherId: group.teacherId,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      created: result.created,
      templatesConfirmed: result.templatesConfirmed ?? 0,
      message:
        result.created > 0
          ? `Harmonogram potwierdzony. Wygenerowano ${result.created} zajęć do końca roku szkolnego.`
          : "Harmonogram potwierdzony. Kalendarz zajęć jest już kompletny w zakresie roku szkolnego.",
    });
  } catch (error) {
    console.error("POST groups/[id]/confirm-schedule:", error);
    return NextResponse.json({ message: "Błąd potwierdzania harmonogramu" }, { status: 500 });
  }
}
