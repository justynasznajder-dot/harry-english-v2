import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb, runPgTransaction } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { syncChildAccessLevelForRenewal } from "@/lib/renewals";
import { syncParentUserAccessLevel } from "@/lib/enrollment-sync";

export async function POST(
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

  let body: { rejectionComment?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const rawComment = typeof body.rejectionComment === "string" ? body.rejectionComment.trim() : "";
  const rejectionComment = rawComment.length > 0 ? rawComment.slice(0, 2000) : null;

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
        { message: "Brak aktywnej propozycji do odrzucenia" },
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
           SET status = 'REJECTED',
               rejection_comment = $2,
               responded_at = NOW()
           WHERE id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'`,
          [pendingId, rejectionComment]
        );
        if ((u1.rowCount ?? 0) === 0) {
          throw new Error("__409_REJECT_RACE__");
        }
        await client.query(
          `UPDATE renewals SET status = 'NEGOTIATING', proposed_group_id = NULL WHERE id = $1`,
          [renewalId]
        );
      });
    } else {
      await queryDb(
        `UPDATE renewals SET status = 'NEGOTIATING', proposed_group_id = NULL WHERE id = $1`,
        [renewalId]
      );
    }

    await syncChildAccessLevelForRenewal(renewal.child_id, "NEGOTIATING");
    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "__409_REJECT_RACE__") {
      return NextResponse.json({ message: "Propozycja jest już nieaktywna" }, { status: 409 });
    }
    console.error("Renewal reject error:", error);
    return NextResponse.json({ message: "Nie udało się odrzucić propozycji" }, { status: 500 });
  }
}
