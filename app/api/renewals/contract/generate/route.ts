import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";

/**
 * Generowanie umowy odnowienia przez rodzica wyłączone.
 * Rodzic potwierdza dane (→ AWAITING_CONTRACT); umowę wygeneruje manager szkoły.
 */
export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  return NextResponse.json(
    {
      message:
        "Umowę przygotuje szkoła po ostatecznym zatwierdzeniu grupy. Potwierdź dane do umowy w portalu.",
    },
    { status: 403 }
  );
}
