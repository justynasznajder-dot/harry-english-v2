import { NextRequest, NextResponse } from "next/server";
import { queryDb, resolveAdminUsersSchoolScope } from "@/lib/db";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import {
  resolveParentUserIdForEnrollment,
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
    if (!resolvedParentId) {
      return NextResponse.json(
        {
          message:
            "Karta Dużej Rodziny można oznaczyć dopiero po utworzeniu konta rodzica (np. po wysłaniu pierwszej propozycji).",
        },
        { status: 409 }
      );
    }

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

    return NextResponse.json({
      message: discountLargeFamily
        ? "Oznaczono Kartę Dużej Rodziny"
        : "Usunięto oznaczenie Karty Dużej Rodziny",
      parentUserId: resolvedParentId,
      discountLargeFamily,
    });
  } catch (error) {
    console.error("Admin enrollment parent-discount PATCH error:", error);
    return NextResponse.json({ message: "Błąd zapisu zniżki rodzica" }, { status: 500 });
  }
}
