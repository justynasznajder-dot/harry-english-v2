import { NextRequest, NextResponse } from "next/server";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import {
  fetchRenewalSendCandidates,
  sendRenewalInquiries,
} from "@/lib/renewal-send";
import { getActiveSchoolYearPlanning, getPlannedNextSchoolYear } from "@/lib/school-year-planning";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const [result, plannedNextYear, activeSchoolYear] = await Promise.all([
      fetchRenewalSendCandidates(schoolId),
      getPlannedNextSchoolYear(schoolId),
      getActiveSchoolYearPlanning(schoolId),
    ]);

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 409 });
    }

    return NextResponse.json({
      season: result.season,
      groups: result.groups,
      students: result.students,
      summary: result.summary,
      plannedNextYear,
      activeSchoolYear,
    });
  } catch (error) {
    console.error("GET renewal send-candidates:", error);
    return NextResponse.json({ message: "Błąd pobierania listy uczniów" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const body = (await request.json().catch(() => ({}))) as {
      mode?: unknown;
      groupIds?: unknown;
      excludedChildIds?: unknown;
    };

    const mode = body.mode === "groups" ? "groups" : "all";
    const groupIds = Array.isArray(body.groupIds)
      ? body.groupIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const excludedChildIds = Array.isArray(body.excludedChildIds)
      ? body.excludedChildIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    const result = await sendRenewalInquiries(schoolId, {
      groupIds: mode === "groups" ? groupIds : null,
      excludedChildIds,
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST renewal send-inquiries:", error);
    return NextResponse.json({ message: "Błąd wysyłania zapytań" }, { status: 500 });
  }
}
