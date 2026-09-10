import { NextRequest, NextResponse } from "next/server";
import { completeComplimentaryEnrollment } from "@/lib/complimentary-enrollment";
import { queryDb } from "@/lib/db";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import { setParentLargeFamilyCard } from "@/lib/parent-profile-discount";
import { assertSiblingDiscountEligible } from "@/lib/parent-contract";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/**
 * Rodzic akceptuje propozycję grupy.
 *
 * Body (opcjonalne): `{ requestId?, discountLargeFamily?, enrollingMultipleChildren? }`.
 *
 * Tryb bez umowy: zapis kończy się od razu (COMPLETED), bez umowy/wizerunku;
 * ewentualnie generuje zgodę na odbiór przez lektora. Kwoty netto (po rabacie) trafiają na children.
 * Standardowo: ACCEPTED → uzupełnienie danych do umowy (bez auto-generowania).
 */
export async function PUT(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId: SCHOOL_ID } = auth.ctx;

  let requestedId: string | null = null;
  let discountLargeFamily: boolean | undefined;
  let enrollingMultipleChildren: boolean | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      requestId?: unknown;
      discountLargeFamily?: unknown;
      discount_large_family?: unknown;
      enrollingMultipleChildren?: unknown;
      enrolling_multiple_children?: unknown;
    };
    if (typeof body.requestId === "string" && body.requestId.trim().length > 0) {
      requestedId = body.requestId.trim();
    }
    const kdrRaw = body.discountLargeFamily ?? body.discount_large_family;
    if (kdrRaw !== undefined) {
      discountLargeFamily =
        kdrRaw === true || kdrRaw === "true" || kdrRaw === 1 || kdrRaw === "1";
    }
    const siblingRaw =
      body.enrollingMultipleChildren ?? body.enrolling_multiple_children;
    if (siblingRaw !== undefined) {
      enrollingMultipleChildren =
        siblingRaw === true ||
        siblingRaw === "true" ||
        siblingRaw === 1 ||
        siblingRaw === "1";
    }
  } catch {
    /* brak body — fallback poniżej */
  }

  try {
    const parentRes = await queryDb<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE id = $1 AND school_id = $2 AND role = 'PARENT' LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    const parent = parentRes.rows[0];
    if (!parent) {
      return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });
    }

    const enrollmentRes = requestedId
      ? await queryDb<{ id: string }>(
          `SELECT id
           FROM enrollment_requests
           WHERE id = $1 AND user_id = $2 AND school_id = $3
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           LIMIT 1`,
          [requestedId, parentId, SCHOOL_ID]
        )
      : await queryDb<{ id: string }>(
          `SELECT id
           FROM enrollment_requests
           WHERE user_id = $1 AND school_id = $2
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           ORDER BY created_at DESC
           LIMIT 1`,
          [parentId, SCHOOL_ID]
        );

    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json(
        {
          message: requestedId
            ? "Propozycja nieaktywna lub nie należy do Twojego konta"
            : "Brak propozycji do akceptacji",
        },
        { status: requestedId ? 409 : 400 }
      );
    }

    const complimentary = await isComplimentaryForParent(SCHOOL_ID, {
      parentId,
      parentEmail: parent.email,
    });

    if (discountLargeFamily !== undefined) {
      await setParentLargeFamilyCard({
        schoolId: SCHOOL_ID,
        parentUserId: parentId,
        discountLargeFamily,
      });
    }
    if (enrollingMultipleChildren !== undefined) {
      if (enrollingMultipleChildren === true) {
        const eligible = await assertSiblingDiscountEligible(parentId, SCHOOL_ID);
        if (!eligible.ok) {
          return NextResponse.json({ message: eligible.message }, { status: 400 });
        }
      }
      await queryDb(
        `UPDATE enrollment_requests
         SET enrolling_multiple_children = $3
         WHERE school_id = $1
           AND user_id = $2
           AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'`,
        [SCHOOL_ID, parentId, enrollingMultipleChildren]
      );
    }

    if (complimentary) {
      await completeComplimentaryEnrollment(enrollment.id, parentId, SCHOOL_ID);
    } else {
      await queryDb(
        `UPDATE enrollment_requests
         SET status = 'ACCEPTED', accepted_at = NOW()
         WHERE id = $1`,
        [enrollment.id]
      );
      await syncChildrenAccessLevelForEnrollment(enrollment.id, "ACCEPTED");
      await syncParentUserAccessLevel(parentId);
    }

    const remainingRes = await queryDb<{ remaining: string }>(
      `SELECT COUNT(*)::text AS remaining
       FROM children
       WHERE parent_id = $1
         AND school_id = $2
         AND active = TRUE
         AND UPPER(BTRIM(COALESCE(access_level::text, ''))) = 'PROPOSED'`,
      [parentId, SCHOOL_ID]
    );
    const remaining = Number(remainingRes.rows[0]?.remaining ?? "0");

    return NextResponse.json({
      message: complimentary
        ? remaining === 0
          ? "Propozycja zaakceptowana — zapis został zakończony (tryb bez umowy)."
          : "Propozycja zaakceptowana — zapis tego dziecka zakończony. Pozostałe propozycje czekają na decyzję."
        : remaining === 0
          ? "Propozycja zaakceptowana — przejdź do uzupełnienia danych do umowy."
          : "Propozycja zaakceptowana. Pozostałe dzieci czekają na Twoją decyzję lub na odrzucenie przez szkołę.",
      remainingProposed: remaining,
      complimentaryEnrollment: complimentary,
      enrollmentCompleted: complimentary,
    });
  } catch (error) {
    console.error("Enrollment accept error:", error);
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Nie udało się zaakceptować propozycji";
    return NextResponse.json({ message }, { status: 500 });
  }
}
