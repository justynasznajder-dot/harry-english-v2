import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";

function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  try {
    return Buffer.from(token, "base64").toString().split(":")[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const parentId = getUserIdFromRequest(request);
  if (!parentId) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
    const proposalRes = await queryDb<{
      group_name: string;
      location_name: string;
      schedule: string;
      price_monthly: number | null;
    }>(
      `SELECT
         g.name AS group_name,
         COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
         COALESCE(
           STRING_AGG(DISTINCT CONCAT(st.day_of_week, ' ', TO_CHAR(st.start_time, 'HH24:MI')), ', '),
           'Do ustalenia'
         ) AS schedule,
         NULLIF(MAX(er.notes), '')::numeric AS price_monthly
       FROM enrollment_requests er
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE er.user_id = $1 AND er.school_id = $2 AND er.status IN ('PROPOSED', 'ACCEPTED', 'SIGNED')
       GROUP BY g.name
       ORDER BY MAX(er.created_at) DESC
       LIMIT 1`,
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
      proposal: proposalRes.rows[0] ?? null,
      contract: contractRes.rows[0] ?? null,
    });
  } catch (error) {
    console.error("Enrollment status error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu enrollment" }, { status: 500 });
  }
}
