import { NextRequest, NextResponse } from "next/server";
import {
  assertGroupInSchool,
  requireAdminSchoolContext,
  tenantNotFoundResponse,
} from "@/lib/admin-school-context";
import { purgeFutureOrphanScheduledLessons } from "@/lib/lesson-generation";

/** Usuwa przyszłe zajęcia spoza aktualnego harmonogramu grupy. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: groupId } = await params;
  try {
    const group = await assertGroupInSchool(groupId, ctx.schoolId);
    if (!group.ok) return tenantNotFoundResponse("Nie znaleziono grupy");

    const removed = await purgeFutureOrphanScheduledLessons(groupId);
    return NextResponse.json({
      removed,
      message:
        removed > 0
          ? `Usunięto ${removed} ${
              removed === 1
                ? "zajęcie poza harmonogramem"
                : removed < 5
                  ? "zajęcia poza harmonogramem"
                  : "zajęć poza harmonogramem"
            }.`
          : "Brak przyszłych zajęć poza harmonogramem.",
    });
  } catch (error) {
    console.error("POST groups/[id]/purge-orphan-lessons:", error);
    return NextResponse.json(
      { message: "Błąd usuwania zajęć poza harmonogramem" },
      { status: 500 }
    );
  }
}
