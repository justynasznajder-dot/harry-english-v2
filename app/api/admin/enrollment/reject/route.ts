import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { rejectEnrollmentParentResignation } from "@/lib/admin-enrollment-reject";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = (await request.json().catch(() => ({}))) as { requestId?: string };
    const requestId = String(body.requestId ?? "").trim();
    if (!requestId) {
      return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
    }

    const result = await rejectEnrollmentParentResignation(ctx.tenant, requestId);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({
      message: "Zgłoszenie oznaczone jako rezygnacja rodzica (odrzucone).",
    });
  } catch (error) {
    console.error("POST /api/admin/enrollment/reject:", error);
    return NextResponse.json(
      { message: "Nie udało się oznaczyć rezygnacji rodzica" },
      { status: 500 }
    );
  }
}
