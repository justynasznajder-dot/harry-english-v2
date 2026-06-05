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
      price_yearly: number | null;
      contract_id: string | null;
      contract_status: string | null;
      contract_amount: string | null;
      contract_price_override: boolean | null;
      contract_payment_type: string | null;
      contract_content_html: string | null;
      contract_attachment_1_html: string | null;
      contract_attachment_2_html: string | null;
      contract_include_attachment_2: boolean | null;
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
         g.price_monthly,
         g.price_yearly,
         ct.id                  AS contract_id,
         ct.status              AS contract_status,
         ct.amount::text        AS contract_amount,
         ct.price_override      AS contract_price_override,
         ct.payment_type        AS contract_payment_type,
         ct.content_html        AS contract_content_html,
         ct.attachment_1_html   AS contract_attachment_1_html,
         ct.attachment_2_html   AS contract_attachment_2_html,
         ct.include_attachment_2 AS contract_include_attachment_2
       FROM children c
       LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       LEFT JOIN LATERAL (
         SELECT id, status, amount, price_override, payment_type, content_html,
                attachment_1_html, attachment_2_html, include_attachment_2
         FROM contracts
         WHERE child_id = c.id AND parent_id = c.parent_id
         ORDER BY created_at DESC
         LIMIT 1
       ) ct ON TRUE
       WHERE c.parent_id = $1
         AND c.school_id = $2
         AND c.active = TRUE
         AND ${accessLevelExpr} IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED')
       GROUP BY c.id, c.enrollment_request_id, ${accessLevelExpr}, c.first_name, c.last_name,
                g.name, er.proposed_at, g.price_monthly, g.price_yearly,
                ct.id, ct.status, ct.amount, ct.price_override, ct.payment_type, ct.content_html,
                ct.attachment_1_html, ct.attachment_2_html, ct.include_attachment_2
       ORDER BY
         CASE ${accessLevelExpr}
           WHEN 'PROPOSED' THEN 0 WHEN 'NEGOTIATING' THEN 1 WHEN 'ACCEPTED' THEN 2 WHEN 'SIGNED' THEN 3 ELSE 4 END,
         er.proposed_at DESC NULLS LAST,
         c.created_at DESC`,
      [parentId, SCHOOL_ID]
    );

    const contractRes = await queryDb<{ id: string; content_html: string; status: string; child_id: string | null }>(
      `SELECT id, content_html, status, child_id
       FROM contracts
       WHERE parent_id = $1 AND school_id = $2 AND status = 'SENT'
       ORDER BY created_at DESC
       LIMIT 1`,
      [parentId, SCHOOL_ID]
    );

    const parentRes = await queryDb<{ email: string | null }>(
      `SELECT email
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [parentId]
    );
    const parentEmail = String(parentRes.rows[0]?.email ?? "").trim().toLowerCase();

    const enrollmentRequestRes = await queryDb<{
      request_id: string;
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      parent_phone: string | null;
      child_first_name: string;
      child_last_name: string;
      child_birth_date: Date | string;
      preferred_location: string | null;
      preferred_location_name: string | null;
      created_at: Date | string;
    }>(
      `SELECT
         er.id AS request_id,
         er.parent_first_name,
         er.parent_last_name,
         er.parent_email,
         er.parent_phone,
         er.child_first_name,
         er.child_last_name,
         er.child_birth_date,
         er.preferred_location,
         l.name AS preferred_location_name,
         er.created_at
       FROM enrollment_requests er
       LEFT JOIN locations l ON l.id::text = er.preferred_location::text
       WHERE er.school_id = $1
         AND (
           er.user_id = $2
           OR ($3 <> '' AND LOWER(BTRIM(er.parent_email::text)) = $3)
         )
       ORDER BY er.created_at DESC`,
      [SCHOOL_ID, parentId, parentEmail]
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
      price_yearly: row.price_yearly,
      contract: row.contract_id
        ? {
            id: row.contract_id,
            status: row.contract_status,
            amount: row.contract_amount != null ? Number(row.contract_amount) : null,
            price_override: row.contract_price_override ?? false,
            payment_type: row.contract_payment_type,
            content_html:
              row.contract_status === 'SENT' ? row.contract_content_html ?? null : null,
            attachment_1_html:
              row.contract_status === 'SENT' ? row.contract_attachment_1_html ?? null : null,
            attachment_2_html:
              row.contract_status === 'SENT' ? row.contract_attachment_2_html ?? null : null,
            include_attachment_2: row.contract_include_attachment_2 ?? false,
          }
        : null,
    }));

    return NextResponse.json({
      proposals,
      proposal: proposals[0] ?? null,
      contract: contractRes.rows[0] ?? null,
      enrollmentRequestSummary:
        enrollmentRequestRes.rows.length > 0
          ? {
              parentFirstName: enrollmentRequestRes.rows[0].parent_first_name,
              parentLastName: enrollmentRequestRes.rows[0].parent_last_name,
              parentEmail: enrollmentRequestRes.rows[0].parent_email,
              parentPhone: enrollmentRequestRes.rows[0].parent_phone,
              submittedAt: enrollmentRequestRes.rows[0].created_at,
              children: enrollmentRequestRes.rows.map((row) => ({
                requestId: row.request_id,
                firstName: row.child_first_name,
                lastName: row.child_last_name,
                birthDate: row.child_birth_date,
                preferredLocation:
                  row.preferred_location_name ??
                  (row.preferred_location && row.preferred_location.trim().length > 0
                    ? row.preferred_location
                    : "— (nie podano)"),
                submittedAt: row.created_at,
              })),
            }
          : null,
    });
  } catch (error) {
    console.error("Enrollment status error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu enrollment" }, { status: 500 });
  }
}
