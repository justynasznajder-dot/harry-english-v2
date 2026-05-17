import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import { renewalProposalsListQuery } from "@/lib/renewal-proposals-list-sql";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;
    const { id: renewalId } = await params;

    const ownRes = await queryDb<{ ok: string }>(
      `SELECT id::text AS ok FROM renewals WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [renewalId, schoolId]
    );
    if (!ownRes.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono odnowienia" }, { status: 404 });
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
    }>(renewalProposalsListQuery(), [renewalId]);

    return NextResponse.json({ proposals: rows.rows });
  } catch (error) {
    console.error("Admin renewal proposals GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania historii propozycji" }, { status: 500 });
  }
}
