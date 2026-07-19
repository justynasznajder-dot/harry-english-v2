import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

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
    const upd = await queryDb(
      `UPDATE renewals
       SET status = 'CONFIRMED', confirmed_at = NOW()
       WHERE id = $1
         AND parent_id = $2
         AND school_id = $3
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PENDING_CONFIRMATION'`,
      [renewalId, parentId, schoolId]
    );
    if ((upd.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Nie znaleziono odnowienia lub zostało już potwierdzone" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Renewal confirm error:", error);
    return NextResponse.json({ message: "Nie udało się potwierdzić odnowienia" }, { status: 500 });
  }
}
