import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { setGroupScheduleChangeNotice } from "@/lib/group-schedule-change";

/**
 * Checkbox „zmiana harmonogramu” na profilu grupy.
 * Nie wysyła maili ani wiadomości do rodziców — tylko flaga + ewentualny snapshot.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scheduleChangeNotice?: unknown;
    };
    if (typeof body.scheduleChangeNotice !== "boolean") {
      return NextResponse.json(
        { message: "Podaj scheduleChangeNotice: true|false" },
        { status: 400 }
      );
    }

    const result = await setGroupScheduleChangeNotice(
      id,
      ctx.schoolId,
      body.scheduleChangeNotice
    );
    if (!result.ok) {
      if (result.status === 404) return tenantNotFoundResponse(result.message);
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      message: body.scheduleChangeNotice
        ? "Zmiana harmonogramu włączona — możesz edytować terminy. Rodzice zobaczą informację w panelu (bez maila)."
        : "Zmiana harmonogramu wyłączona — edycja zablokowana. Snapshot z umowy pozostaje.",
      scheduleChangeNotice: result.scheduleChangeNotice,
      scheduleBeforeLabel: result.scheduleBeforeLabel,
    });
  } catch (error) {
    console.error("PATCH schedule-change-notice error:", error);
    return NextResponse.json({ message: "Błąd zapisu flagi harmonogramu" }, { status: 500 });
  }
}
