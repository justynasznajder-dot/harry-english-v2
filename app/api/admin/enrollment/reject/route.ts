import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { rejectEnrollmentParentResignation } from "@/lib/admin-enrollment-reject";

export async function POST(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) {
      return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    }
    if (!(await canAccessSchoolAdminApis(userId))) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const body = (await request.json().catch(() => ({}))) as { requestId?: string };
    const requestId = String(body.requestId ?? "").trim();
    if (!requestId) {
      return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
    }

    const result = await rejectEnrollmentParentResignation(tenant, requestId);
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
