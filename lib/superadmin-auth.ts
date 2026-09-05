import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getTokenFromRequest, isImpersonating } from "@/lib/auth";
import { getUserById, isAdmin, type User } from "@/lib/db";

export type SuperAdminContext =
  | { ok: true; userId: string; user: User }
  | { ok: false; response: NextResponse };

/** Tylko prawdziwy ADMIN poza sesją impersonacji. */
export async function requireSuperAdmin(
  request: NextRequest
): Promise<SuperAdminContext> {
  if (isImpersonating(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Zakończ impersonację, aby korzystać z panelu superadmina" },
        { status: 403 }
      ),
    };
  }

  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 }),
    };
  }

  if (!(await isAdmin(userId))) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak uprawnień superadmina" }, { status: 403 }),
    };
  }

  const user = await getUserById(userId);
  if (!user || user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak uprawnień superadmina" }, { status: 403 }),
    };
  }

  return { ok: true, userId, user };
}
