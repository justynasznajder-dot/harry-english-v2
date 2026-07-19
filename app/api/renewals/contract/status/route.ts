import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, getUserById, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import { fetchParentRenewalIdsReadyForContract } from "@/lib/renewal-contract";
import { getPlannedNextSchoolYear } from "@/lib/school-year-planning";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const schoolId = getRegistrationSchoolId();

  try {
    const user = await getUserById(parentId);
    if (!user?.school_id) {
      return NextResponse.json({ message: "Brak przypisanej szkoły" }, { status: 400 });
    }

    const planned = await getPlannedNextSchoolYear(user.school_id);
    const readyIds = await fetchParentRenewalIdsReadyForContract(user.school_id, parentId);

    let contractStatus: string | null = null;
    if (planned) {
      const c = await queryDb<{ status: string }>(
        `SELECT status FROM contracts
         WHERE parent_id = $1 AND school_id = $2 AND child_id IS NULL
           AND school_year_id = $3
         ORDER BY created_at DESC LIMIT 1`,
        [parentId, user.school_id, planned.id]
      );
      contractStatus = c.rows[0]?.status ?? null;
    }

    return NextResponse.json({
      plannedSeason: planned?.name ?? null,
      acceptedRenewalIds: readyIds,
      canPrepareContract: readyIds.length > 0 && contractStatus !== "SIGNED",
      contractStatus,
    });
  } catch (error) {
    console.error("Renewal contract status error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu umowy" }, { status: 500 });
  }
}
