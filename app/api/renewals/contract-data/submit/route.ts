import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import {
  getParentProfileByUserId,
  getRegistrationSchoolId,
  getUserById,
  queryDb,
} from "@/lib/db";
import { isParentContractProfileComplete } from "@/lib/parent-contract-profile";
import { syncChildAccessLevelForRenewal } from "@/lib/renewals";

/**
 * Rodzic potwierdza dane do umowy odnowienia.
 * ACCEPTED → AWAITING_CONTRACT (umowę wygeneruje później manager).
 *
 * Body: `{ renewalId?: string }` — bez id: wszystkie ACCEPTED rodzica.
 */
export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
    const user = await getUserById(parentId);
    if (!user || user.role !== "PARENT") {
      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
    }

    const profile = await getParentProfileByUserId(parentId);
    if (!profile || !isParentContractProfileComplete(profile)) {
      return NextResponse.json(
        {
          message:
            "Najpierw uzupełnij dane do umowy (w procesie zapisu lub w zakładce Profil i dane do faktury).",
        },
        { status: 400 }
      );
    }

    let renewalId: string | null = null;
    try {
      const body = (await request.json().catch(() => ({}))) as { renewalId?: unknown };
      if (typeof body.renewalId === "string" && body.renewalId.trim()) {
        renewalId = body.renewalId.trim();
      }
    } catch {
      /* optional body */
    }

    const updated = renewalId
      ? await queryDb<{ id: string; child_id: string }>(
          `UPDATE renewals
           SET status = 'AWAITING_CONTRACT'
           WHERE id = $1
             AND parent_id = $2
             AND school_id = $3
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'ACCEPTED'
           RETURNING id, child_id`,
          [renewalId, parentId, SCHOOL_ID]
        )
      : await queryDb<{ id: string; child_id: string }>(
          `UPDATE renewals
           SET status = 'AWAITING_CONTRACT'
           WHERE parent_id = $1
             AND school_id = $2
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'ACCEPTED'
           RETURNING id, child_id`,
          [parentId, SCHOOL_ID]
        );

    if (updated.rows.length === 0) {
      return NextResponse.json(
        {
          message: renewalId
            ? "To odnowienie nie jest w statusie oczekującym na dane do umowy."
            : "Brak odnowień do zgłoszenia danych.",
        },
        { status: 409 }
      );
    }

    for (const row of updated.rows) {
      await syncChildAccessLevelForRenewal(row.child_id, "AWAITING_CONTRACT");
    }

    return NextResponse.json({
      message:
        "Dane do umowy potwierdzone. Poczekaj na ostateczne zatwierdzenie grupy — szkoła wygeneruje umowę.",
      updatedCount: updated.rows.length,
    });
  } catch (error) {
    console.error("POST /api/renewals/contract-data/submit:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Nie udało się zgłosić danych do umowy";
    return NextResponse.json({ message }, { status: 500 });
  }
}
