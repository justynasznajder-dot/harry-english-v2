import { NextRequest, NextResponse } from "next/server";
import { getDbShape, getRegistrationSchoolId, POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });

  const SCHOOL_ID = getRegistrationSchoolId();
  const shape = await getDbShape();

  try {
    /*
     * Multi-child: karty steppera na podstawie `children.access_level`
     * (źródło prawdy), z danymi propozycji z `enrollment_requests` gdy istnieją.
     */
    const accessLevelExpr = shape.childHasAccessLevel
      ? `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW')))`
      : `UPPER(BTRIM(COALESCE(er.status::text, 'NEW')))`;

    const proposalsRes = await queryDb<{
      child_id: string;
      request_id: string | null;
      access_level: string;
      child_first_name: string;
      child_last_name: string;
      group_name: string | null;
      location_name: string;
      schedule: string;
      proposed_at: Date | string | null;
      price_monthly: number | null;
    }>(
      `SELECT
         c.id                   AS child_id,
         c.enrollment_request_id AS request_id,
         ${accessLevelExpr}     AS access_level,
         c.first_name           AS child_first_name,
         c.last_name            AS child_last_name,
         g.name                 AS group_name,
         COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
         COALESCE(
           STRING_AGG(DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')), ', '),
           'Do ustalenia'
         ) AS schedule,
         er.proposed_at,
         NULLIF(MAX(er.notes), '')::numeric AS price_monthly
       FROM children c
       LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE c.parent_id = $1
         AND c.school_id = $2
         AND c.active = TRUE
         AND ${accessLevelExpr} IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED')
       GROUP BY c.id, c.enrollment_request_id, ${accessLevelExpr}, c.first_name, c.last_name, g.name, er.proposed_at
       ORDER BY
         CASE ${accessLevelExpr}
           WHEN 'PROPOSED' THEN 0 WHEN 'NEGOTIATING' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'SIGNED' THEN 3 ELSE 4 END,
         er.proposed_at DESC NULLS LAST,
         c.created_at DESC`,
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

    const proposals = proposalsRes.rows.map((row) => ({
      child_id: row.child_id,
      request_id: row.request_id ?? row.child_id,
      access_level: row.access_level,
      /** Wsteczna kompatybilność — alias dla `access_level`. */
      request_status: row.access_level,
      child_first_name: row.child_first_name,
      child_last_name: row.child_last_name,
      group_name: row.group_name,
      location_name: row.location_name,
      schedule: row.schedule,
      proposed_at: row.proposed_at,
      price_monthly: row.price_monthly,
    }));

    return NextResponse.json({
      proposals,
      proposal: proposals[0] ?? null,
      contract: contractRes.rows[0] ?? null,
    });
  } catch (error) {
    console.error("Enrollment status error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu enrollment" }, { status: 500 });
  }
}
