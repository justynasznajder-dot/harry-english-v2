import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildAmountClause,
  buildChildSchoolName,
  buildContractNumber,
  buildGroupSchedule,
  buildParentAddress,
  buildParentPeselOrId,
  buildTeacherFullName,
  buildTeacherIdSuffix,
  extractContractNumber,
  formatBirthDatePl,
  formatContractDate,
  formatLessonDuration,
  formatPaymentTypeLabel,
  generateContractHtml,
  paymentTypeToClauseKey,
} from "@/lib/contract-html";
import { formatPersonName } from "@/lib/format-person-name";
import {
  getParentProfileByUserId,
  getRegistrationSchoolId,
  getUserById,
  queryDb,
  upsertParentProfileForUser,
} from "@/lib/db";
import { getTokenFromRequest } from "@/lib/auth";

function normalizeOptionalText(raw: unknown, maxLen: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function isExactDigits(value: string, length: number): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value);
}

type TemplateKind = "CONTRACT" | "ATTACHMENT_1" | "ATTACHMENT_2";

async function findContractTemplate(
  schoolId: string,
  schoolYearName: string,
  kind: TemplateKind = "CONTRACT"
): Promise<{ id: string; content_html: string } | null> {
  const exact = await queryDb<{ id: string; content_html: string }>(
    `SELECT id::text, content_html
     FROM contract_templates
     WHERE school_id = $1
       AND active = TRUE
       AND school_year = $2
       AND COALESCE(template_kind, 'CONTRACT') = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [schoolId, schoolYearName, kind]
  );
  if (exact.rows[0]) return exact.rows[0];

  if (kind !== "CONTRACT") {
    return (
      await queryDb<{ id: string; content_html: string }>(
        `SELECT id::text, content_html
         FROM contract_templates
         WHERE school_id = $1
           AND active = TRUE
           AND COALESCE(template_kind, 'CONTRACT') = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId, kind]
      )
    ).rows[0] ?? null;
  }

  return (
    await queryDb<{ id: string; content_html: string }>(
      `SELECT id::text, content_html
       FROM contract_templates
       WHERE school_id = $1
         AND active = TRUE
         AND COALESCE(template_kind, 'CONTRACT') = 'CONTRACT'
       ORDER BY created_at DESC
       LIMIT 1`,
      [schoolId]
    )
  ).rows[0] ?? null;
}

