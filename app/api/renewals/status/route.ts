import { NextRequest, NextResponse } from "next/server";
import { getRegistrationSchoolId, POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";
import type { RenewalStatus } from "@/lib/renewal-status";
import { isRenewalVisibleToParent } from "@/lib/renewal-status";

export async function GET(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const schoolId = getRegistrationSchoolId();

  try {
    const schoolRes = await queryDb<{ renewals_open: boolean; renewals_season: string | null }>(
      `SELECT renewals_open, renewals_season FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    const school = schoolRes.rows[0];

    const rows = await queryDb<{
      id: string;
      child_id: string;
      season: string;
      status: string;
      confirmed_at: Date | string | null;
      child_first_name: string;
      child_last_name: string;
      group_name: string | null;
      location_name: string;
      schedule: string;
      proposed_at: Date | string | null;
      has_pending_proposal: boolean;
    }>(
      `SELECT
         r.id,
         r.child_id,
         r.season,
         UPPER(BTRIM(COALESCE(r.status::text, ''))) AS status,
         r.confirmed_at,
         c.first_name AS child_first_name,
         c.last_name AS child_last_name,
         COALESCE(g_pending.name, g_prop.name) AS group_name,
         COALESCE(MAX(gl_pending.name), MAX(gl_prop.name), MAX(sl.name), 'Do ustalenia') AS location_name,
         COALESCE(
           STRING_AGG(
             DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
             ', '
           ),
           'Do ustalenia'
         ) AS schedule,
         COALESCE(rp_pending.proposed_at, NULL) AS proposed_at,
         (rp_pending.id IS NOT NULL) AS has_pending_proposal
       FROM renewals r
       JOIN children c ON c.id = r.child_id
       LEFT JOIN renewal_proposals rp_pending
         ON rp_pending.renewal_id = r.id
        AND UPPER(BTRIM(COALESCE(rp_pending.status::text, ''))) = 'PENDING'
       LEFT JOIN groups g_pending ON g_pending.id = rp_pending.group_id
       LEFT JOIN groups g_prop ON g_prop.id = r.proposed_group_id
       LEFT JOIN locations gl_pending ON gl_pending.id = g_pending.location_id
       LEFT JOIN locations gl_prop ON gl_prop.id = g_prop.location_id
       LEFT JOIN schedule_templates st ON st.group_id = COALESCE(rp_pending.group_id, r.proposed_group_id)
       LEFT JOIN locations sl ON sl.id = st.location_id
       WHERE r.parent_id = $1
         AND r.school_id = $2
         AND UPPER(BTRIM(COALESCE(r.status::text, ''))) NOT IN ('RESIGNED', 'DRAFT')
       GROUP BY
         r.id, r.child_id, r.season, r.status, r.confirmed_at,
         c.first_name, c.last_name,
         g_pending.name, g_prop.name, rp_pending.id, rp_pending.proposed_at
       ORDER BY
         CASE UPPER(BTRIM(COALESCE(r.status::text, '')))
           WHEN 'PENDING_CONFIRMATION' THEN 0
           WHEN 'PROPOSED' THEN 1
           WHEN 'NEGOTIATING' THEN 2
           WHEN 'CONFIRMED' THEN 3
           WHEN 'ACCEPTED' THEN 4
           WHEN 'AWAITING_CONTRACT' THEN 5
           WHEN 'CONTRACT_READY' THEN 6
           WHEN 'SIGNED' THEN 7
           ELSE 8
         END,
         r.initiated_at DESC`,
      [parentId, schoolId]
    );

    const renewals = rows.rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      season: row.season,
      status: row.status as RenewalStatus,
      confirmedAt: row.confirmed_at,
      childFirstName: row.child_first_name,
      childLastName: row.child_last_name,
      groupName: row.group_name,
      locationName: row.location_name,
      schedule: row.schedule,
      proposedAt: row.proposed_at,
      hasPendingProposal: row.has_pending_proposal,
    }));

    const showBanner = renewals.some((r) => isRenewalVisibleToParent(r.status));

    return NextResponse.json({
      renewalsOpen: school?.renewals_open ?? false,
      renewalsSeason: school?.renewals_season ?? null,
      showBanner,
      renewals,
    });
  } catch (error) {
    console.error("Renewals status GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania statusu odnowień" }, { status: 500 });
  }
}
