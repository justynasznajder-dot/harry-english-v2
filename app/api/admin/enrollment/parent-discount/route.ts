import { NextRequest, NextResponse } from "next/server";
import {
  canAccessSchoolAdminApis,
  queryDb,
  resolveAdminPanelTenant,
  resolveAdminUsersSchoolScope,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import {
  resolveParentUserIdForEnrollment,
  setParentLargeFamilyCard,
} from "@/lib/parent-profile-discount";

export async function PATCH(request: NextRequest) {
  try {
    const payload = await getTokenFromRequest(request);
    const userId = payload?.userId;
    if (!userId) return NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 });
    if (!(await canAccessSchoolAdminApis(userId))) {
      return NextResponse.json({ message: "Brak uprawnień administratora" }, { status: 403 });
    }

    const resolved = await resolveAdminPanelTenant(userId);
    if (!resolved.ok) {
      return NextResponse.json({ message: resolved.message }, { status: resolved.status });
    }
    const { tenant } = resolved;

    const body = await request.json();
    const parentUserId = String(body.parentUserId ?? body.parent_user_id ?? "").trim();
    const parentEmail = String(body.parentEmail ?? body.parent_email ?? "").trim();
    const discountLargeFamily = Boolean(
      body.discountLargeFamily ?? body.discount_large_family ?? false
    );

    const schoolScope =
      tenant.role === "MANAGER"
        ? tenant.tenantSchoolId
        : resolveAdminUsersSchoolScope(tenant);

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
