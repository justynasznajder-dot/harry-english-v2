import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
    /*
     * Multi-child: zwracamy listę aktywnych zgłoszeń (PROPOSED / ACCEPTED / SIGNED),
     * po jednej karcie per `enrollment_request`. UI rodzica renderuje listę
     * i pozwala podjąć decyzję per dziecko.
     */
    const proposalsRes = await queryDb<{
      request_id: string;
      request_status: string;
      child_first_name: string;
      child_last_name: string;
      group_name: string | null;
      location_name: string;
      schedule: string;
      proposed_at: Date | string | null;
      price_monthly: number | null;
    }>(
      `SELECT
         er.id                  AS request_id,
         UPPER(BTRIM(COALESCE(er.status::text, ''))) AS request_status,
         er.child_first_name,
         er.child_last_name,
         g.name                 AS group_name,
         COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
         COALESCE(
           STRING_AGG(DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')), ', '),
           'Do ustalenia'
         ) AS schedule,
         er.proposed_at,
         NULLIF(MAX(er.notes), '')::numeric AS price_monthly
       FROM enrollment_requests er
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE er.user_id = $1
         AND er.school_id = $2
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED')
       GROUP BY er.id, UPPER(BTRIM(COALESCE(er.status::text, ''))), er.child_first_name, er.child_last_name, g.name, er.proposed_at
       ORDER BY
         CASE UPPER(BTRIM(COALESCE(er.status::text, '')))
           WHEN 'PROPOSED' THEN 0 WHEN 'NEGOTIATING' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'SIGNED' THEN 3 ELSE 4 END,
         er.proposed_at DESC NULLS LAST,
         er.created_at DESC`,
      [parentId, SCHOOL_ID]
    );

    const contractRes = await queryDb<{ id: string; content_html: string; status: string }>(
      `SELECT id, content_html, status
       FROM contracts
       WHERE parent_id = $1 AND school_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );

    return NextResponse.json({
      proposals: proposalsRes.rows,
      // Wsteczna kompatybilność: pierwsza karta jako `proposal` (gdyby jakiś
      // starszy klient jeszcze chciał obiekt zamiast listy).
      proposal: proposalsRes.rows[0] ?? null,
      contract: contractRes.rows[0] ?? null,
    });
  } catch (error) {
    console.error("Enrollment status error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu enrollment" }, { status: 500 });
  }
}
