import { NextRequest, NextResponse } from "next/server";

import {
  getActiveSchoolYear,
  POLISH_DAY_FROM_ST_SQL,
  queryDb,
  syncParentIdentityFromEnrollments,
} from "@/lib/db";

import {
  computeEnrollmentContractReadiness,
  fetchParentEnrollmentPipelineStatuses,
} from "@/lib/enrollment-contract-readiness";
import { fetchParentContractForPortal, fetchSignedContractDownloadsForParent, countParentChildrenEnrollingOrRenewing } from "@/lib/parent-contract";
import { requireParentContext } from "@/lib/parent-portal-auth";
import { getSchoolDiscountSettings, isComplimentaryForParent } from "@/lib/school-discounts";
import { resolveContractDiscountSettings } from "@/lib/contract-pricing-preview";
import {
  getParentLargeFamilyCard,
  promotePendingLargeFamilyCardToParent,
} from "@/lib/parent-profile-discount";
import { sqlScheduleTemplateVisibleForStudent } from "@/lib/lessons-per-week";



export async function GET(request: NextRequest) {
  const auth = await requireParentContext(request);
  if (!auth.ok) return auth.response;

  const { parentId, schoolId: SCHOOL_ID } = auth.ctx;

  try {
    const syncedIdentity = await syncParentIdentityFromEnrollments(parentId);

    const accessLevelExpr = `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW')))`;



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

      payment_type: string | null;

      price_monthly: number | null;

      price_yearly: number | null;

      price_per_lesson: number | null;

      lesson_unit_price: number | null;

      monthly_unit_price: number | null;

      yearly_unit_price: number | null;

      lessons_per_week: number | null;

      discount_percent: string | null;

      teacher_pickup_consent: boolean;

      has_discount_voucher: boolean;

    }>(

      `SELECT

         c.id                   AS child_id,

         c.enrollment_request_id AS request_id,

         ${accessLevelExpr}     AS access_level,

         c.first_name           AS child_first_name,

         c.last_name            AS child_last_name,

         g.name                 AS group_name,

         COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,

         COALESCE(
           NULLIF(BTRIM(MAX(g.schedule_before_label)), ''),
           NULLIF(
             STRING_AGG(
               DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
               ', '
             ) FILTER (
               WHERE st.id IS NOT NULL
                 AND st.active = TRUE
                 AND st.day_of_week BETWEEN 1 AND 7
                 AND st.start_time IS NOT NULL
             ),
             ''
           ),
           'Do ustalenia'
         ) AS schedule,

         (
           SELECT ct.payment_type
           FROM contracts ct
           JOIN contract_children cc ON cc.contract_id = ct.id AND cc.child_id = c.id
           WHERE ct.parent_id = c.parent_id
             AND ct.school_id = c.school_id
             AND ct.status = 'SIGNED'
           ORDER BY ct.signed_at DESC NULLS LAST, ct.created_at DESC
           LIMIT 1
         ) AS payment_type,

         er.proposed_at,

         g.price_monthly,

         g.price_yearly,

         g.price_per_lesson,

         COALESCE(g.teacher_pickup_consent, FALSE) AS teacher_pickup_consent,

         er.lesson_unit_price,

         er.monthly_unit_price,

         er.yearly_unit_price,

         MAX(
           COALESCE(
             (
               SELECT gs2.lessons_per_week
               FROM group_students gs2
               WHERE gs2.child_id = c.id
                 AND gs2.group_id = g.id
                 AND gs2.left_at IS NULL
               ORDER BY gs2.enrolled_at DESC
               LIMIT 1
             ),
             er.lessons_per_week,
             g.lessons_per_week
           )
         ) AS lessons_per_week,

         c.discount_percent::text AS discount_percent,

         COALESCE(c.has_discount_voucher, FALSE) AS has_discount_voucher

       FROM children c

       LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id

       LEFT JOIN groups g ON g.id = er.proposed_group_id

       LEFT JOIN locations gl ON gl.id = g.location_id

       LEFT JOIN schedule_templates st ON st.group_id = g.id
         AND st.active = TRUE
         AND ${sqlScheduleTemplateVisibleForStudent(`COALESCE(
           (
             SELECT gs2.lessons_per_week
             FROM group_students gs2
             WHERE gs2.child_id = c.id
               AND gs2.group_id = g.id
               AND gs2.left_at IS NULL
             ORDER BY gs2.enrolled_at DESC
             LIMIT 1
           ),
           er.lessons_per_week
         )`)}

       LEFT JOIN locations sl ON sl.id = st.location_id

       WHERE c.parent_id = $1

         AND c.school_id = $2

         AND (
           (
             c.active = TRUE
             AND ${accessLevelExpr} IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY', 'SIGNED', 'COMPLETED')
           )
           OR ${accessLevelExpr} = 'REJECTED'
           OR UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'REJECTED'
         )

       GROUP BY c.id, c.enrollment_request_id, ${accessLevelExpr}, c.first_name, c.last_name,

                g.name, er.proposed_at, er.created_at, c.created_at, g.price_monthly, g.price_yearly,
                g.price_per_lesson, g.teacher_pickup_consent, g.lessons_per_week, er.lesson_unit_price,
                er.monthly_unit_price, er.yearly_unit_price, c.discount_percent, c.has_discount_voucher

       ORDER BY er.created_at ASC, c.created_at ASC, c.id ASC`,

      [parentId, SCHOOL_ID]

    );

    const proposalRows = [...proposalsRes.rows];

    // Rezygnacje bez rekordu children (np. REJECTED zanim powstał profil dziecka)
    // — i tak pokaż na etapie Umowy.
    const rejectedOnlyRes = await queryDb<{
      request_id: string;
      child_first_name: string;
      child_last_name: string;
      preferred_location_name: string | null;
      preferred_location: string | null;
      proposed_group_name: string | null;
      location_name: string | null;
    }>(
      `SELECT
         er.id AS request_id,
         er.child_first_name,
         er.child_last_name,
         l.name AS preferred_location_name,
         er.preferred_location,
         g.name AS proposed_group_name,
         gl.name AS location_name
       FROM enrollment_requests er
       LEFT JOIN locations l ON l.id = er.preferred_location
       LEFT JOIN groups g ON g.id = er.proposed_group_id
       LEFT JOIN locations gl ON gl.id = g.location_id
       WHERE er.school_id = $2
         AND UPPER(BTRIM(COALESCE(er.status::text, ''))) = 'REJECTED'
         AND (
           er.user_id = $1
           OR (
             EXISTS (
               SELECT 1 FROM users u
               WHERE u.id = $1
                 AND LOWER(BTRIM(u.email::text)) = LOWER(BTRIM(er.parent_email::text))
             )
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM children c
           WHERE c.enrollment_request_id = er.id
              OR (
                c.parent_id = $1
                AND LOWER(BTRIM(c.first_name)) = LOWER(BTRIM(er.child_first_name))
                AND LOWER(BTRIM(c.last_name)) = LOWER(BTRIM(er.child_last_name))
              )
         )`,
      [parentId, SCHOOL_ID]
    );

    const existingRequestIds = new Set(
      proposalRows.map((row) => row.request_id).filter(Boolean) as string[]
    );
    for (const row of rejectedOnlyRes.rows) {
      if (existingRequestIds.has(row.request_id)) continue;
      proposalRows.push({
        child_id: row.request_id,
        request_id: row.request_id,
        access_level: "REJECTED",
        child_first_name: row.child_first_name,
        child_last_name: row.child_last_name,
        group_name: row.proposed_group_name,
        location_name:
          row.location_name ??
          row.preferred_location_name ??
          (row.preferred_location?.trim() || "Do ustalenia"),
        schedule: "—",
        proposed_at: null,
        payment_type: null,
        price_monthly: null,
        price_yearly: null,
        price_per_lesson: null,
        lesson_unit_price: null,
        monthly_unit_price: null,
        yearly_unit_price: null,
        lessons_per_week: null,
        discount_percent: null,
        teacher_pickup_consent: false,
        has_discount_voucher: false,
      });
    }

    const parentRes = await queryDb<{ email: string | null }>(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [parentId]
    );

    const parentEmail = String(parentRes.rows[0]?.email ?? "").trim().toLowerCase();

    const complimentaryEnrollment = await isComplimentaryForParent(SCHOOL_ID, {
      parentId,
      parentEmail,
    });



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

      monthly_unit_price: number | null;

      yearly_unit_price: number | null;

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

         er.created_at,

         er.monthly_unit_price,

         er.yearly_unit_price

       FROM enrollment_requests er

       LEFT JOIN locations l ON l.id = er.preferred_location

       WHERE er.school_id = $1

         AND (

           er.user_id = $2

           OR ($3 <> '' AND LOWER(BTRIM(er.parent_email::text)) = $3)

         )

       ORDER BY er.created_at DESC`,

      [SCHOOL_ID, parentId, parentEmail]

    );



    const parentContract = await fetchParentContractForPortal(parentId, SCHOOL_ID);
    const signedContractDownloads = await fetchSignedContractDownloadsForParent(
      parentId,
      SCHOOL_ID
    );
    const activeSchoolYear = await getActiveSchoolYear(SCHOOL_ID);
    const schoolYearName =
      activeSchoolYear && typeof activeSchoolYear.name === "string"
        ? String(activeSchoolYear.name)
        : null;



    const proposals = proposalRows.map((row) => ({

      child_id: row.child_id,

      request_id: row.request_id ?? row.child_id,

      access_level: row.access_level,

      child_first_name: row.child_first_name,

      child_last_name: row.child_last_name,

      group_name: row.group_name,

      location_name: row.location_name,

      schedule: row.schedule,

      proposed_at: row.proposed_at,

      payment_type: row.payment_type ?? null,

      price_monthly: row.price_monthly,

      price_yearly: row.price_yearly,

      price_per_lesson: row.price_per_lesson,

      lesson_unit_price: row.lesson_unit_price,

      monthly_unit_price: row.monthly_unit_price,

      yearly_unit_price: row.yearly_unit_price,

      lessons_per_week: row.lessons_per_week,

      discount_percent: row.discount_percent,

      teacher_pickup_consent: Boolean(row.teacher_pickup_consent),

      has_discount_voucher: Boolean(row.has_discount_voucher),

    }));



    const pipelineStatuses = await fetchParentEnrollmentPipelineStatuses(
      SCHOOL_ID,
      parentId,
      parentEmail
    );

    const contractReadinessState = computeEnrollmentContractReadiness(
      pipelineStatuses,
      complimentaryEnrollment
    );

    const discountSettings = resolveContractDiscountSettings(
      await getSchoolDiscountSettings(SCHOOL_ID)
    );

    // Staging KDR z oznaczenia managera → profil przy pierwszym wejściu rodzica.
    if (parentEmail) {
      await promotePendingLargeFamilyCardToParent({
        schoolId: SCHOOL_ID,
        parentUserId: parentId,
        parentEmail,
      });
    }

    let discountLargeFamily = await getParentLargeFamilyCard(parentId);
    if (!discountLargeFamily && parentEmail) {
      const stagingKdr = await queryDb<{ v: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM enrollment_requests
           WHERE school_id = $1
             AND discount_large_family = TRUE
             AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'
             AND (
               user_id = $2
               OR LOWER(BTRIM(parent_email::text)) = $3
             )
         ) AS v`,
        [SCHOOL_ID, parentId, parentEmail]
      );
      discountLargeFamily = stagingKdr.rows[0]?.v === true;
    }

    const multiChildrenRes = await queryDb<{ enrolling_multiple_children: boolean }>(
      `SELECT COALESCE(BOOL_OR(enrolling_multiple_children), FALSE) AS enrolling_multiple_children
       FROM enrollment_requests
       WHERE school_id = $1
         AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'
         AND (
           user_id = $2
           OR (
             $3::text <> ''
             AND LOWER(BTRIM(parent_email::text)) = LOWER(BTRIM($3::text))
           )
         )`,
      [SCHOOL_ID, parentId, parentEmail ?? ""]
    );
    const enrollingMultipleChildren =
      multiChildrenRes.rows[0]?.enrolling_multiple_children === true;

    const siblingEligibleChildCount = await countParentChildrenEnrollingOrRenewing(
      parentId,
      SCHOOL_ID
    );

    return NextResponse.json({

      proposals,

      contractPricing: {
        billingExempt: complimentaryEnrollment,
        discountLargeFamily,
        discountSettings: {
          LARGE_FAMILY_CARD: discountSettings.LARGE_FAMILY_CARD,
          SIBLING: discountSettings.SIBLING,
          maxPercent: discountSettings.maxPercent,
        },
      },

      enrollingMultipleChildren,
      siblingEligibleChildCount,

      parentContract: parentContract

        ? {

            id: parentContract.id,

            status: parentContract.status,

            content_html: parentContract.content_html,

            child_attachments: parentContract.child_attachments,

            include_attachment_2: parentContract.include_attachment_2,

            payment_type: parentContract.payment_type,

            amount: parentContract.amount,

            signed_at: parentContract.signed_at,

            included_children: parentContract.included_children,

          }

        : null,

      signedContractDownloads,

      contractReadiness: {
        ...contractReadinessState,
        complimentaryEnrollment,
      },

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

                monthlyUnitPrice: row.monthly_unit_price,

                yearlyUnitPrice: row.yearly_unit_price,

              })),

            }

          : null,

      parentIdentity: syncedIdentity,

      schoolYearName,

    });

  } catch (error) {

    console.error("Enrollment status error:", error);

    return NextResponse.json({ message: "Błąd pobierania statusu enrollment" }, { status: 500 });

  }

}


