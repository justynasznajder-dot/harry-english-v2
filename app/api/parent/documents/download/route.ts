import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";
import { isPickupConsentPdfFilename } from "@/lib/pickup-consent-notice";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { getR2ObjectBuffer, isParentDokumentyKeyAllowed } from "@/lib/r2-storage";
import { isComplimentaryForParent } from "@/lib/school-discounts";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const key = request.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!key || !key.endsWith(".pdf")) {
    return NextResponse.json({ message: "Brak lub nieprawidłowy klucz pliku" }, { status: 400 });
  }

  const { parentId, schoolId } = auth.ctx;

  try {
    if (
      !isParentDokumentyKeyAllowed({
        key,
        parentUserId: parentId,
        schoolId,
      })
    ) {
      return NextResponse.json({ message: "Brak dostępu do pliku" }, { status: 403 });
    }

    const parentUser = await getUserById(parentId);
    const complimentary = await isComplimentaryForParent(schoolId, {
      parentId,
      parentEmail: parentUser?.email,
    });
    if (complimentary) {
      const filename = key.split("/").pop() ?? "";
      if (!isPickupConsentPdfFilename(filename)) {
        return NextResponse.json(
          { message: "Tryb bez opłat — wcześniejsze dokumenty nie są dostępne do pobrania" },
          { status: 403 },
        );
      }
    }

    const { buffer, contentType } = await getR2ObjectBuffer(key, {
      source: "parent.documents.download",
    });
    const filename = key.split("/").pop() ?? "umowa.pdf";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/parent/documents/download:", error);
    return NextResponse.json({ message: "Nie udało się pobrać pliku" }, { status: 500 });
  }
}
