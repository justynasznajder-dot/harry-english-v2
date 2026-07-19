import { NextRequest, NextResponse } from "next/server";
import { fetchScheduleConflicts, todayYmdWarsaw } from "@/lib/admin-dashboard";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";

function weekEndYmd(fromYmd: string): string {
  const d = new Date(`${fromYmd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const today = todayYmdWarsaw();
  const fromYmd = request.nextUrl.searchParams.get("from")?.trim() || today;
  const toYmd = request.nextUrl.searchParams.get("to")?.trim() || weekEndYmd(fromYmd);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    return NextResponse.json({ message: "Parametry from/to: RRRR-MM-DD" }, { status: 400 });
  }

  try {
    const conflicts = await fetchScheduleConflicts(ctx.schoolId, fromYmd, toYmd);
    return NextResponse.json({ from: fromYmd, to: toYmd, conflicts });
  } catch (error) {
    console.error("GET /api/admin/schedule/conflicts:", error);
    return NextResponse.json({ message: "Błąd pobierania konfliktów" }, { status: 500 });
  }
}
