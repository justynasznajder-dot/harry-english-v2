import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { setParentLargeFamilyCard } from "@/lib/parent-profile-discount";
import { requireParentContext } from "@/lib/parent-portal-auth";

/**
 * Zapis deklaracji rabatów rodzica (KDR + „więcej niż jedno dziecko”)
 * bez pełnego formularza profilu / generowania umowy.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;
  const body = (await request.json().catch(() => ({}))) as {
    discountLargeFamily?: unknown;
    discount_large_family?: unknown;
    enrollingMultipleChildren?: unknown;
    enrolling_multiple_children?: unknown;
  };

  const kdrRaw = body.discountLargeFamily ?? body.discount_large_family;
  const siblingRaw =
    body.enrollingMultipleChildren ?? body.enrolling_multiple_children;

  const discountLargeFamily =
    kdrRaw === undefined
      ? undefined
      : kdrRaw === true || kdrRaw === "true" || kdrRaw === 1 || kdrRaw === "1";
  const enrollingMultipleChildren =
    siblingRaw === undefined
      ? undefined
      : siblingRaw === true ||
        siblingRaw === "true" ||
        siblingRaw === 1 ||
        siblingRaw === "1";

  if (discountLargeFamily === undefined && enrollingMultipleChildren === undefined) {
    return NextResponse.json(
      { message: "Brak pól do aktualizacji" },
      { status: 400 }
    );
  }

  try {
    if (discountLargeFamily !== undefined) {
      await setParentLargeFamilyCard({
        schoolId,
        parentUserId: parentId,
        discountLargeFamily,
      });
    }
    if (enrollingMultipleChildren !== undefined) {
      await queryDb(
        `UPDATE enrollment_requests
         SET enrolling_multiple_children = $3
         WHERE school_id = $1
           AND user_id = $2
           AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'`,
        [schoolId, parentId, enrollingMultipleChildren]
      );
    }

    return NextResponse.json({
      discountLargeFamily:
        discountLargeFamily ??
        (
          await queryDb<{ v: boolean }>(
            `SELECT COALESCE(discount_large_family, FALSE) AS v
             FROM parent_profiles WHERE user_id = $1 LIMIT 1`,
            [parentId]
          )
        ).rows[0]?.v === true,
      enrollingMultipleChildren:
        enrollingMultipleChildren ??
        (
          await queryDb<{ v: boolean }>(
            `SELECT COALESCE(BOOL_OR(enrolling_multiple_children), FALSE) AS v
             FROM enrollment_requests
             WHERE school_id = $1 AND user_id = $2
               AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'`,
            [schoolId, parentId]
          )
        ).rows[0]?.v === true,
    });
  } catch (error) {
    console.error("PATCH /api/enrollment/discounts:", error);
    return NextResponse.json({ message: "Nie udało się zapisać rabatów" }, { status: 500 });
  }
}
