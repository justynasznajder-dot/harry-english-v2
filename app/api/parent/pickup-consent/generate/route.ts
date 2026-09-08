import { NextRequest, NextResponse } from "next/server";
import { generateComplimentaryPickupConsent } from "@/lib/complimentary-pickup-consent";
import { getUserById, queryDb } from "@/lib/db";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/**
 * Rodzic w trybie bez umowy — generuje zgodę na odbiór dziecka przez lektora (PDF do wydruku).
 */
export async function POST(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId } = auth.ctx;

  try {
    const parentUser = await getUserById(parentId);
    const complimentary = await isComplimentaryForParent(schoolId, {
      parentId,
      parentEmail: parentUser?.email,
    });
    if (!complimentary) {
      return NextResponse.json(
        { message: "Generowanie zgody w tym trybie jest dostępne tylko w zapisie bez umowy." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      requestId?: string;
      enrollmentRequestId?: string;
    };
    const requestId = String(body.requestId ?? body.enrollmentRequestId ?? "").trim();
    if (!requestId) {
      return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
    }

    const owned = await queryDb<{ id: string }>(
      `SELECT er.id
       FROM enrollment_requests er
       JOIN children c ON c.enrollment_request_id = er.id AND c.school_id = er.school_id
       WHERE er.id = $1
         AND er.school_id = $2
         AND c.parent_id = $3
         AND c.active = TRUE
         AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) IN ('COMPLETED', 'SIGNED')
       LIMIT 1`,
      [requestId, schoolId, parentId]
    );
    if (!owned.rows[0]) {
      return NextResponse.json(
        { message: "Nie znaleziono zakończonego zapisu dla tego dziecka." },
        { status: 404 }
      );
    }

    const result = await generateComplimentaryPickupConsent({
      enrollmentRequestId: requestId,
      parentId,
      schoolId,
      requireTeacherPickupFlag: false,
    });

    if (!result.generated) {
      return NextResponse.json(
        { message: "Nie udało się wygenerować zgody — sprawdź dane dziecka i grupy." },
        { status: 400 }
      );
    }

    const downloadUrl = result.downloadKey
      ? `/api/parent/documents/download?key=${encodeURIComponent(result.downloadKey)}`
      : null;

    return NextResponse.json({
      ok: true,
      childName: result.childName ?? null,
      previewHtml: result.previewHtml ?? null,
      downloadUrl,
      downloadKey: result.downloadKey ?? null,
    });
  } catch (error) {
    console.error("POST /api/parent/pickup-consent/generate:", error);
    const message =
      error instanceof Error ? error.message : "Nie udało się wygenerować zgody na odbiór";
    return NextResponse.json({ message }, { status: 500 });
  }
}
