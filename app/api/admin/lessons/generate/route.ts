import { NextRequest, NextResponse } from "next/server";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { generateLessonsForGroup } from "@/lib/lesson-generation";
import { assertGroupInSchool, requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";

export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = await request.json();
    const { groupId, dateFrom, dateTo } = body as {
      groupId?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    if (!groupId || !dateFrom || !dateTo) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const teacherId = group.teacherId;
    if (!teacherId) {
      return NextResponse.json({ message: "Grupa nie ma przypisanego nauczyciela" }, { status: 400 });
    }

    // Ręczne generowanie = świadoma decyzja: przypnij harmonogram do aktywnego roku.
    const activeYear = await getActiveSchoolYear(ctx.schoolId);
    if (activeYear?.id) {
      await queryDb(
        `UPDATE schedule_templates
         SET school_year_id = $2
         WHERE group_id = $1 AND active = TRUE AND school_id = $3`,
        [groupId, String(activeYear.id), ctx.schoolId],
      );
    }

    const result = await generateLessonsForGroup({
      schoolId: ctx.schoolId,
      groupId,
      teacherId,
      dateFrom,
      dateTo,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      created: result.created,
      retroactive: result.retroactive,
      message: result.message,
    });
  } catch (error) {
    console.error("POST lessons/generate error:", error);
    return NextResponse.json({ message: "Błąd generowania zajęć" }, { status: 500 });
  }
}
