import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryDb, runPgTransaction } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import { syncChildAccessLevelForRenewal } from "@/lib/renewals";
import { syncParentUserAccessLevel } from "@/lib/enrollment-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { userId, schoolId } = ctx;
    const { id: renewalId } = await params;

    const body = (await request.json().catch(() => ({}))) as { groupId?: unknown };
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) {
      return NextResponse.json({ message: "Brak groupId" }, { status: 400 });
    }

    const renewalRes = await queryDb<{
      id: string;
      child_id: string;
      parent_id: string;
      status: string;
    }>(
      `SELECT id, child_id, parent_id, UPPER(BTRIM(COALESCE(status::text, ''))) AS status
       FROM renewals
       WHERE id = $1 AND school_id = $2
       LIMIT 1`,
      [renewalId, schoolId]
    );
    const renewal = renewalRes.rows[0];
    if (!renewal) {
      return NextResponse.json({ message: "Nie znaleziono odnowienia" }, { status: 404 });
    }
    if (!["CONFIRMED", "NEGOTIATING"].includes(renewal.status)) {
      return NextResponse.json(
        { message: "Propozycję można wysłać tylko dla potwierdzonych lub negocjowanych odnowień" },
        { status: 409 }
      );
    }

    const groupRes = await queryDb<{ id: string }>(
      `SELECT id FROM groups WHERE id = $1 AND school_id = $2 AND active = TRUE LIMIT 1`,
      [groupId, schoolId]
    );
    if (!groupRes.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono grupy" }, { status: 404 });
    }

    let proposalCount = 0;
    try {
      proposalCount = await runPgTransaction(async (client) => {
        const pend = await client.query<{ id: string }>(
          `SELECT id FROM renewal_proposals
           WHERE renewal_id = $1
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING'
           LIMIT 1`,
          [renewalId]
        );
        if (pend.rows.length > 0) {
          throw new Error("__409_PENDING_PROPOSAL__");
        }

        const proposalId = randomUUID();
        await client.query(
          `INSERT INTO renewal_proposals (
             id, school_id, renewal_id, group_id, proposed_by, proposed_at, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, NOW(), 'PENDING', NOW())`,
          [proposalId, schoolId, renewalId, groupId, userId]
        );
        await client.query(
          `UPDATE renewals
           SET status = 'PROPOSED', proposed_group_id = $2
           WHERE id = $1`,
          [renewalId, groupId]
        );
        const cnt = await client.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM renewal_proposals WHERE renewal_id = $1`,
          [renewalId]
        );
        return Number(cnt.rows[0]?.n ?? "0");
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "__409_PENDING_PROPOSAL__") {
        return NextResponse.json(
          { message: "Aktywna propozycja czeka już na decyzję rodzica." },
          { status: 409 }
        );
      }
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
      if (code === "23505") {
        return NextResponse.json(
          { message: "Aktywna propozycja czeka już na decyzję rodzica." },
          { status: 409 }
        );
      }
      throw e;
    }

    await syncChildAccessLevelForRenewal(renewal.child_id, "PROPOSED");
    await syncParentUserAccessLevel(renewal.parent_id);

    return NextResponse.json({ proposalCount });
  } catch (error) {
    console.error("Admin renewal propose error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji" }, { status: 500 });
  }
}
