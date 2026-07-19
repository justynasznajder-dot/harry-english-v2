import { NextRequest, NextResponse } from "next/server";
import { completePastScheduledLessons } from "@/lib/lesson-completion";
import { fetchParentCalendar, verifyChildBelongsToParent } from "@/lib/parent-portal";
import { requireParentContext } from "@/lib/parent-portal-auth";

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;
  const fromYmd = request.nextUrl.searchParams.get("from")?.trim() ?? "";
  const toYmd = request.nextUrl.searchParams.get("to")?.trim() ?? "";
  const childId = request.nextUrl.searchParams.get("childId")?.trim() ?? null;

  if (!isYmd(fromYmd) || !isYmd(toYmd)) {
    return NextResponse.json(
      { message: "Parametry from i to muszą być w formacie RRRR-MM-DD" },
      { status: 400 }
    );
  }
  if (fromYmd > toYmd) {
    return NextResponse.json(
      { message: "Data „from” nie może być późniejsza niż „to”" },
      { status: 400 }
    );
  }

  if (childId) {
    const allowed = await verifyChildBelongsToParent(childId, parentId, schoolId);
    if (!allowed) {
      return NextResponse.json({ message: "Brak dostępu do danych dziecka" }, { status: 403 });
    }
  }

  try {
    await completePastScheduledLessons();
    const data = await fetchParentCalendar(parentId, schoolId, fromYmd, toYmd, childId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/parent/calendar:", error);
    return NextResponse.json({ message: "Błąd pobierania kalendarza" }, { status: 500 });
  }
}
