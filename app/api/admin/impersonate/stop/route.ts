import { NextRequest, NextResponse } from "next/server";
import {
  clearAuthTokenOriginalCookie,
  getOriginalTokenFromRequest,
  getRawOriginalAuthToken,
  setAuthTokenCookie,
} from "@/lib/auth";
import { getUserById, isAdmin } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const originalPayload = await getOriginalTokenFromRequest(request);
    const rawOriginal = getRawOriginalAuthToken(request);

    if (!originalPayload?.userId || !rawOriginal) {
      return NextResponse.json(
        { message: "Brak aktywnej sesji impersonacji" },
        { status: 400 }
      );
    }

    if (!(await isAdmin(originalPayload.userId))) {
      return NextResponse.json(
        { message: "Nieprawidłowa sesja superadmina" },
        { status: 403 }
      );
    }

    const admin = await getUserById(originalPayload.userId);
    if (!admin || admin.role !== "ADMIN" || !admin.active) {
      return NextResponse.json(
        { message: "Konto superadmina jest niedostępne" },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      message: "Impersonacja zakończona",
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.first_name,
        lastName: admin.last_name,
        role: admin.role,
      },
    });

    setAuthTokenCookie(response, rawOriginal);
    clearAuthTokenOriginalCookie(response);

    return response;
  } catch (error) {
    console.error("POST /api/admin/impersonate/stop:", error);
    return NextResponse.json(
      { message: "Nie udało się zakończyć impersonacji" },
      { status: 500 }
    );
  }
}
