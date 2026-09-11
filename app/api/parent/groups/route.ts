import { NextRequest, NextResponse } from "next/server";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import {
  fetchParentGroups,
  fetchParentProposedGroups,
  fetchUpcomingLessonsForGroups,
} from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    await completePastScheduledLessons();

    const groups = await fetchParentGroups(parentId, schoolId);
    // Lekcje po oknie członkostwa (także historyczne grupy) — bez filtra aktualnych groupIds.
    const upcomingLessons = await fetchUpcomingLessonsForGroups([], null, {
      parentId,
      schoolId,
      includePast: true,
    });

    const lessonsByChild = new Map<string, typeof upcomingLessons>();
    for (const lesson of upcomingLessons) {
      const childId = lesson.childId ?? "";
      if (!childId) continue;
      const list = lessonsByChild.get(childId) ?? [];
      list.push(lesson);
      lessonsByChild.set(childId, list);
    }

    const proposedGroups =
      groups.length === 0 ? await fetchParentProposedGroups(parentId, schoolId) : [];

    return NextResponse.json({
      groups: groups.map((g) => ({
        ...g,
        // Wszystkie lekcje dziecka w aktywnym roku (aktualna + odbyte ze starych grup).
        upcomingLessons: lessonsByChild.get(g.childId) ?? [],
      })),
      proposedGroups,
    });
  } catch (error) {
    console.error("GET /api/parent/groups:", error);
    return NextResponse.json({ message: "Błąd pobierania grup" }, { status: 500 });
  }
}
