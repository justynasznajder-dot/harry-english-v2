import { NextRequest, NextResponse } from "next/server";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";
import {
  managerSchoolAndClause,
  requireAdminSchoolContext,
} from "@/lib/admin-school-context";
import type { EnrollmentStatus } from "@/lib/enrollment-status";
import { submitEnrollmentProposal } from "@/lib/admin-enrollment-proposal";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const { clause: parentsSchoolClause, schoolId: parentsSchoolId } = managerSchoolAndClause(
      ctx.tenant,
      "er.school_id",
      1
    );
    const parentsParams = parentsSchoolId ? [parentsSchoolId] : [];

    const parentsRes = await queryDb<{
      id: string;
      parent_user_id: string;
      first_name: string;
      last_name: string;
      email: string;
      access_level: EnrollmentStatus;
      discount_large_family: boolean;
      children_json: string;
    }>(
      `SELECT
         COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, er.parent_email) AS id,
         MAX(COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, '')) AS parent_user_id,
         COALESCE(
           MAX(NULLIF(BTRIM(er.parent_first_name), '')),
           MAX(NULLIF(BTRIM(u.first_name), '')),
           ''
         ) AS first_name,
         COALESCE(
           MAX(NULLIF(BTRIM(er.parent_last_name), '')),
           MAX(NULLIF(BTRIM(u.last_name), '')),
           ''
         ) AS last_name,
         COALESCE(
           MAX(NULLIF(BTRIM(u.email), '')),
           MAX(NULLIF(BTRIM(er.parent_email), '')),
           ''
         ) AS email,
         CASE
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW') THEN 'NEW'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEGOTIATING') THEN 'NEGOTIATING'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'REJECTED') THEN 'REJECTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED') THEN 'PROPOSED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'ACCEPTED') THEN 'ACCEPTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'SIGNED') THEN 'SIGNED'
           ELSE 'NEW'
         END AS access_level,
         BOOL_OR(COALESCE(pp.discount_large_family, FALSE)) AS discount_large_family,
         COALESCE(
           JSON_AGG(
             DISTINCT JSONB_BUILD_OBJECT(
               'id', COALESCE(c.id, er.id),
               'requestId', er.id,
               'firstName', COALESCE(c.first_name, er.child_first_name),
               'lastName', COALESCE(c.last_name, er.child_last_name),
               'confirmed', COALESCE(c.confirmed, FALSE),
               'status', UPPER(BTRIM(COALESCE(er.status::text, 'NEW'))),
               'childAccessLevel', UPPER(BTRIM(COALESCE(c.access_level::text, er.status::text, 'NEW'))),
               'birthDate', er.child_birth_date::text,
               'preferredLocation', COALESCE(loc.name, NULLIF(TRIM(er.preferred_location), '')),
               'preferredLocationId', NULLIF(TRIM(BOTH FROM COALESCE(er.preferred_location, '')), ''),
               'notes', er.notes,
               'proposedGroupId', er.proposed_group_id,
               'proposedAt', er.proposed_at,
               'lessonUnitPrice', er.lesson_unit_price::text,
               'monthlyUnitPrice', er.monthly_unit_price::text,
               'yearlyUnitPrice', er.yearly_unit_price::text
             )
           ) FILTER (
             WHERE COALESCE(c.id, er.id) IS NOT NULL
               AND COALESCE(c.first_name, er.child_first_name, '') <> ''
               AND COALESCE(c.last_name, er.child_last_name, '') <> ''
           ),
           '[]'::json
         )::text AS children_json
       FROM enrollment_requests er
       LEFT JOIN locations loc
         ON loc.school_id = er.school_id
        AND loc.id = NULLIF(TRIM(BOTH FROM COALESCE(er.preferred_location, '')), '')
       LEFT JOIN users u
         ON (
           u.id = NULLIF(BTRIM(er.user_id), '')
           OR (
             u.school_id = er.school_id
             AND LOWER(u.email::text) = LOWER(er.parent_email::text)
           )
         )
       LEFT JOIN children c
         ON c.parent_id = COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id)
        AND c.school_id = er.school_id
        AND c.first_name = er.child_first_name
        AND c.last_name = er.child_last_name
       LEFT JOIN parent_profiles pp
         ON pp.user_id = COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id)
       WHERE UPPER(BTRIM(COALESCE(er.status::text, ''))) <> 'COMPLETED'
         AND (
           COALESCE(u.id, NULLIF(BTRIM(er.user_id), '')) IS NOT NULL
           OR NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
         )
         ${parentsSchoolClause}
      GROUP BY COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, er.parent_email)
       ORDER BY MAX(er.created_at) DESC`,
      parentsParams
    );

    const { clause: groupsSchoolClause, schoolId: groupsSchoolId } = managerSchoolAndClause(
      ctx.tenant,
      "g.school_id",
      1
    );
    const groupsParams = groupsSchoolId ? [groupsSchoolId] : [];

    const groupsRes = await queryDb<{
      id: string;
      name: string;
      location_name: string;
      schedule: string;
      location_ids: string[];
      price_monthly: string | null;
      price_yearly: string | null;
      price_per_lesson: string | null;
    }>(
      `SELECT g.id,
              g.name,
              g.price_monthly::text AS price_monthly,
              g.price_yearly::text AS price_yearly,
              g.price_per_lesson::text AS price_per_lesson,
              COALESCE(MAX(l.name), 'Do ustalenia') AS location_name,
              COALESCE(
                STRING_AGG(
                  DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                  ', '
                ),
                'Do ustalenia'
              ) AS schedule,
              COALESCE(
                (
                  SELECT ARRAY_AGG(DISTINCT x.lid)
                  FROM (
                    SELECT st2.location_id AS lid
                    FROM schedule_templates st2
                    WHERE st2.group_id = g.id
                      AND st2.location_id IS NOT NULL
                    UNION
                    SELECT g.location_id
                    WHERE g.location_id IS NOT NULL
                  ) x
                ),
                ARRAY[]::text[]
              ) AS location_ids
       FROM groups g
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations l ON l.id = st.location_id
       WHERE g.active = TRUE
         ${groupsSchoolClause}
       GROUP BY g.id, g.name, g.price_monthly, g.price_yearly, g.price_per_lesson, g.location_id
       ORDER BY g.name`,
      groupsParams
    );

    return NextResponse.json({
      parents: parentsRes.rows.map((row) => ({
        id: row.id,
        parentUserId: row.parent_user_id?.trim() || null,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        accessLevel: row.access_level,
        discountLargeFamily: row.discount_large_family === true,
        children: JSON.parse(row.children_json),
      })),
      groups: groupsRes.rows,
    });
  } catch (error) {
    console.error("Admin enrollment GET error:", error);
    return NextResponse.json({ message: "Błąd pobierania zgłoszeń" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const { requestId, groupId, lessonUnitPrice, monthlyUnitPrice, yearlyUnitPrice } = body as {
      requestId?: string;
      groupId?: string;
      lessonUnitPrice?: number | string | null;
      monthlyUnitPrice?: number | string | null;
      yearlyUnitPrice?: number | string | null;
    };
    if (!requestId || !groupId) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const result = await submitEnrollmentProposal(
      {
        requestId,
        groupId,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
      },
      null,
      {
        ...(ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : {}),
        allowedStatuses: ["NEGOTIATING"],
      }
    );
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    const { sharedParent, emailItem } = result;

    await sendProposalEmail(
      sharedParent.parentEmail,
      `${sharedParent.parentFirstName} ${sharedParent.parentLastName}`.trim(),
      emailItem
    );

    return NextResponse.json({
      message: "Nowa propozycja została wysłana",
      parentCreated: false,
      parentId: sharedParent.parentUserId,
    });
  } catch (error) {
    console.error("Admin enrollment POST error:", error);
    return NextResponse.json({ message: "Błąd wysyłania propozycji" }, { status: 500 });
  }
}
