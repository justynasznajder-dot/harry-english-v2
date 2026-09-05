import { NextRequest, NextResponse } from "next/server";
import {
  backfillDefaultPresentAttendance,
  completePastScheduledLessons,
} from "@/lib/lesson-completion";
import {
  computeMonthlyAttendanceSummaries,
  fetchParentAttendance,
  verifyChildBelongsToParent,
} from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;
  const childId = request.nextUrl.searchParams.get("childId")?.trim() ?? null;

  if (childId) {
    const allowed = await verifyChildBelongsToParent(childId, parentId, schoolId);
    if (!allowed) {
      return NextResponse.json({ message: "Brak dostępu do danych dziecka" }, { status: 403 });
    }
  }

  try {
    await completePastScheduledLessons();
    await backfillDefaultPresentAttendance(120, schoolId);

    const records = await fetchParentAttendance(parentId, schoolId, childId);
    const monthlySummary = computeMonthlyAttendanceSummaries(records);

    return NextResponse.json({
      records: records.map((r) => ({
        childId: r.childId,
        childName: `${r.childFirstName} ${r.childLastName}`.trim(),
        lessonId: r.lessonId,
        scheduledAt: r.scheduledAt,
        status: r.attendanceStatus,
        note: r.note,
        groupName: r.groupName,
        locationName: r.locationName,
        lessonStatus: r.lessonStatus,
        billedPerLesson: r.billedPerLesson,
      })),
      monthlySummary,
    });
  } catch (error) {
    console.error("GET /api/parent/attendance:", error);
    return NextResponse.json({ message: "Błąd pobierania obecności" }, { status: 500 });
  }
}
