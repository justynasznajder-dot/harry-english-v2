import { NextRequest, NextResponse } from "next/server";
import { requireAdminSchoolContext } from "@/lib/admin-school-context";
import { POLISH_DAY_FROM_ST_SQL, queryDb } from "@/lib/db";
import { sendGroupChangeNotificationEmail } from "@/lib/email";
import { saveEnrollmentProposalDraft } from "@/lib/admin-enrollment-proposal";
import { isComplimentaryForParent } from "@/lib/school-discounts";

/** Statusy po pierwszym mailu z terminem — tu wysyłamy tylko info o zmianie grupy (bez loginu). */
const GROUP_CHANGE_NOTIFY_STATUSES = [
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
  "PROPOSED",
] as const;

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAdminSchoolContext(request);
    if (!ctx.ok) return ctx.response;

    const body = await request.json();
    const {
      requestId,
      groupId,
      lessonUnitPrice,
      monthlyUnitPrice,
      yearlyUnitPrice,
      discountPercent,
    } = body as {
      requestId?: string;
      groupId?: string;
      lessonUnitPrice?: number | string | null;
      monthlyUnitPrice?: number | string | null;
      yearlyUnitPrice?: number | string | null;
      discountPercent?: number | string | null;
    };

    const rid = typeof requestId === "string" ? requestId.trim() : "";
    const gid = typeof groupId === "string" ? groupId.trim() : "";
    if (!rid || !gid) {
      return NextResponse.json({ message: "Brak wymaganych pól" }, { status: 400 });
    }

    const schoolRestrict =
      ctx.tenant.role === "MANAGER" ? { restrictToSchoolId: ctx.schoolId } : undefined;

    const enrollmentRes = await queryDb<{
      id: string;
      status: string;
      school_id: string;
      parent_email: string;
      parent_first_name: string;
      parent_last_name: string;
      child_first_name: string;
      child_last_name: string;
      proposed_group_id: string | null;
      user_id: string | null;
      proposed_at: Date | string | null;
    }>(
      `SELECT er.id,
              UPPER(BTRIM(COALESCE(er.status::text, ''))) AS status,
              er.school_id,
              er.parent_email,
              er.parent_first_name,
              er.parent_last_name,
              er.child_first_name,
              er.child_last_name,
              er.proposed_group_id,
              er.user_id,
              er.proposed_at
       FROM enrollment_requests er
       WHERE er.id = $1
         AND ($2::text IS NULL OR er.school_id = $2::text)
       LIMIT 1`,
      [rid, schoolRestrict?.restrictToSchoolId ?? null]
    );

    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json({ message: "Nie znaleziono zgłoszenia" }, { status: 404 });
    }

    const statusOk = (GROUP_CHANGE_NOTIFY_STATUSES as readonly string[]).includes(
      enrollment.status
    );
    const mailAlreadySent =
      statusOk &&
      (enrollment.status !== "PROPOSED" || Boolean(enrollment.proposed_at));
    if (!mailAlreadySent) {
      return NextResponse.json(
        {
          message:
            "Mail o zmianie grupy można wysłać dopiero po wcześniejszym wysłaniu informacji o terminie zajęć.",
        },
        { status: 409 }
      );
    }

    const previousGroupId = enrollment.proposed_group_id?.trim() || null;
    if (previousGroupId && previousGroupId === gid) {
      return NextResponse.json(
        { message: "Wybrana grupa jest taka sama jak aktualnie przypisana." },
        { status: 400 }
      );
    }

    let previousGroupName: string | null = null;
    if (previousGroupId) {
      const prevRes = await queryDb<{ name: string }>(
        `SELECT name FROM groups WHERE id = $1 LIMIT 1`,
        [previousGroupId]
      );
      previousGroupName = prevRes.rows[0]?.name?.trim() || null;
    }

    const complimentary = await isComplimentaryForParent(enrollment.school_id, {
      parentId: enrollment.user_id,
      parentEmail: enrollment.parent_email,
    });

    const saveResult = await saveEnrollmentProposalDraft(
      {
        requestId: rid,
        groupId: gid,
        lessonUnitPrice,
        monthlyUnitPrice,
        yearlyUnitPrice,
        discountPercent,
      },
      {
        ...schoolRestrict,
        allowEmptyPrices: !complimentary,
        complimentaryPrices: complimentary,
      }
    );
    if (!saveResult.ok) {
      return NextResponse.json({ message: saveResult.message }, { status: saveResult.status });
    }

    const groupRes = await queryDb<{
      name: string;
      location_name: string;
      schedule: string;
      teacher_name: string;
    }>(
      `SELECT g.name,
              COALESCE(MAX(gl.name), MAX(sl.name), 'Do ustalenia') AS location_name,
              COALESCE(
                NULLIF(
                  STRING_AGG(
                    DISTINCT CONCAT(${POLISH_DAY_FROM_ST_SQL}, ' ', TO_CHAR(st.start_time, 'HH24:MI')),
                    ', '
                  ),
                  ''
                ),
                'Do ustalenia'
              ) AS schedule,
              COALESCE(
                NULLIF(TRIM(MAX(CONCAT(t.first_name, ' ', t.last_name))), ''),
                'Do ustalenia'
              ) AS teacher_name
       FROM groups g
       LEFT JOIN locations gl ON gl.id = g.location_id
       LEFT JOIN schedule_templates st ON st.group_id = g.id AND st.active = TRUE
       LEFT JOIN locations sl ON sl.id = st.location_id
       LEFT JOIN users t ON t.id = g.teacher_id
       WHERE g.id = $1
         AND g.school_id = $2
       GROUP BY g.id, g.name
       LIMIT 1`,
      [gid, enrollment.school_id]
    );

    const group = groupRes.rows[0];
    if (!group) {
      return NextResponse.json(
        { message: "Zapisano grupę, ale nie udało się odczytać danych do maila" },
        { status: 500 }
      );
    }

    const parentName =
      `${enrollment.parent_first_name} ${enrollment.parent_last_name}`.trim() || "Rodzicu";

    await sendGroupChangeNotificationEmail(enrollment.parent_email, parentName, {
      childFirstName: enrollment.child_first_name,
      childLastName: enrollment.child_last_name,
      groupName: group.name,
      locationName: group.location_name,
      schedule: group.schedule,
      teacherName: group.teacher_name,
      previousGroupName,
    });

    // Oznacz moment powiadomienia (bez zmiany statusu).
    await queryDb(
      `UPDATE enrollment_requests
       SET proposed_at = NOW()
       WHERE id = $1`,
      [rid]
    );

    return NextResponse.json({
      message: "Zapisano nową grupę i wysłano maila o zmianie (bez danych logowania)",
      groupChanged: saveResult.groupChanged,
    });
  } catch (error) {
    console.error("POST /api/admin/enrollment/group-change-notify:", error);
    return NextResponse.json(
      { message: "Błąd wysyłania maila o zmianie grupy" },
      { status: 500 }
    );
  }
}
