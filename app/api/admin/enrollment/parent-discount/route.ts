import { NextRequest, NextResponse } from "next/server";
import { queryDb, resolveAdminUsersSchoolScope } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  clearEnrollmentSiblingDiscount,
  resolveParentUserIdForEnrollment,
  setEnrollmentPendingLargeFamilyCard,
  setEnrollmentSiblingDiscount,
  setParentLargeFamilyCard,
} from "@/lib/parent-profile-discount";
import { isComplimentaryForParent } from "@/lib/school-discounts";

function parseOptionalBool(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

/**
 * Manager ustawia te same flagi co rodzic w panelu zapisów:
 * - KDR → parent_profiles.discount_large_family (+ staging na enrollment_requests)
 * - rodzeństwo → enrollment_requests.enrolling_multiple_children
 * Tryb z umową: rabaty się nie sumują — przy włączeniu jednego czyścimy drugie.
 * Tryb bez umowy: KDR + rodzeństwo mogą być równocześnie (sumują się z % managera).
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const parentUserId = String(body.parentUserId ?? body.parent_user_id ?? "").trim();
    const parentEmail = String(body.parentEmail ?? body.parent_email ?? "").trim();
    const discountLargeFamily = parseOptionalBool(
      body.discountLargeFamily ?? body.discount_large_family
    );
    const enrollingMultipleChildren = parseOptionalBool(
      body.enrollingMultipleChildren ?? body.enrolling_multiple_children
    );

    if (discountLargeFamily === undefined && enrollingMultipleChildren === undefined) {
      return NextResponse.json(
        { message: "Brak pól do aktualizacji (KDR lub rodzeństwo)" },
        { status: 400 }
      );
    }

    const schoolScope =
      ctx.tenant.role === "MANAGER"
        ? ctx.schoolId
        : resolveAdminUsersSchoolScope(ctx.tenant);

    const resolvedParentId = await resolveParentUserIdForEnrollment({
      schoolId: schoolScope,
      parentUserId: parentUserId || null,
      parentEmail: parentEmail || null,
    });

    const parentSchoolId = resolvedParentId
      ? (
          await queryDb<{ school_id: string }>(
            `SELECT school_id FROM users WHERE id = $1 LIMIT 1`,
            [resolvedParentId]
          )
        ).rows[0]?.school_id ?? schoolScope
      : schoolScope;

    const complimentary = await isComplimentaryForParent(parentSchoolId, {
      parentId: resolvedParentId,
      parentEmail: parentEmail || null,
    });

    let nextKdr = discountLargeFamily;
    let nextSibling = enrollingMultipleChildren;
    // Tryb z umową: wzajemne wykluczanie jak u rodzica.
    if (!complimentary) {
      if (nextKdr === true) nextSibling = false;
      if (nextSibling === true) nextKdr = false;
    }

    if (resolvedParentId) {
      if (nextKdr !== undefined) {
        await setParentLargeFamilyCard({
          schoolId: parentSchoolId,
          parentUserId: resolvedParentId,
          discountLargeFamily: nextKdr,
        });
        if (parentEmail) {
          await setEnrollmentPendingLargeFamilyCard({
            schoolId: parentSchoolId,
            parentEmail,
            discountLargeFamily: nextKdr,
          });
        }
        if (!complimentary && nextKdr === true) {
          await clearEnrollmentSiblingDiscount({
            schoolId: parentSchoolId,
            parentUserId: resolvedParentId,
            parentEmail: parentEmail || null,
          });
        }
      }

      if (nextSibling !== undefined) {
        if (!complimentary && nextSibling === true) {
          await setParentLargeFamilyCard({
            schoolId: parentSchoolId,
            parentUserId: resolvedParentId,
            discountLargeFamily: false,
          });
          if (parentEmail) {
            await setEnrollmentPendingLargeFamilyCard({
              schoolId: parentSchoolId,
              parentEmail,
              discountLargeFamily: false,
            });
          }
        }
        await setEnrollmentSiblingDiscount({
          schoolId: parentSchoolId,
          parentUserId: resolvedParentId,
          parentEmail: parentEmail || null,
          enrollingMultipleChildren: nextSibling,
        });
      }

      return NextResponse.json({
        message: "Zapisano zniżki rodzica",
        parentUserId: resolvedParentId,
        discountLargeFamily: nextKdr,
        enrollingMultipleChildren: nextSibling,
        complimentary,
      });
    }

    if (!parentEmail) {
      return NextResponse.json(
        {
          message:
            "Podaj e-mail rodzica, aby oznaczyć zniżkę (konto rodzica jeszcze nie istnieje).",
        },
        { status: 400 }
      );
    }

    let updated = 0;

    if (nextKdr !== undefined) {
      updated += await setEnrollmentPendingLargeFamilyCard({
        schoolId: schoolScope,
        parentEmail,
        discountLargeFamily: nextKdr,
      });
      if (!complimentary && nextKdr === true) {
        await clearEnrollmentSiblingDiscount({
          schoolId: schoolScope,
          parentEmail,
        });
      }
    }

    if (nextSibling !== undefined) {
      if (!complimentary && nextSibling === true) {
        await setEnrollmentPendingLargeFamilyCard({
          schoolId: schoolScope,
          parentEmail,
          discountLargeFamily: false,
        });
      }
      updated += await setEnrollmentSiblingDiscount({
        schoolId: schoolScope,
        parentEmail,
        enrollingMultipleChildren: nextSibling,
      });
    }

    if (updated === 0) {
      return NextResponse.json(
        { message: "Nie znaleziono aktywnych zgłoszeń dla tego e-maila." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message:
        "Zapisano zniżki na zgłoszeniu (konto rodzica jeszcze nie istnieje — po logowaniu rodzic zobaczy zaznaczone opcje)",
      parentUserId: null,
      discountLargeFamily: nextKdr,
      enrollingMultipleChildren: nextSibling,
      complimentary,
    });
  } catch (error) {
    console.error("Admin enrollment parent-discount PATCH error:", error);
    return NextResponse.json({ message: "Błąd zapisu zniżki rodzica" }, { status: 500 });
  }
}
