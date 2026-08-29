import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";

/**
 * Generowanie umowy przez rodzica wyłączone.
 * Rodzic uzupełnia dane (→ AWAITING_CONTRACT); umowę wygeneruje manager szkoły.
 */
export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  return NextResponse.json(
    {
      message:
        "Umowę przygotuje szkoła po ostatecznym zatwierdzeniu grupy. Uzupełnij i potwierdź dane do umowy w portalu.",
    },
    { status: 403 }
  );
}
