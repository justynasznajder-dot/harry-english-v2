import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import {
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

/**
 * Rodzic akceptuje propozycję grupy.
 *
 * Body (opcjonalne): `{ requestId?: string }`.
 *
 * Skutki:
 * - `enrollment_requests.status = 'ACCEPTED'`, `accepted_at = NOW()`,
 * - `children.access_level` → `ACCEPTED`,
 * - kolejny krok w portalu: uzupełnienie danych do umowy.
 */
export async function PUT(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  let requestedId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { requestId?: unknown };
    if (typeof body.requestId === "string" && body.requestId.trim().length > 0) {
      requestedId = body.requestId.trim();
    }
  } catch {
    /* brak body — fallback poniżej */
  }

  try {
    const parentRes = await queryDb<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = 'PARENT' LIMIT 1`,
      [parentId, SCHOOL_ID]
    );
    if (!parentRes.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono rodzica" }, { status: 404 });
    }

    const enrollmentRes = requestedId
      ? await queryDb<{ id: string }>(
          `SELECT id
           FROM enrollment_requests
           WHERE id = $1 AND user_id = $2 AND school_id = $3
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           LIMIT 1`,
          [requestedId, parentId, SCHOOL_ID]
        )
      : await queryDb<{ id: string }>(
          `SELECT id
           FROM enrollment_requests
           WHERE user_id = $1 AND school_id = $2
             AND UPPER(BTRIM(COALESCE(status::text, ''))) = 'PROPOSED'
           ORDER BY created_at DESC
           LIMIT 1`,
          [parentId, SCHOOL_ID]
        );

    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json(
        {
          message: requestedId
            ? "Propozycja nieaktywna lub nie należy do Twojego konta"
            : "Brak propozycji do akceptacji",
        },
        { status: requestedId ? 409 : 400 }
      );
    }

    await queryDb(
      `UPDATE enrollment_requests
       SET status = 'ACCEPTED', accepted_at = NOW()
       WHERE id = $1`,
      [enrollment.id]
    );

    await syncChildrenAccessLevelForEnrollment(enrollment.id, "ACCEPTED");
    await syncParentUserAccessLevel(parentId);

    const remainingRes = await queryDb<{ remaining: string }>(
      `SELECT COUNT(*)::text AS remaining
       FROM children
       WHERE parent_id = $1
         AND school_id = $2
         AND active = TRUE
         AND UPPER(BTRIM(COALESCE(access_level::text, ''))) = 'PROPOSED'`,
      [parentId, SCHOOL_ID]
    );
    const remaining = Number(remainingRes.rows[0]?.remaining ?? "0");

    return NextResponse.json({
      message:
        remaining === 0
          ? "Propozycja zaakceptowana — przejdź do uzupełnienia danych do umowy."
          : "Propozycja zaakceptowana — uzupełnij dane do umowy dla tego dziecka. Pozostałe propozycje czekają na decyzję.",
      remainingProposed: remaining,
    });
  } catch (error) {
    console.error("Enrollment accept error:", error);
    return NextResponse.json({ message: "Nie udało się zaakceptować propozycji" }, { status: 500 });
  }
}
