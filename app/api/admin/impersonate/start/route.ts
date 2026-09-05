import { NextRequest, NextResponse } from "next/server";
import {
  getRawAuthToken,
  setAuthTokenCookie,
  setAuthTokenOriginalCookie,
  signToken,
} from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin-auth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSuperAdmin(request);
    if (!ctx.ok) return ctx.response;

    const rawAdminToken = getRawAuthToken(request);
    if (!rawAdminToken) {
      return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId =
      typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!targetUserId) {
      return NextResponse.json({ message: "Podaj userId" }, { status: 400 });
    }

    const target = await getUserById(targetUserId);
    if (!target) {
      return NextResponse.json({ message: "Użytkownik nie istnieje" }, { status: 404 });
    }
    if (target.role === "ADMIN") {
      return NextResponse.json(
        { message: "Nie można impersonować konta superadmina" },
        { status: 403 }
      );
    }
    if (!target.active) {
      return NextResponse.json(
        { message: "Konto docelowe jest nieaktywne" },
        { status: 403 }
      );
    }

    const targetToken = await signToken({
      userId: target.id,
      role: target.role,
      schoolId: target.school_id ?? null,
      accessLevel: target.access_level,
    });

    const response = NextResponse.json({
      message: "Impersonacja rozpoczęta",
      user: {
        id: target.id,
        email: target.email,
        firstName: target.first_name,
        lastName: target.last_name,
        role: target.role,
        schoolId: target.school_id,
      },
    });

    setAuthTokenOriginalCookie(response, rawAdminToken);
    setAuthTokenCookie(response, targetToken);

    return response;
  } catch (error) {
    console.error("POST /api/admin/impersonate/start:", error);
    return NextResponse.json(
      { message: "Nie udało się rozpocząć impersonacji" },
      { status: 500 }
    );
  }
}
