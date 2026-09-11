import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { saveEnrollmentManagerComment } from "@/lib/admin-enrollment-proposal";

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = (await request.json()) as {
      requestId?: string;
      managerComment?: string | null;
    };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
    }

    const result = await saveEnrollmentManagerComment(requestId, body.managerComment ?? null, {
      ...(ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : {}),
    });
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ ok: true, message: "Zapisano komentarz" });
  } catch (error) {
    console.error("Admin enrollment manager-comment PATCH error:", error);
    return NextResponse.json({ message: "Błąd zapisu komentarza" }, { status: 500 });
  }
}
