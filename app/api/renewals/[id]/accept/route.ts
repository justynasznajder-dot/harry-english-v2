import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb, runPgTransaction } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { syncChildAccessLevelForRenewal } from "@/lib/renewals";
import { syncParentUserAccessLevel } from "@/lib/enrollment-sync";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const schoolId = getRegistrationSchoolId();
  const { id: renewalId } = await params;

  try {
    const renewalRes = await queryDb<{ child_id: string; status: string }>(
      `SELECT child_id, UPPER(BTRIM(COALESCE(status::text, ''))) AS status
       FROM renewals
       WHERE id = $1 AND parent_id = $2 AND school_id = $3
       LIMIT 1`,
      [renewalId, parentId, schoolId]
    );
    const renewal = renewalRes.rows[0];
    if (!renewal || renewal.status !== "PROPOSED") {
      return NextResponse.json(
        { message: "Brak aktywnej propozycji do zaakceptowania" },
        { status: 409 }
      );
    }

    const pendingRes = await queryDb<{ id: string }>(
      `SELECT id FROM renewal_proposals
       WHERE renewal_id = $1
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'
       LIMIT 1`,
      [renewalId]
    );
    const pendingId = pendingRes.rows[0]?.id ?? null;

    if (pendingId) {
      await runPgTransaction(async (client) => {
        const u1 = await client.query(
          `UPDATE renewal_proposals
           SET status = 'ACCEPTED', responded_at = NOW()
           WHERE id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'`,
          [pendingId]
        );
        if ((u1.rowCount ?? 0) === 0) {
          throw new Error("__409_ACCEPT_RACE__");
        }
        await client.query(
          `UPDATE renewals SET status = 'ACCEPTED' WHERE id = $1`,
          [renewalId]
        );
      });
    } else {
      await queryDb(`UPDATE renewals SET status = 'ACCEPTED' WHERE id = $1`, [renewalId]);
    }

    await syncChildAccessLevelForRenewal(renewal.child_id, "ACCEPTED");
    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "__409_ACCEPT_RACE__") {
      return NextResponse.json({ message: "Propozycja jest już nieaktywna" }, { status: 409 });
    }
    console.error("Renewal accept error:", error);
    return NextResponse.json({ message: "Nie udało się zaakceptować propozycji" }, { status: 500 });
  }
}
