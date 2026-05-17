import { NextRequest, NextResponse } from "next/server";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import type { RenewalStatus } from "@/lib/renewal-status";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const statusFilter = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() ?? "";
    const seasonFilter = request.nextUrl.searchParams.get("season")?.trim() ?? "";

    const schoolRes = await queryDb<{ renewals_open: boolean; renewals_season: string | null }>(
      `SELECT renewals_open, renewals_season FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    const schoolRow = schoolRes.rows[0];

    const params: unknown[] = [schoolId];
    let extraWhere = "";
    if (statusFilter) {
      params.push(statusFilter);
      extraWhere += ` AND UPPER(BTRIM(COALESCE(r.status::text, ''))) = $${params.length}`;
    }
    if (seasonFilter) {
      params.push(seasonFilter);
      extraWhere += ` AND r.season = $${params.length}`;
    }

    const rows = await queryDb<{
      id: string;
      season: string;
      status: string;
      initiated_at: Date | string;
      confirmed_at: Date | string | null;
      proposed_group_id: string | null;
      child_id: string;
      child_first_name: string;
      child_last_name: string;
      parent_id: string;
      parent_first_name: string;
      parent_last_name: string;
      parent_email: string;
      proposed_group_name: string | null;
      proposed_location_name: string | null;
      proposed_schedule: string | null;
      proposal_count: string;
      has_pending_proposal: boolean;
    }>(
      `SELECT
         r.id,
         r.season,
         UPPER(BTRIM(COALESCE(r.status::text, ''))) AS status,
         r.initiated_at,
         r.confirmed_at,
         r.proposed_group_id,
         c.id AS child_id,
         c.first_name AS child_first_name,
         c.last_name AS child_last_name,
         u.id AS parent_id,
         u.first_name AS parent_first_name,
         u.last_name AS parent_last_name,
         u.email AS parent_email,
         g.name AS proposed_group_name,
         COALESCE(MAX(l.name), 'Do ustalenia') AS proposed_location_name,
         COALESCE(
           STRING_AGG(
             DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
             ', '
           ),
           'Do ustalenia'
         ) AS proposed_schedule,
         (SELECT COUNT(*)::text FROM renewal_proposals rp WHERE rp.renewal_id = r.id) AS proposal_count,
         EXISTS (
           SELECT 1 FROM renewal_proposals rp2
           WHERE rp2.renewal_id = r.id
             AND UPPER(BTRIM(COALESCE(rp2.status::text, ''))) = 'PENDING'
         ) AS has_pending_proposal
       FROM renewals r
       JOIN children c ON c.id = r.child_id
       JOIN users u ON u.id = r.parent_id
       LEFT JOIN groups g ON g.id = r.proposed_group_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE r.school_id = $1
         ${extraWhere}
       GROUP BY
         r.id, r.season, r.status, r.initiated_at, r.confirmed_at, r.proposed_group_id,
         c.id, c.first_name, c.last_name,
         u.id, u.first_name, u.last_name, u.email, g.name
       ORDER BY
         CASE UPPER(BTRIM(COALESCE(r.status::text, '')))
           WHEN 'CONFIRMED' THEN 0
           WHEN 'PROPOSED' THEN 1
           WHEN 'PENDING_CONFIRMATION' THEN 2
           WHEN 'NEGOTIATING' THEN 3
           WHEN 'ACCEPTED' THEN 4
           WHEN 'SIGNED' THEN 5
           WHEN 'RESIGNED' THEN 6
           ELSE 7
         END,
         r.confirmed_at DESC NULLS LAST,
         r.initiated_at DESC`,
      params
    );

    const groupsRes = await queryDb<{
      id: string;
      name: string;
      location_name: string;
      schedule: string;
    }>(
      `SELECT g.id,
              g.name,
              COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.active = TRUE AND g.school_id = $1
       GROUP BY g.id, g.name
       ORDER BY g.name`,
      [schoolId]
    );

    return NextResponse.json({
      renewalsOpen: schoolRow?.renewals_open ?? false,
      renewalsSeason: schoolRow?.renewals_season ?? null,
      renewals: rows.rows.map((row) => ({
        id: row.id,
        season: row.season,
        status: row.status as RenewalStatus,
        initiatedAt: row.initiated_at,
        confirmedAt: row.confirmed_at,
        proposedGroupId: row.proposed_group_id,
        proposedGroupName: row.proposed_group_name,
        proposedLocationName: row.proposed_location_name,
        proposedSchedule: row.proposed_schedule,
        childId: row.child_id,
        childFirstName: row.child_first_name,
        childLastName: row.child_last_name,
        parentId: row.parent_id,
        parentFirstName: row.parent_first_name,
        parentLastName: row.parent_last_name,
        parentEmail: row.parent_email,
        proposalCount: Number(row.proposal_count ?? "0"),
        hasPendingProposal: row.has_pending_proposal,
      })),
      groups: groupsRes.rows.map((g) => ({
        id: g.id,
        name: g.name,
        location_name: g.location_name,
        schedule: g.schedule,
      })),
    });
  } catch (error) {
    console.error("Admin renewals GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania odnowień" }, { status: 500 });
  }
}
