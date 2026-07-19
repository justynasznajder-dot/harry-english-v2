import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { getRegistrationSchoolId, getUserById } from "@/lib/db";

export type ParentContext = {
  parentId: string;
  schoolId: string;
};

export async function requireParentContext(
  request: NextRequest
): Promise<{ ok: true; ctx: ParentContext } | { ok: false; response: NextResponse }> {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 }),
    };
  }

  const user = await getUserById(parentId);
  if (!user || user.role !== "PARENT") {
    return {
      ok: false,
      response: NextResponse.json({ message: "Brak uprawnień" }, { status: 403 }),
    };
  }

  const schoolId = user.school_id?.trim() || getRegistrationSchoolId();
  if (!schoolId) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Konto nie ma przypisanej szkoły" }, { status: 400 }),
    };
  }

  return { ok: true, ctx: { parentId, schoolId } };
}
