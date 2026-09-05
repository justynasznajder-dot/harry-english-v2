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
    const groupIds = [...new Set(groups.map((g) => g.groupId))];
    const upcomingLessons = await fetchUpcomingLessonsForGroups(groupIds, 5);

    const lessonsByGroup = new Map<string, typeof upcomingLessons>();
    for (const lesson of upcomingLessons) {
      const list = lessonsByGroup.get(lesson.groupId) ?? [];
      list.push(lesson);
      lessonsByGroup.set(lesson.groupId, list);
    }

    const proposedGroups =
      groups.length === 0 ? await fetchParentProposedGroups(parentId, schoolId) : [];

    return NextResponse.json({
      groups: groups.map((g) => ({
        ...g,
        upcomingLessons: (lessonsByGroup.get(g.groupId) ?? []).slice(0, 5),
      })),
      proposedGroups,
    });
  } catch (error) {
    console.error("GET /api/parent/groups:", error);
    return NextResponse.json({ message: "Błąd pobierania grup" }, { status: 500 });
  }
}
