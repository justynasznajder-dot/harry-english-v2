import { NextRequest, NextResponse } from "next/server";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { requireAdminRenewalsContext } from "@/lib/admin-renewals-auth";
import type { RenewalStatus } from "@/lib/renewal-status";
import {
  getActiveSchoolYearPlanning,
  getPlannedNextSchoolYear,
  requireRenewalTargetSchoolYear,
} from "@/lib/school-year-planning";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const statusFilter = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() ?? "";
    const seasonFilter = request.nextUrl.searchParams.get("season")?.trim() ?? "";

    const [schoolRow, plannedNextYear, activeSchoolYear] = await Promise.all([
      queryDb<{ renewals_open: boolean; renewals_season: string | null }>(
        `SELECT renewals_open, renewals_season FROM schools WHERE id = $1 LIMIT 1`,
        [schoolId]
      ).then((r) => r.rows[0]),
      getPlannedNextSchoolYear(schoolId),
      getActiveSchoolYearPlanning(schoolId),
    ]);

    const targetSeason = plannedNextYear?.name ?? "";
    const params: unknown[] = [schoolId];
    let extraWhere = "";
    if (targetSeason && !seasonFilter) {
      params.push(targetSeason);
      extraWhere += ` AND r.season = $${params.length}`;
    }
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
      current_group_id: string | null;
      current_group_name: string | null;
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
         COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS proposed_location_name,
         COALESCE(
           STRING_AGG(
             DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
             ', '
           ),
           'Do ustalenia'
         ) AS proposed_schedule,
         (
           SELECT gs.group_id
           FROM group_students gs
           JOIN groups cg ON cg.id = gs.group_id AND cg.active = TRUE
           JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
           WHERE gs.child_id = c.id
             AND gs.left_at IS NULL
             AND cg.school_id = r.school_id
           ORDER BY gs.enrolled_at DESC
           LIMIT 1
         ) AS current_group_id,
         (
           SELECT cg.name
           FROM group_students gs
           JOIN groups cg ON cg.id = gs.group_id AND cg.active = TRUE
           JOIN school_years sy ON sy.id = gs.school_year_id AND sy.active = TRUE
           WHERE gs.child_id = c.id
             AND gs.left_at IS NULL
             AND cg.school_id = r.school_id
           ORDER BY gs.enrolled_at DESC
           LIMIT 1
         ) AS current_group_name,
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
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       LEFT JOIN locations sl ON sl.id = st.location_id
       WHERE r.school_id = $1
         ${extraWhere}
       GROUP BY
         r.id, r.season, r.status, r.initiated_at, r.confirmed_at, r.proposed_group_id,
         r.school_id, c.id, c.first_name, c.last_name,
         u.id, u.first_name, u.last_name, u.email, g.name
       ORDER BY
         CASE UPPER(BTRIM(COALESCE(r.status::text, '')))
           WHEN 'DRAFT' THEN 0
           WHEN 'CONFIRMED' THEN 1
           WHEN 'PROPOSED' THEN 2
           WHEN 'PENDING_CONFIRMATION' THEN 3
           WHEN 'NEGOTIATING' THEN 4
           WHEN 'ACCEPTED' THEN 5
           WHEN 'AWAITING_CONTRACT' THEN 6
           WHEN 'CONTRACT_READY' THEN 7
           WHEN 'SIGNED' THEN 8
           WHEN 'RESIGNED' THEN 9
           ELSE 10
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
              COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule
       FROM groups g
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       LEFT JOIN locations sl ON sl.id = st.location_id
       WHERE g.active = TRUE AND g.school_id = $1
       GROUP BY g.id, g.name
       ORDER BY g.name`,
      [schoolId]
    );

    return NextResponse.json({
      renewalsOpen: schoolRow?.renewals_open ?? false,
      renewalsSeason: targetSeason || (schoolRow?.renewals_season ?? null),
      plannedNextYear,
      activeSchoolYear,
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
        currentGroupId: row.current_group_id,
        currentGroupName: row.current_group_name,
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminRenewalsContext(request);
    if (!ctx.ok) return ctx.response;
    const { schoolId } = ctx;

    const body = (await request.json().catch(() => ({}))) as { childId?: unknown };
    const childId = typeof body.childId === "string" ? body.childId.trim() : "";
    if (!childId) {
      return NextResponse.json({ message: "Brak childId" }, { status: 400 });
    }

    const target = await requireRenewalTargetSchoolYear(schoolId);
    if (!target.ok) {
      return NextResponse.json({ message: target.message }, { status: 409 });
    }
    const season = target.year.name;

    const childRes = await queryDb<{ parent_id: string; access_level: string }>(
      `SELECT parent_id, UPPER(BTRIM(COALESCE(access_level::text, ''))) AS access_level
       FROM children
       WHERE id = $1 AND school_id = $2 AND active = TRUE
       LIMIT 1`,
      [childId, schoolId]
    );
    const child = childRes.rows[0];
    if (!child) {
      return NextResponse.json({ message: "Nie znaleziono aktywnego dziecka" }, { status: 404 });
    }
    if (child.access_level !== "SIGNED") {
      return NextResponse.json(
        { message: "Odnowienie można utworzyć tylko dla dziecka ze statusem SIGNED" },
        { status: 409 }
      );
    }

    const existing = await queryDb<{ id: string; status: string }>(
      `SELECT id, status FROM renewals WHERE child_id = $1 AND season = $2 LIMIT 1`,
      [childId, season]
    );
    if (existing.rows[0]) {
      return NextResponse.json(
        {
          message: "Odnowienie dla tego dziecka w tym sezonie już istnieje",
          renewalId: existing.rows[0].id,
          status: existing.rows[0].status,
        },
        { status: 409 }
      );
    }

    const insertRes = await queryDb<{ id: string }>(
      `INSERT INTO renewals (
         id, school_id, child_id, parent_id, season, status, initiated_at, created_at
       ) VALUES (
         gen_random_uuid()::text, $1, $2, $3, $4, 'DRAFT', NOW(), NOW()
       )
       RETURNING id`,
      [schoolId, childId, child.parent_id, season]
    );

    return NextResponse.json({
      renewalId: insertRes.rows[0]?.id,
      message: "Utworzono szkic odnowienia — wyślij zapytanie do rodzica, gdy będziesz gotowy",
    });
  } catch (error) {
    console.error("Admin renewals POST error:", error);
    return NextResponse.json({ message: "Błąd tworzenia odnowienia" }, { status: 500 });
  }
}
