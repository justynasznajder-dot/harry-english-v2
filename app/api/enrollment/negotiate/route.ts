import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import { requireParentContext } from "@/lib/parent-portal-auth";

/**
 * Rodzic wybiera „Kontakt ze szkołą” zamiast akceptacji propozycji grupy.
 *
 * Body: `{ requestId: string }`.
 *
 * Skutki:
 * - `enrollment_requests.status` → `NEGOTIATING`,
 * - `children.access_level` → `NEGOTIATING`.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId: SCHOOL_ID } = auth.ctx;

  let requestId: string | null = null;
  try {
    const body = (await request.json()) as { requestId?: unknown; enrollmentRequestId?: unknown };
    const raw =
      typeof body.requestId === "string"
        ? body.requestId
        : typeof body.enrollmentRequestId === "string"
          ? body.enrollmentRequestId
          : "";
    requestId = raw.trim() || null;
  } catch {
    return NextResponse.json({ message: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (!requestId) {
    return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
  }

  try {
    const upd = await queryDb<{ id: string }>(
      `UPDATE enrollment_requests
       SET status = 'NEGOTIATING'
       WHERE id = $1
         AND user_id = $2
         AND school_id = $3
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
       RETURNING id`,
      [requestId, parentId, SCHOOL_ID]
    );

    if ((upd.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Propozycja nieaktywna lub nie należy do Twojego konta" },
        { status: 409 }
      );
    }

    await syncChildrenAccessLevelForEnrollment(requestId, "NEGOTIATING");
    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({
      message: "Status zaktualizowany — wyślij wiadomość do szkoły w formularzu poniżej.",
      status: "NEGOTIATING",
    });
  } catch (error) {
    console.error("Enrollment negotiate error:", error);
    return NextResponse.json({ message: "Nie udało się zaktualizować statusu" }, { status: 500 });
  }
}

/**
 * Anulowanie kontaktu — powrót do propozycji grupy (NEGOTIATING → PROPOSED).
 *
 * Body: `{ requestId: string }`.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId: SCHOOL_ID } = auth.ctx;

  let requestId: string | null = null;
  try {
    const body = (await request.json()) as { requestId?: unknown; enrollmentRequestId?: unknown };
    const raw =
      typeof body.requestId === "string"
        ? body.requestId
        : typeof body.enrollmentRequestId === "string"
          ? body.enrollmentRequestId
          : "";
    requestId = raw.trim() || null;
  } catch {
    return NextResponse.json({ message: "Nieprawidłowe dane" }, { status: 400 });
  }

  if (!requestId) {
    return NextResponse.json({ message: "Brak identyfikatora zgłoszenia" }, { status: 400 });
  }

  try {
    const upd = await queryDb<{ id: string }>(
      `UPDATE enrollment_requests
       SET status = 'PROPOSED'
       WHERE id = $1
         AND user_id = $2
         AND school_id = $3
         AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'NEGOTIATING'
       RETURNING id`,
      [requestId, parentId, SCHOOL_ID]
    );

    if ((upd.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { message: "Nie można anulować — zgłoszenie nie jest w trybie kontaktu ze szkołą" },
        { status: 409 }
      );
    }

    await syncChildrenAccessLevelForEnrollment(requestId, "PROPOSED");
    await syncParentUserAccessLevel(parentId);

    return NextResponse.json({
      message: "Anulowano — możesz ponownie zaakceptować propozycję lub skontaktować się ze szkołą.",
      status: "PROPOSED",
    });
  } catch (error) {
    console.error("Enrollment negotiate cancel error:", error);
    return NextResponse.json({ message: "Nie udało się anulować kontaktu ze szkołą" }, { status: 500 });
  }
}
