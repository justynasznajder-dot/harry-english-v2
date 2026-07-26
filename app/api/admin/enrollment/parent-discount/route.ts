import { NextRequest, NextResponse } from "next/server";
import { queryDb, resolveAdminUsersSchoolScope } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  resolveParentUserIdForEnrollment,
  setEnrollmentPendingLargeFamilyCard,
  setParentLargeFamilyCard,
} from "@/lib/parent-profile-discount";

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const parentUserId = String(body.parentUserId ?? body.parent_user_id ?? "").trim();
    const parentEmail = String(body.parentEmail ?? body.parent_email ?? "").trim();
    const discountLargeFamily = Boolean(
      body.discountLargeFamily ?? body.discount_large_family ?? false
    );

    const schoolScope =
      ctx.tenant.role === "MANAGER"
        ? ctx.schoolId
        : resolveAdminUsersSchoolScope(ctx.tenant);

    const resolvedParentId = await resolveParentUserIdForEnrollment({
      schoolId: schoolScope,
      parentUserId: parentUserId || null,
      parentEmail: parentEmail || null,
    });

    if (resolvedParentId) {
      const parentSchoolRes = await queryDb<{ school_id: string }>(
        `SELECT school_id FROM users WHERE id = $1 LIMIT 1`,
        [resolvedParentId]
      );
      const parentSchoolId = parentSchoolRes.rows[0]?.school_id ?? schoolScope;

      await setParentLargeFamilyCard({
        schoolId: parentSchoolId,
        parentUserId: resolvedParentId,
        discountLargeFamily,
      });

      // Utrzymaj spójność stagingu na zgłoszeniach (gdy jest e-mail).
      if (parentEmail) {
        await setEnrollmentPendingLargeFamilyCard({
          schoolId: parentSchoolId,
          parentEmail,
          discountLargeFamily,
        });
      }

      return NextResponse.json({
        message: discountLargeFamily
          ? "Oznaczono Kartę Dużej Rodziny"
          : "Usunięto oznaczenie Karty Dużej Rodziny",
        parentUserId: resolvedParentId,
        discountLargeFamily,
      });
    }

    if (!parentEmail) {
      return NextResponse.json(
        { message: "Podaj e-mail rodzica, aby oznaczyć Kartę Dużej Rodziny." },
        { status: 400 }
      );
    }

    const updated = await setEnrollmentPendingLargeFamilyCard({
      schoolId: schoolScope,
      parentEmail,
      discountLargeFamily,
    });
    if (updated === 0) {
      return NextResponse.json(
        { message: "Nie znaleziono aktywnych zgłoszeń dla tego e-maila." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: discountLargeFamily
        ? "Oznaczono Kartę Dużej Rodziny na zgłoszeniu (konto rodzica jeszcze nie istnieje)"
        : "Usunięto oznaczenie Karty Dużej Rodziny ze zgłoszenia",
      parentUserId: null,
      discountLargeFamily,
    });
  } catch (error) {
    console.error("Admin enrollment parent-discount PATCH error:", error);
    return NextResponse.json({ message: "Błąd zapisu zniżki rodzica" }, { status: 500 });
  }
}
