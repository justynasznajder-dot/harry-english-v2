import { NextRequest, NextResponse } from "next/server";
import { countOpenResignations, fetchResignationsList } from "@/lib/admin-dashboard";
import { deleteChild, queryDb, updateChild } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { adjustContractsAfterChildResignation } from "@/lib/resignation-contracts";

export async function GET(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    if (request.nextUrl.searchParams.get("countOnly") === "1") {
      const openCount = await countOpenResignations(ctx.schoolId);
      return NextResponse.json({ openCount });
    }
    const resignations = await fetchResignationsList(ctx.schoolId);
    return NextResponse.json({
      resignations,
      openCount: resignations.length,
    });
  } catch (error) {
    console.error("GET /api/admin/resignations:", error);
    return NextResponse.json({ message: "Błąd pobierania rezygnacji" }, { status: 500 });
  }
}

/**
 * action:
 * - acknowledge — usuwa flagę zgłoszenia (dziecko zostaje w grupie)
 * - process — anuluje umowy z tym dzieckiem, generuje nową dla pozostałych,
 *   wypisuje z grupy, dezaktywuje dziecko
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminSchoolContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const body = (await request.json()) as {
      childId?: string;
      action?: "acknowledge" | "process";
    };
    const childId = String(body.childId ?? "").trim();
    const action = body.action;
    if (!childId || (action !== "acknowledge" && action !== "process")) {
      return NextResponse.json(
        { message: "Wymagane: childId oraz action (acknowledge|process)" },
        { status: 400 }
      );
    }

    const childRes = await queryDb<{ id: string; resignation_requested: boolean }>(
      `SELECT id, resignation_requested
       FROM children
       WHERE id = $1 AND school_id = $2 AND active = TRUE
       LIMIT 1`,
      [childId, ctx.schoolId]
    );
    const child = childRes.rows[0];
    if (!child) {
      return NextResponse.json({ message: "Nie znaleziono aktywnego dziecka" }, { status: 404 });
    }
    if (!child.resignation_requested) {
      return NextResponse.json(
        { message: "To dziecko nie ma otwartego zgłoszenia rezygnacji" },
        { status: 400 }
      );
    }

    if (action === "acknowledge") {
      const ok = await updateChild(childId, ctx.schoolId, {
        resignation_requested: false,
      });
      if (!ok) {
        return NextResponse.json({ message: "Nie udało się zaktualizować" }, { status: 500 });
      }
      return NextResponse.json({
        message: "Oznaczono jako obsłużone — dziecko nadal jest w grupie.",
      });
    }

    const contractAdjustment = await adjustContractsAfterChildResignation({
      schoolId: ctx.schoolId,
      childId,
    });

    await queryDb(
      `UPDATE group_students gs
       SET left_at = NOW()
       FROM groups g
       WHERE gs.group_id = g.id
         AND g.school_id = $1
         AND gs.child_id = $2
         AND gs.left_at IS NULL`,
      [ctx.schoolId, childId]
    );

    const deactivated = await deleteChild(childId, ctx.schoolId);
    if (!deactivated) {
      return NextResponse.json(
        { message: "Wypisano z grupy, ale nie udało się dezaktywować dziecka" },
        { status: 500 }
      );
    }

    await updateChild(childId, ctx.schoolId, {
      resignation_requested: false,
    });

    const cancelled = contractAdjustment.cancelledContractIds.length;
    const recalculated = contractAdjustment.recalculatedContractIds.length;
    const needingNew = contractAdjustment.childrenNeedingNewContract.length;
    let message = "Dziecko wypisane z grupy i oznaczone jako nieaktywne.";
    if (cancelled > 0) {
      message += ` Anulowano ${cancelled} umów(y) tego dziecka.`;
    }
    if (recalculated > 0) {
      message += ` Przeliczono rabat rodzeństwa na ${recalculated} umowach pozostałych dzieci.`;
    }
    if (needingNew > 0) {
      message += ` ${needingNew} pozostałe dziecko/dzieci z dawnej umowy zbiorczej musi dostać nową umowę (1 dziecko = 1 umowa).`;
    }

    return NextResponse.json({
      message,
      contractAdjustment,
    });
  } catch (error) {
    console.error("POST /api/admin/resignations:", error);
    const message =
      error instanceof Error ? error.message : "Błąd obsługi rezygnacji";
    return NextResponse.json({ message }, { status: 500 });
  }
}
