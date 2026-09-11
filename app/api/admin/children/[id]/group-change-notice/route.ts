import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext, tenantNotFoundResponse } from "@/lib/admin-school-context";
import { setChildGroupChangeNotice } from "@/lib/group-change-notice";

/**
 * Checkbox „zmiana grupy” na profilu ucznia (aktywne group_students).
 * Bez maila — tylko flaga + snapshot nazwy poprzedniej grupy.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  const { id: childId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      groupChangeNotice?: unknown;
    };
    if (typeof body.groupChangeNotice !== "boolean") {
      return NextResponse.json(
        { message: "Podaj groupChangeNotice: true|false" },
        { status: 400 }
      );
    }

    const result = await setChildGroupChangeNotice(
      childId,
      ctx.schoolId,
      body.groupChangeNotice
    );
    if (!result.ok) {
      if (result.status === 404) return tenantNotFoundResponse(result.message);
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      message: body.groupChangeNotice
        ? "Zmiana grupy włączona — możesz przenieść ucznia. Rodzic zobaczy informację w panelu (bez maila)."
        : "Zmiana grupy wyłączona — komunikat w panelu rodzica ukryty. Snapshot poprzedniej grupy pozostaje.",
      groupChangeNotice: result.groupChangeNotice,
      groupBeforeLabel: result.groupBeforeLabel,
      groupId: result.groupId,
      groupName: result.groupName,
      membershipId: result.membershipId,
    });
  } catch (error) {
    console.error("PATCH children group-change-notice error:", error);
    return NextResponse.json({ message: "Błąd zapisu flagi zmiany grupy" }, { status: 500 });
  }
}
