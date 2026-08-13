import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { isValidEmailAddress } from "@/lib/email-address";
import { getTokenFromRequest } from "@/lib/auth";
import { requireMessageActor } from "@/lib/messages";

/**
 * Odbiorcy e-mail ze zgłoszeń (enrollment_requests): status NEW, filtr preferred_location.
 * Zwraca wiersze per dziecko — ten sam rodzic może mieć kilka dzieci na różne lokalizacje.
 */
export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  if (!payload?.userId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const actor = await requireMessageActor(payload.userId);
  if (!actor.ok || (actor.user.role !== "MANAGER" && actor.user.role !== "TEACHER")) {
    return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
  }

  const locationId = request.nextUrl.searchParams.get("locationId")?.trim() ?? "";
  if (!locationId) {
    return NextResponse.json({ message: "Wybierz lokalizację" }, { status: 400 });
  }

  try {
    const locCheck = await queryDb<{ id: string }>(
      `SELECT id FROM locations WHERE id = $1 AND school_id = $2 AND active = TRUE LIMIT 1`,
      [locationId, actor.user.schoolId]
    );
    if (!locCheck.rows[0]) {
      return NextResponse.json({ message: "Nie znaleziono lokalizacji" }, { status: 404 });
    }

    const res = await queryDb<{
      id: string;
      parent_email: string;
      parent_first_name: string;
      parent_last_name: string;
      child_first_name: string;
      child_last_name: string;
    }>(
      `SELECT er.id,
              er.parent_email,
              er.parent_first_name,
              er.parent_last_name,
              er.child_first_name,
              er.child_last_name
       FROM enrollment_requests er
       WHERE er.school_id = $1
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW'
         AND NULLIF(TRIM(BOTH FROM COALESCE(er.preferred_location, '')), '') = $2
         AND NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
       ORDER BY er.parent_last_name, er.parent_first_name,
                er.child_last_name, er.child_first_name, er.created_at`,
      [actor.user.schoolId, locationId]
    );

    const recipients = res.rows
      .map((row) => {
        const email = row.parent_email.trim().toLowerCase();
        if (!isValidEmailAddress(email)) return null;
        return {
          requestId: row.id,
          email,
          parentFirstName: row.parent_first_name.trim(),
          parentLastName: row.parent_last_name.trim(),
          childFirstName: row.child_first_name.trim(),
          childLastName: row.child_last_name.trim(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    return NextResponse.json({ recipients });
  } catch (error) {
    console.error("GET /api/messages/enrollment-email-recipients error:", error);
    return NextResponse.json({ message: "Błąd pobierania zgłoszeń" }, { status: 500 });
  }
}
