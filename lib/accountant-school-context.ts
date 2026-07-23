import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { getUserById } from "@/lib/db";

export type AccountantSchoolContext =
  | { ok: true; userId: string; schoolId: string }
  | { ok: false; response: NextResponse };

/** Panel księgowej — tylko rola ACCOUNTANT, scoped do users.school_id. */
export async function requireAccountantSchoolContext(
  request: NextRequest
): Promise<AccountantSchoolContext> {
  const payload = await getTokenFromRequest(request);
  const userId = payload?.userId;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Nieprawidłowy token" }, { status: 401 }),
    };
  }

  const user = await getUserById(userId);
  if (!user || user.role !== "ACCOUNTANT") {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak uprawnień księgowej" }, { status: 403 }),
    };
  }

  const schoolId = user.school_id?.trim() ?? "";
  if (!schoolId) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Konto księgowej nie ma przypisanej szkoły" },
        { status: 400 }
      ),
    };
  }

  return { ok: true, userId, schoolId };
}
