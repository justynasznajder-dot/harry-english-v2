import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

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

  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 2000)
        : null;

    const upd = await queryDb<{ child_id: string }>(
      `UPDATE renewals
       SET status = 'RESIGNED'
       WHERE id = $1
         AND parent_id = $2
         AND school_id = $3
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING_CONFIRMATION'
       RETURNING child_id`,
      [renewalId, parentId, schoolId]
    );
    if ((upd.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Nie znaleziono odnowienia lub nie można zgłosić rezygnacji" },
        { status: 409 }
      );
    }

    const childId = upd.rows[0]?.child_id;
    if (childId && reason) {
      await queryDb(
        `UPDATE children
         SET resignation_requested = TRUE,
             resignation_reason = $2
         WHERE id = $1 AND parent_id = $3`,
        [childId, reason, parentId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Renewal decline error:", error);
    return NextResponse.json({ message: "Nie udało się zgłosić rezygnacji" }, { status: 500 });
  }
}
