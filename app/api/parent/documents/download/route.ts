import { NextRequest, NextResponse } from "next/server";
import { getParentProfileByUserId, getUserById } from "@/lib/db";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { getR2ObjectBuffer } from "@/lib/r2-storage";

export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const key = request.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!key || !key.endsWith(".pdf")) {
    return NextResponse.json({ message: "Brak lub nieprawidłowy klucz pliku" }, { status: 400 });
  }

  const { parentId, schoolId } = auth.ctx;

  try {
    const [user, profile] = await Promise.all([
      getUserById(parentId),
      getParentProfileByUserId(parentId),
    ]);
    if (!user || !profile?.pesel) {
      return NextResponse.json({ message: "Brak dostępu do dokumentów" }, { status: 403 });
    }

    if (!key.startsWith(`${schoolId}/dokumenty/`)) {
      return NextResponse.json({ message: "Brak dostępu do pliku" }, { status: 403 });
    }

    const { buffer, contentType } = await getR2ObjectBuffer(key);
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
