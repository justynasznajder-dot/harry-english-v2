import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { queryDb } from "@/lib/db";
import { upsertGroupLessonBounds, ymdSlice } from "@/lib/group-lesson-bounds";

/**
 * Checkboxy „grupa zaczyna później” / „grupa kończy wcześniej” — granice generowania
 * zajęć względem aktywnego roku szkolnego.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: groupId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      schoolYearId?: unknown;
      startsLater?: unknown;
      lessonsStartOn?: unknown;
      endsEarlier?: unknown;
      lessonsEndOn?: unknown;
    };

    const groupRes = await queryDb<{ id: string; school_id: string }>(
      `SELECT id, school_id FROM groups
       WHERE id = $1 AND deleted_at IS NULL
         ${ctx.tenant.role === "MANAGER" ? "AND school_id = $2" : ""}
       LIMIT 1`,
      ctx.tenant.role === "MANAGER" ? [groupId, ctx.schoolId] : [groupId],
    );
    const group = groupRes.rows[0];
    if (!group) return tenantNotFoundResponse("Nie znaleziono grupy");

    const schoolId = String(group.school_id);

    let schoolYearId =
      typeof body.schoolYearId === "string" ? body.schoolYearId.trim() : "";
    if (!schoolYearId) {
      const active = await queryDb<{ id: string }>(
        `SELECT id FROM school_years
         WHERE school_id = $1 AND active = TRUE
         LIMIT 1`,
        [schoolId],
      );
      schoolYearId = active.rows[0]?.id ?? "";
    }
    if (!schoolYearId) {
      return NextResponse.json(
        { message: "Brak aktywnego roku szkolnego" },
        { status: 400 },
      );
    }

    const startsLater = body.startsLater === true;
    const endsEarlier = body.endsEarlier === true;

    const lessonsStartOn = startsLater
      ? ymdSlice(
          typeof body.lessonsStartOn === "string" ? body.lessonsStartOn : null,
        )
      : null;
    const lessonsEndOn = endsEarlier
      ? ymdSlice(typeof body.lessonsEndOn === "string" ? body.lessonsEndOn : null)
      : null;

    if (startsLater && !lessonsStartOn) {
      return NextResponse.json(
        { message: "Podaj datę rozpoczęcia zajęć dla grupy" },
        { status: 400 },
      );
    }
    if (endsEarlier && !lessonsEndOn) {
      return NextResponse.json(
        { message: "Podaj datę zakończenia zajęć dla grupy" },
        { status: 400 },
      );
    }

    const result = await upsertGroupLessonBounds({
      schoolId,
      groupId,
      schoolYearId,
      lessonsStartOn,
      lessonsEndOn,
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      message: "Zapisano zakres dat zajęć grupy",
      lessonBounds: {
        lessonsStartOn,
        lessonsEndOn,
      },
    });
  } catch (error) {
    console.error("PATCH group lesson-bounds error:", error);
    return NextResponse.json(
      { message: "Błąd zapisu zakresu dat zajęć" },
      { status: 500 },
    );
  }
}
