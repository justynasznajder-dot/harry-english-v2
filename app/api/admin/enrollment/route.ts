import { NextRequest, NextResponse } from "next/server";
import { countPendingEnrollments } from "@/lib/admin-dashboard";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { sendProposalEmail } from "@/lib/email";
import { completeComplimentaryEnrollment } from "@/lib/complimentary-enrollment";
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

    if (request.nextUrl.searchParams.get("countOnly") === "1") {
      const { schoolId } = managerSchoolAndClause(ctx.tenant, "er.school_id", 1);
      const pendingCount = await countPendingEnrollments(schoolId);
      return NextResponse.json({ pendingCount });
    }

    const { clause: parentsSchoolClause, schoolId: parentsSchoolId } = managerSchoolAndClause(
      ctx.tenant,
      "er.school_id",
      1
    );
    const parentsParams = parentsSchoolId ? [parentsSchoolId] : [];

    // Klucz karty: e-mail rodzica (to samo zgłoszenie = ten sam rodzic).
    // Gdy brak e-maila — konto, żeby puste adresy nie sklejały rodzin.
    const parentGroupKeySql = `COALESCE(
         LOWER(NULLIF(BTRIM(er.parent_email::text), '')),
         NULLIF(BTRIM(er.user_id), '')
       )`;

    const parentsRes = await queryDb<{
      id: string;
      parent_user_id: string;
      first_name: string;
      last_name: string;
      email: string;
      school_id: string;
      access_level: EnrollmentStatus;
      discount_large_family: boolean;
      enrolling_multiple_children: boolean;
      latest_created_at: Date | string | null;
      children_json: string;
    }>(
      `SELECT
         ${parentGroupKeySql} AS id,
         MAX(COALESCE(NULLIF(BTRIM(er.user_id), ''), u.id, '')) AS parent_user_id,
         COALESCE(
           (ARRAY_AGG(NULLIF(BTRIM(er.parent_first_name), '') ORDER BY er.created_at ASC)
             FILTER (WHERE NULLIF(BTRIM(er.parent_first_name), '') IS NOT NULL))[1],
           MAX(NULLIF(BTRIM(u.first_name), '')),
           ''
         ) AS first_name,
         COALESCE(
           (ARRAY_AGG(NULLIF(BTRIM(er.parent_last_name), '') ORDER BY er.created_at ASC)
             FILTER (WHERE NULLIF(BTRIM(er.parent_last_name), '') IS NOT NULL))[1],
           MAX(NULLIF(BTRIM(u.last_name), '')),
           ''
         ) AS last_name,
         COALESCE(
           MAX(NULLIF(BTRIM(u.email), '')),
           MAX(NULLIF(BTRIM(er.parent_email), '')),
           ''
         ) AS email,
         MAX(er.school_id) AS school_id,
         CASE
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEW') THEN 'NEW'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'NEGOTIATING') THEN 'NEGOTIATING'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'REJECTED') THEN 'REJECTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'PROPOSED') THEN 'PROPOSED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'ACCEPTED') THEN 'ACCEPTED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'AWAITING_CONTRACT') THEN 'AWAITING_CONTRACT'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'CONTRACT_READY') THEN 'CONTRACT_READY'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'SIGNED') THEN 'SIGNED'
           WHEN BOOL_OR(UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'COMPLETED') THEN 'COMPLETED'
           ELSE 'NEW'
         END AS access_level,
         BOOL_OR(
           COALESCE(pp.discount_large_family, FALSE)
           OR COALESCE(er.discount_large_family, FALSE)
         ) AS discount_large_family,
         BOOL_OR(
           COALESCE(er.enrolling_multiple_children, FALSE)
           AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN ('REJECTED', 'COMPLETED')
         ) AS enrolling_multiple_children,
         MAX(er.created_at) AS latest_created_at,
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
               'rejectionComment', er.rejection_comment,
               'managerComment', er.manager_comment,
               'proposedGroupId', er.proposed_group_id,
               'proposedAt', er.proposed_at,
               'createdAt', er.created_at,
               'lessonUnitPrice', er.lesson_unit_price::text,
               'monthlyUnitPrice', er.monthly_unit_price::text,
               'yearlyUnitPrice', er.yearly_unit_price::text,
               'discountPercent', c.discount_percent::text,
               'lessonsPerWeek', er.lessons_per_week,
               'groupLessonsPerWeek', (
                 SELECT g.lessons_per_week
                 FROM groups g
                 WHERE g.id = er.proposed_group_id
                 LIMIT 1
               ),
               'studentLessonsPerWeek', (
                 SELECT gs.lessons_per_week
                 FROM group_students gs
                 WHERE c.id IS NOT NULL
                   AND gs.child_id = c.id
                   AND gs.left_at IS NULL
                   AND (
                     er.proposed_group_id IS NULL
                     OR gs.group_id = er.proposed_group_id
                   )
                 ORDER BY
                   CASE WHEN gs.group_id = er.proposed_group_id THEN 0 ELSE 1 END,
                   gs.enrolled_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractPaymentType', (
                 SELECT ct.payment_type
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractAmount', (
                 SELECT ct.amount::text
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractBillingExempt', (
                 SELECT ct.billing_exempt
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractDiscountLargeFamily', (
                 SELECT ct.discount_large_family
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractDiscountSibling', (
                 SELECT ct.discount_sibling
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractLessonUnitPrice', (
                 SELECT cc.lesson_unit_price::text
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractMonthlyUnitPrice', (
                 SELECT cc.monthly_unit_price::text
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               ),
               'contractYearlyUnitPrice', (
                 SELECT cc.yearly_unit_price::text
                 FROM contract_children cc
                 JOIN contracts ct ON ct.id = cc.contract_id
                 WHERE cc.enrollment_request_id = er.id
                   AND ct.signed_at IS NOT NULL
                 ORDER BY ct.signed_at DESC NULLS LAST
                 LIMIT 1
               )
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
       WHERE (
           COALESCE(u.id, NULLIF(BTRIM(er.user_id), '')) IS NOT NULL
           OR NULLIF(BTRIM(COALESCE(er.parent_email::text, '')), '') IS NOT NULL
         )
         ${parentsSchoolClause}
       GROUP BY ${parentGroupKeySql}
       ORDER BY MAX(er.created_at) DESC NULLS LAST`,
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
              COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
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
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id
       LEFT JOIN locations sl ON sl.id = st.location_id
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
        schoolId: row.school_id,
        accessLevel: row.access_level,
        discountLargeFamily: row.discount_large_family === true,
        enrollingMultipleChildren: row.enrolling_multiple_children === true,
        latestCreatedAt: row.latest_created_at
          ? new Date(row.latest_created_at).toISOString()
          : null,
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
    const { requestId, groupId, lessonUnitPrice, monthlyUnitPrice, yearlyUnitPrice, discountPercent, managerComment } = body as {
      requestId?: string;
      groupId?: string;
      lessonUnitPrice?: number | string | null;
      monthlyUnitPrice?: number | string | null;
      yearlyUnitPrice?: number | string | null;
      discountPercent?: number | string | null;
      managerComment?: string | null;
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
        discountPercent,
        managerComment,
      },
      null,
      {
        ...(ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : {}),
        allowedStatuses: [
          "NEGOTIATING",
          "ACCEPTED",
          "AWAITING_CONTRACT",
          "CONTRACT_READY",
        ],
      }
    );
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    const { sharedParent, emailItem, complimentaryCompleted } = result;

    await sendProposalEmail(
      sharedParent.parentEmail,
      `${sharedParent.parentFirstName} ${sharedParent.parentLastName}`.trim(),
      emailItem,
      { complimentaryCompleted }
    );

    if (complimentaryCompleted) {
      try {
        await completeComplimentaryEnrollment(
          requestId,
          sharedParent.parentUserId,
          sharedParent.schoolId
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : "nieznany błąd";
        console.error("completeComplimentaryEnrollment after email failed:", err);
        return NextResponse.json(
          {
            message: `Mail wysłany, ale zapis nie dokończył się (${detail}). Spróbuj ponownie „Wyślij maila”.`,
          },
          { status: 500 }
        );
      }
    }

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
