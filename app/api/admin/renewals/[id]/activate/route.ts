import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId, userId } = ctx;
    const { id: renewalId } = await params;

    const renewalRes = await queryDb<{
      id: string;
      child_id: string;
      parent_id: string;
      status: string;
      child_first: string;
      child_last: string;
    }>(
      `SELECT r.id, r.child_id, r.parent_id, r.status,
              c.first_name AS child_first, c.last_name AS child_last
       FROM renewals r
       JOIN children c ON c.id = r.child_id
       WHERE r.id = $1 AND r.school_id = $2
       LIMIT 1`,
      [renewalId, schoolId]
    );
    const renewal = renewalRes.rows[0];
    if (!renewal) {
      return NextResponse.json({ message: "Nie znaleziono odnowienia" }, { status: 404 });
    }

    const status = String(renewal.status ?? "")
      .trim()
      .toUpperCase();
    if (status !== "DRAFT") {
      return NextResponse.json(
        { message: "Zapytanie można wysłać tylko dla odnowienia w statusie szkicu" },
        { status: 409 }
      );
    }

    await queryDb(
      `UPDATE renewals
       SET status = 'PENDING_CONFIRMATION',
           initiated_at = NOW()
       WHERE id = $1 AND school_id = $2`,
      [renewalId, schoolId]
    );

    return NextResponse.json({
      success: true,
      message: `Zapytanie o odnowienie wysłane do rodzica (${renewal.child_first} ${renewal.child_last})`,
      activatedBy: userId,
    });
  } catch (error) {
    console.error("Admin renewal activate error:", error);
    return NextResponse.json({ message: "Błąd aktywacji odnowienia" }, { status: 500 });
  }
}