export async function POST(request: NextRequest) {
  const payload = await getTokenFromRequest(request);
  const parentId = payload?.userId ?? null;
  if (!parentId) {
    return NextResponse.json({ message: "Nieautoryzowany dostęp" }, { status: 401 });
  }

  const SCHOOL_ID = getRegistrationSchoolId();

  try {
    const user = await getUserById(parentId);
    if (!user || user.role !== "PARENT") {
      return NextResponse.json({ message: "Brak uprawnień" }, { status: 403 });
    }
    if (!user.school_id) {
      return NextResponse.json({ message: "Konto nie ma przypisanej szkoły" }, { status: 400 });
    }

    const body = await request.json();
    const childId = String(body.childId ?? body.child_id ?? "").trim();
    const enrollmentRequestId = String(
      body.enrollmentRequestId ?? body.enrollment_request_id ?? ""
    ).trim();
    const paymentType = String(body.paymentType ?? body.payment_type ?? "")
      .trim()
      .toUpperCase();
    const billingType = String(body.billingType ?? body.billing_type ?? "private")
      .trim()
      .toLowerCase() as "private" | "company";
    const includeAttachment2 = Boolean(
      body.includeAttachment2 ?? body.include_attachment_2 ?? false
    );

    if (!childId) {
      return NextResponse.json({ message: "Brak identyfikatora dziecka" }, { status: 400 });
    }
    if (paymentType !== "MONTHLY" && paymentType !== "YEARLY") {
      return NextResponse.json(
        { message: "Wybierz sposób rozliczeń: miesięczny lub roczny" },
        { status: 400 }
      );
    }

    const address = normalizeOptionalText(body.address, 500);
    const city = normalizeOptionalText(body.city, 120);
    const zipCode = normalizeOptionalText(body.zipCode ?? body.zip_code, 10);
    const pesel = normalizeOptionalText(body.pesel, 11);
    const companyName = normalizeOptionalText(body.companyName ?? body.company_name, 255);
    const nip = normalizeOptionalText(body.nip, 20);

    if (!address || !city || !zipCode) {
      return NextResponse.json(
        { message: "Uzupełnij adres, miasto i kod pocztowy" },
        { status: 400 }
      );
    }

    if (billingType === "company") {
      if (!companyName || !nip) {
        return NextResponse.json(
          { message: "Dla faktury na firmę podaj nazwę firmy i NIP" },
          { status: 400 }
        );
      }
      if (!isExactDigits(nip, 10)) {
        return NextResponse.json({ message: "NIP musi składać się z dokładnie 10 cyfr" }, { status: 400 });
      }
    } else if (!pesel) {
      return NextResponse.json({ message: "Podaj numer PESEL" }, { status: 400 });
    } else if (!isExactDigits(pesel, 11)) {
      return NextResponse.json({ message: "PESEL musi składać się z dokładnie 11 cyfr" }, { status: 400 });
    }

    const childRes = await queryDb<{
      id: string;
      first_name: string;
      last_name: string;
      birth_date: Date | string;
      access_level: string | null;
      enrollment_request_id: string | null;
    }>(
      `SELECT id, first_name, last_name, birth_date, access_level::text, enrollment_request_id
       FROM children
       WHERE id = $1 AND parent_id = $2 AND school_id = $3 AND active = TRUE
       LIMIT 1`,
      [childId, parentId, SCHOOL_ID]
    );
    const child = childRes.rows[0];
    if (!child) {
      return NextResponse.json({ message: "Nie znaleziono dziecka" }, { status: 404 });
    }

    const resolvedEnrollmentRequestId = enrollmentRequestId || child.enrollment_request_id || "";
    if (!resolvedEnrollmentRequestId) {
      return NextResponse.json({ message: "Brak powiązanego zgłoszenia rekrutacyjnego" }, { status: 400 });
    }

    const enrollmentRes = await queryDb<{
      id: string;
      status: string;
      preferred_location: string | null;
      preferred_location_name: string | null;
      proposed_group_id: string | null;
    }>(
      `SELECT er.id::text, er.status::text, er.preferred_location,
              er.proposed_group_id::text,
              l.name AS preferred_location_name
       FROM enrollment_requests er
       LEFT JOIN locations l ON l.id::text = er.preferred_location::text
       WHERE er.id = $1 AND er.user_id = $2 AND er.school_id = $3
       LIMIT 1`,
      [resolvedEnrollmentRequestId, parentId, SCHOOL_ID]
    );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      return NextResponse.json(
        { message: "Zgłoszenie nie należy do zalogowanego rodzica" },
        { status: 403 }
      );
    }
    if (String(enrollment.status ?? "").toUpperCase() !== "ACCEPTED") {
      return NextResponse.json(
        { message: "Umowę można przygotować dopiero po akceptacji propozycji grupy" },
        { status: 409 }
      );
    }

    const proposedGroupId = enrollment.proposed_group_id;
    if (!proposedGroupId) {
      return NextResponse.json(
        { message: "Brak przypisanej grupy dla tego zgłoszenia" },
        { status: 409 }
      );
    }

    const existingSigned = await queryDb<{ id: string }>(
      `SELECT id::text
       FROM contracts
       WHERE enrollment_request_id = $1 AND parent_id = $2 AND status = 'SIGNED'
       LIMIT 1`,
      [resolvedEnrollmentRequestId, parentId]
    );
    if (existingSigned.rows[0]) {
      return NextResponse.json({ message: "Umowa została już podpisana" }, { status: 409 });
    }

    await upsertParentProfileForUser({
      userId: parentId,
      schoolId: user.school_id,
      address,
      city,
      zip_code: zipCode,
      company_name: billingType === "company" ? companyName : null,
      nip: billingType === "company" ? nip : null,
      pesel: billingType === "company" ? null : pesel,
    });

    const profile = await getParentProfileByUserId(parentId);

    const groupRes = await queryDb<{
      id: string;
      name: string;
      price_monthly: string | null;
      price_yearly: string | null;
      school_year_id: string | null;
      teacher_first_name: string | null;
      teacher_last_name: string | null;
    }>(
      `SELECT g.id::text, g.name, g.price_monthly::text, g.price_yearly::text, g.school_year_id::text,
              u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
       FROM groups g
       LEFT JOIN users u ON u.id = g.teacher_id
       WHERE g.id = $2
       LIMIT 1`,
      [resolvedEnrollmentRequestId, proposedGroupId]
    );
    const group = groupRes.rows[0];
    if (!group) {
      return NextResponse.json({ message: "Nie znaleziono przypisanej grupy" }, { status: 404 });
    }

    const overrideRes = await queryDb<{ id: string; amount: string | null }>(
      `SELECT id::text, amount::text
       FROM contracts
       WHERE enrollment_request_id = $1 AND parent_id = $2 AND price_override = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [resolvedEnrollmentRequestId, parentId]
    );
    const priceOverride = overrideRes.rows[0];

    let amount: number | null = null;
    if (priceOverride?.amount != null) {
      amount = Number(priceOverride.amount);
    } else {
      const priceRaw = paymentType === "YEARLY" ? group.price_yearly : group.price_monthly;
      amount = priceRaw != null && priceRaw !== "" ? Number(priceRaw) : null;
    }

    const schoolYearRes = await queryDb<{ id: string; name: string }>(
      `SELECT id::text, name
       FROM school_years
       WHERE school_id = $1 AND active = TRUE
       ORDER BY date_from DESC
       LIMIT 1`,
      [SCHOOL_ID]
    );
    const activeSchoolYear = schoolYearRes.rows[0];
    const schoolYearName =
      activeSchoolYear?.name ??
      (
        await queryDb<{ name: string }>(
          `SELECT name FROM school_years WHERE id = $1 LIMIT 1`,
          [group.school_year_id]
        )
      ).rows[0]?.name ??
      "2025/2026";
    const schoolYearId = activeSchoolYear?.id ?? group.school_year_id ?? null;

    const template = await findContractTemplate(SCHOOL_ID, schoolYearName, "CONTRACT");
    if (!template) {
      return NextResponse.json(
        { message: "Brak aktywnego szablonu umowy — skontaktuj się ze szkołą" },
        { status: 503 }
      );
    }

    const attachment1Template = await findContractTemplate(SCHOOL_ID, schoolYearName, "ATTACHMENT_1");
    const attachment2Template = includeAttachment2
      ? await findContractTemplate(SCHOOL_ID, schoolYearName, "ATTACHMENT_2")
      : null;

    const schoolRes = await queryDb<{ name: string; city: string | null }>(
      `SELECT name, city FROM schools WHERE id = $1 LIMIT 1`,
      [SCHOOL_ID]
    );
    const school = schoolRes.rows[0];

    const scheduleRes = await queryDb<{ day_of_week: number; start_time: Date | string; duration_min: number }>(
      `SELECT day_of_week, start_time, duration_min
       FROM schedule_templates
       WHERE group_id = $1
       ORDER BY day_of_week ASC, start_time ASC`,
      [group.id]
    );
    const groupSchedule = buildGroupSchedule(scheduleRes.rows);
    const lessonDuration = formatLessonDuration(
      scheduleRes.rows[0]?.duration_min ?? scheduleRes.rows.find((r) => r.duration_min)?.duration_min
    );

    const existingSent = await queryDb<{ id: string; content_html: string }>(
      `SELECT id::text, content_html
       FROM contracts
       WHERE enrollment_request_id = $1 AND parent_id = $2 AND status = 'SENT'
       ORDER BY created_at DESC
       LIMIT 1`,
      [resolvedEnrollmentRequestId, parentId]
    );

    const existingNumber = existingSent.rows[0]?.content_html
      ? extractContractNumber(existingSent.rows[0].content_html)
      : null;

    let contractNumber: string;
    if (existingNumber) {
      contractNumber = existingNumber;
    } else {
      const countRes = await queryDb<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM contracts
         WHERE school_id = $1 AND school_year_id IS NOT DISTINCT FROM $2::text`,
        [SCHOOL_ID, schoolYearId]
      );
      contractNumber = buildContractNumber(
        schoolYearName,
        Number(countRes.rows[0]?.count ?? 0) + 1
      );
    }

    const parentFullName = `${formatPersonName(user.first_name ?? "")} ${formatPersonName(user.last_name ?? "")}`.trim();
    const childFullName = `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
    const parentAddress = buildParentAddress(
      profile?.address ?? address,
      profile?.zip_code ?? zipCode,
      profile?.city ?? city
    );
    const parentPeselOrId = buildParentPeselOrId(
      billingType,
      profile?.pesel ?? pesel,
      profile?.nip ?? nip
    );
    const amountClause = buildAmountClause(paymentTypeToClauseKey(paymentType), amount);
    const teacherFullName = buildTeacherFullName(group.teacher_first_name, group.teacher_last_name);
    const childSchoolName = buildChildSchoolName(
      enrollment?.preferred_location_name,
      enrollment?.preferred_location
    );

    const placeholders: Record<string, string> = {
      contract_number: contractNumber,
      contract_date: formatContractDate(),
      contract_city: school?.city?.trim() || "Paniówki",
      school_year: schoolYearName,
      parent_full_name: parentFullName,
      parent_pesel_or_id: parentPeselOrId,
      parent_address: parentAddress,
      parent_phone: user.phone?.trim() ?? "",
      parent_email: user.email?.trim() ?? "",
      child_1_full_name: childFullName,
      child_1_birth_date: formatBirthDatePl(child.birth_date),
      lesson_duration: lessonDuration,
      group_schedule: groupSchedule || "Do ustalenia",
      payment_type: formatPaymentTypeLabel(paymentType),
      amount_clause: amountClause,
      signed_at_line: "",
      teacher_full_name: teacherFullName || "Do ustalenia",
      teacher_id_suffix: buildTeacherIdSuffix(),
      child_school_name: childSchoolName,
    };

    const contentHtml = generateContractHtml(template.content_html, placeholders);
    const attachment1Html = attachment1Template
      ? generateContractHtml(attachment1Template.content_html, placeholders)
      : null;
    let attachment2Html: string | null = null;
    if (includeAttachment2) {
      if (!attachment2Template) {
        return NextResponse.json(
          { message: "Brak szablonu Załącznika nr 2 — skontaktuj się ze szkołą" },
          { status: 503 }
        );
      }
      if (!teacherFullName) {
        return NextResponse.json(
          { message: "Grupa nie ma przypisanego lektora — nie można wygenerować Załącznika nr 2" },
          { status: 409 }
        );
      }
      attachment2Html = generateContractHtml(attachment2Template.content_html, placeholders);
    }

    let contractId: string;
    if (existingSent.rows[0]) {
      contractId = existingSent.rows[0].id;
      await queryDb(
        `UPDATE contracts
         SET content_html = $2,
             attachment_1_html = $3,
             attachment_2_html = $4,
             include_attachment_2 = $5,
             status = 'SENT',
             sent_at = NOW(),
             payment_type = $6,
             amount = $7,
             template_id = $8,
             group_id = $9,
             child_id = $10,
             school_year_id = $11
         WHERE id = $1`,
        [
          contractId,
          contentHtml,
          attachment1Html,
          attachment2Html,
          includeAttachment2,
          paymentType,
          amount,
          template.id,
          group.id,
          childId,
          schoolYearId,
        ]
      );
    } else {
      contractId = randomUUID();
      await queryDb(
        `INSERT INTO contracts (
           id, school_id, child_id, parent_id, group_id, template_id,
           enrollment_request_id, content_html, attachment_1_html, attachment_2_html,
           include_attachment_2, status, sent_at,
           payment_type, amount, school_year_id, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10,
           $11, 'SENT', NOW(),
           $12, $13, $14, NOW()
         )`,
        [
          contractId,
          SCHOOL_ID,
          childId,
          parentId,
          group.id,
          template.id,
          resolvedEnrollmentRequestId,
          contentHtml,
          attachment1Html,
          attachment2Html,
          includeAttachment2,
          paymentType,
          amount,
          schoolYearId,
        ]
      );
    }

    return NextResponse.json({
      contractId,
      status: "SENT",
      contract: {
        id: contractId,
        content_html: contentHtml,
        attachment_1_html: attachment1Html,
        attachment_2_html: attachment2Html,
        include_attachment_2: includeAttachment2,
        status: "SENT",
        amount,
        paymentType,
      },
    });
  } catch (error) {
    console.error("POST /api/parent/contract/generate:", error);
    return NextResponse.json({ message: "Nie udało się wygenerować umowy" }, { status: 500 });
  }
}
