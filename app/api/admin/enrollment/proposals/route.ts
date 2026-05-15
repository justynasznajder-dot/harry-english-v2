import { NextRequest, NextResponse } from "next/server";
import { canAccessSchoolAdminApis, getDbShape, queryDb, resolveAdminPanelTenant } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { enrollmentProposalsListQuery } from "@/lib/enrollment-proposals-list-sql";

export async function GET(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const enrollmentRequestId = request.nextUrl.searchParams.get("enrollmentRequestId")?.trim() ?? "";
    if (!enrollmentRequestId) {
      return NextResponse.json({ message: "Brak parametru enrollmentRequestId" }, { status: 400 });
    }

    const shape = await getDbShape();
    if (!shape.hasEnrollmentProposalsTable) {
      return NextResponse.json({ proposals: [] });
    }

    const ownRes =
      tenant.role === "MANAGER"
        ? await queryDb<{ ok: string }>(
            `SELECT er.id::text AS ok
             FROM enrollment_requests er
             WHERE er.id = $1 AND er.school_id = $2
             LIMIT 1`,
            [enrollmentRequestId, tenant.tenantSchoolId]
          )
        : await queryDb<{ ok: string }>(
            `SELECT er.id::text AS ok FROM enrollment_requests er WHERE er.id = $1 LIMIT 1`,
            [enrollmentRequestId]
          );
    if (!ownRes.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono zgłoszenia" }, { status: 404 });
    }

    const rows = await queryDb<{
      id: string;
      proposed_at: Date | string;
      responded_at: Date | string | null;
      status: string;
      rejection_comment: string | null;
      group_id: string;
      group_name: string;
      location_name: string;
      schedule: string;
      proposed_by_first_name: string;
      proposed_by_last_name: string;
    }>(enrollmentProposalsListQuery(), [enrollmentRequestId]);

    return NextResponse.json({ proposals: rows.rows });
  } catch (error) {
    console.error("Admin enrollment proposals GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania historii propozycji" }, { status: 500 });
  }
}
