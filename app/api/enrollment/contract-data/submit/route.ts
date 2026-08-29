import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import {
  getParentProfileByUserId,
  getRegistrationSchoolId,
  getUserById,
  queryDb,
} from "@/lib/db";
import {
  computeEnrollmentContractReadiness,
  fetchParentEnrollmentPipelineStatuses,
} from "@/lib/enrollment-contract-readiness";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import { isParentContractProfileComplete } from "@/lib/parent-contract-profile";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/**
 * Rodzic potwierdza uzupełnienie danych do umowy.
 * ACCEPTED → AWAITING_CONTRACT (umowę wygeneruje później manager szkoły).
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
    if (!user.school_id) {
      return NextResponse.json({ message: "Konto nie ma przypisanej szkoły" }, { status: 400 });
    }

    const complimentary = await isComplimentaryForParent(user.school_id, {
      parentId: user.id,
      parentEmail: user.email,
    });
    if (complimentary) {
      return NextResponse.json(
        { message: "Tryb bez opłat — dane do umowy nie są wymagane." },
        { status: 403 }
      );
    }

    const profile = await getParentProfileByUserId(parentId);
    if (!profile || !isParentContractProfileComplete(profile)) {
      return NextResponse.json(
        { message: "Najpierw zapisz kompletne dane do umowy." },
        { status: 400 }
      );
    }

    const pipelineStatuses = await fetchParentEnrollmentPipelineStatuses(
      user.school_id,
      user.id,
      user.email
    );
    const readiness = computeEnrollmentContractReadiness(pipelineStatuses, false);
    if (!readiness.canSubmitContractData) {
      return NextResponse.json(
        {
          message: readiness.hasPendingDecisions
            ? "Najpierw rozstrzygnij wszystkie propozycje grup (akceptacja lub kontakt ze szkołą)."
            : readiness.acceptedCount === 0
              ? "Brak zaakceptowanych dzieci — nie ma czego zgłaszać do umowy."
              : "Dane są już zgłoszone — poczekaj na wygenerowanie umowy przez szkołę.",
        },
        { status: 409 }
      );
    }

    const updated = await queryDb<{ id: string }>(
      `UPDATE enrollment_requests
       SET status = 'AWAITING_CONTRACT'
       WHERE school_id = $1
         AND user_id = $2
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'ACCEPTED'
       RETURNING id`,
      [SCHOOL_ID, parentId]
    );

    for (const row of updated.rows) {
      await syncChildrenAccessLevelForEnrollment(row.id, "AWAITING_CONTRACT");
    }
    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({
      message:
        "Dane do umowy zapisane. Poczekaj na ostateczne zatwierdzenie grupy — szkoła wygeneruje umowę.",
      updatedCount: updated.rows.length,
    });
  } catch (error) {
    console.error("POST /api/enrollment/contract-data/submit:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Nie udało się zgłosić danych do umowy";
    return NextResponse.json({ message }, { status: 500 });
  }
}
