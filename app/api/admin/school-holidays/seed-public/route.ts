import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminSchoolContext,
  resolveInsertSchoolId,
} from "@/lib/admin-school-context";
import { ensurePolishPublicHolidaysForSchoolYear } from "@/lib/ensure-polish-public-holidays";
import { topUpLessonsAfterHolidayDeletion } from "@/lib/lesson-generation";

/**
 * POST — dopina brakujące ustawowe święta PL (type=PUBLIC) do aktywnego
 * (lub wskazanego) roku szkolnego, usuwa zaplanowane zajęcia w tych dniach
 * i uzupełnia brakującą liczbę zajęć w grupach.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      school_year_id?: string;
      schoolYearId?: string;
      school_id?: string;
      schoolId?: string;
    };

    const insertSchoolId = resolveInsertSchoolId(ctx.tenant, {
      bodySchoolId: body.school_id,
      bodySchoolIdCamel: body.schoolId,
    });
    if (!insertSchoolId) {
      return NextResponse.json(
        {
          message:
            "Brak identyfikatora szkoły (school_id / schoolId lub SCHOOL_ID w środowisku)",
        },
        { status: 400 },
      );
    }

    const schoolYearId = body.school_year_id ?? body.schoolYearId;
    const result = await ensurePolishPublicHolidaysForSchoolYear({
      schoolId: insertSchoolId,
      schoolYearId,
      forceCancelScheduled: true,
    });

    if (!result) {
      return NextResponse.json(
        { message: "Brak roku szkolnego do uzupełnienia świąt" },
        { status: 400 },
      );
    }

    const topUp = await topUpLessonsAfterHolidayDeletion(
      insertSchoolId,
      result.deletedByGroup,
    );

    let message =
      result.inserted === 0
        ? "Wszystkie ustawowe święta państwowe są już w kalendarzu."
        : `Dodano ${result.inserted} ustawowych świąt państwowych.`;
    if (result.lessonsDeleted > 0) {
      message += ` Usunięto ${result.lessonsDeleted} zaplanowanych zajęć.`;
    }
    if (topUp.created > 0) {
      message += ` Uzupełniono ${topUp.created} brakujących zajęć w ${topUp.groupsProcessed} grupach.`;
    }

    return NextResponse.json({
      inserted: result.inserted,
      lessonsCancelled: result.lessonsDeleted,
      lessonsDeleted: result.lessonsDeleted,
      lessonsRegenerated: topUp.created,
      groupsToppedUp: topUp.groupsProcessed,
      holidays: result.holidays,
      message,
    });
  } catch (error) {
    console.error("POST school-holidays/seed-public error:", error);
    return NextResponse.json(
      { message: "Błąd uzupełniania świąt państwowych" },
      { status: 500 },
    );
  }
}
