import { formatPersonName } from "@/lib/format-person-name";
import {
  applySchoolYearToDocumentHtml,
  buildChildSchoolName,
  buildGroupSchedule,
  buildParentAddress,
  buildParentPeselOrId,
  buildTeacherFullName,
  buildTeacherIdSuffix,
  formatContractDate,
  formatLessonDuration,
  formatSchoolYearFromDate,
  generateContractHtml,
} from "@/lib/contract-html";
import { renderHtmlToPdf } from "@/lib/contract-pdf";
import { buildPickupConsentPdfFilename, normalizePickupConsentDocumentHtml } from "@/lib/pickup-consent-notice";
import { getActiveSchoolYear, queryDb } from "@/lib/db";
import { buildSingleChildAttachmentPlaceholders, type ParentContractChildRow } from "@/lib/parent-contract";
import { storeSignedContractPdfsInR2 } from "@/lib/r2-storage";

export {
  buildPickupConsentPdfFilename,
  isPickupConsentPdfFilename as isComplimentaryPickupConsentPdf,
} from "@/lib/pickup-consent-notice";

/** W trybie bez opłat dokument nie jest załącznikiem do umowy. */
function stripAttachmentContractReferenceLine(html: string): string {
  return normalizePickupConsentDocumentHtml(html);
}

async function findAttachment2Template(
  schoolId: string,
  schoolYearName: string
): Promise<{ id: string; content_html: string } | null> {
  const exact = await queryDb<{ id: string; content_html: string }>(
    `SELECT id, content_html
     FROM contract_templates
     WHERE school_id = $1
       AND active = TRUE
       AND school_year = $2
       AND COALESCE(template_kind, 'CONTRACT') = 'ATTACHMENT_2'
     ORDER BY created_at DESC
     LIMIT 1`,
    [schoolId, schoolYearName]
  );
  if (exact.rows[0]) return exact.rows[0];

  return (
    (
      await queryDb<{ id: string; content_html: string }>(
        `SELECT id, content_html
         FROM contract_templates
         WHERE school_id = $1
           AND active = TRUE
           AND COALESCE(template_kind, 'CONTRACT') = 'ATTACHMENT_2'
         ORDER BY created_at DESC
         LIMIT 1`,
        [schoolId]
      )
    ).rows[0] ?? null
  );
}

async function loadEnrollmentChildForPickupConsent(
  enrollmentRequestId: string,
  parentId: string,
  schoolId: string
): Promise<ParentContractChildRow | null> {
  const res = await queryDb<ParentContractChildRow>(
    `SELECT
       c.id AS child_id,
       c.enrollment_request_id AS request_id,
       UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW'))) AS access_level,
       c.first_name,
       c.last_name,
       c.birth_date,
       g.id AS group_id,
       g.name AS group_name,
       g.price_monthly::text AS price_monthly,
       g.price_yearly::text AS price_yearly,
       g.price_per_lesson::text AS price_per_lesson,
       er.lesson_unit_price::text AS lesson_unit_price,
       er.monthly_unit_price::text AS monthly_unit_price,
       er.yearly_unit_price::text AS yearly_unit_price,
       er.preferred_location,
       loc.name AS preferred_location_name,
       u.first_name AS teacher_first_name,
       u.last_name AS teacher_last_name,
       COALESCE(g.teacher_pickup_consent, FALSE) AS teacher_pickup_consent
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups g ON g.id = er.proposed_group_id
     LEFT JOIN users u ON u.id = g.teacher_id
     LEFT JOIN locations loc ON loc.id = er.preferred_location
     WHERE c.enrollment_request_id = $1
       AND c.parent_id = $2
       AND c.school_id = $3
       AND c.active = TRUE
     ORDER BY c.created_at ASC
     LIMIT 1`,
    [enrollmentRequestId, parentId, schoolId]
  );
  return res.rows[0] ?? null;
}

/**
 * W trybie bez opłat: bez umowy i bez zgody na wizerunek.
 * Jeśli grupa ma teacher_pickup_consent — generuje PDF Załącznika 2 do wydruku
 * (bez podpisu elektronicznego — rodzic podpisuje ręcznie na pierwszych zajęciach).
 */
export async function generateComplimentaryPickupConsentIfNeeded(params: {
  enrollmentRequestId: string;
  parentId: string;
  schoolId: string;
}): Promise<{ generated: boolean; previewHtml?: string; childName?: string; downloadKey?: string | null }> {
  const { enrollmentRequestId, parentId, schoolId } = params;

  const child = await loadEnrollmentChildForPickupConsent(
    enrollmentRequestId,
    parentId,
    schoolId
  );
  if (!child || !child.teacher_pickup_consent) {
    return { generated: false };
  }

  if (!child.group_id) {
    throw new Error("Brak przypisanej grupy — nie można wygenerować zgody na odbiór przez lektora");
  }

  const teacherFullName = buildTeacherFullName(
    child.teacher_first_name,
    child.teacher_last_name
  );
  if (!teacherFullName) {
    throw new Error(
      `Grupa dziecka ${child.first_name} ${child.last_name} nie ma przypisanego lektora — nie można wygenerować zgody na odbiór`
    );
  }

  const activeYear = await getActiveSchoolYear(schoolId);
  const schoolYearName = activeYear?.name ?? "2025/2026";
  const template = await findAttachment2Template(schoolId, schoolYearName);
  if (!template) {
    throw new Error("Brak szablonu zgody na odbiór dziecka przez lektora — skontaktuj się ze szkołą");
  }

  const userRes = await queryDb<{
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string;
  }>(
    `SELECT first_name, last_name, phone, email
     FROM users
     WHERE id = $1 AND school_id = $2 AND role = 'PARENT'
     LIMIT 1`,
    [parentId, schoolId]
  );
  const user = userRes.rows[0];
  if (!user) {
    throw new Error("Nie znaleziono rodzica");
  }

  const profileRes = await queryDb<{
    address: string | null;
    city: string | null;
    zip_code: string | null;
    pesel: string | null;
    nip: string | null;
    company_name: string | null;
  }>(
    `SELECT address, city, zip_code, pesel, nip, company_name
     FROM parent_profiles
     WHERE user_id = $1 AND school_id = $2
     LIMIT 1`,
    [parentId, schoolId]
  );
  const profile = profileRes.rows[0];

  const schoolRes = await queryDb<{ name: string; city: string | null }>(
    `SELECT name, city FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId]
  );
  const school = schoolRes.rows[0];

  let lessonDuration = "";
  let groupSchedule = "Do ustalenia";
  const scheduleRes = await queryDb<{
    day_of_week: number;
    start_time: Date | string;
    duration_min: number;
  }>(
    `SELECT day_of_week, start_time, duration_min
     FROM schedule_templates
     WHERE group_id = $1
     ORDER BY day_of_week ASC, start_time ASC`,
    [child.group_id]
  );
  const schedule = buildGroupSchedule(scheduleRes.rows);
  groupSchedule = schedule || "Do ustalenia";
  if (scheduleRes.rows[0]) {
    lessonDuration = formatLessonDuration(scheduleRes.rows[0].duration_min);
  }

  const signedAt = new Date();
  const parentFullName =
    `${formatPersonName(user.first_name)} ${formatPersonName(user.last_name)}`.trim();
  const parentAddress = buildParentAddress(
    profile?.address ?? "",
    profile?.zip_code ?? "",
    profile?.city ?? ""
  );
  const parentPeselOrId = buildParentPeselOrId(
    profile?.company_name || profile?.nip ? "company" : "private",
    profile?.pesel ?? null,
    profile?.nip ?? null
  );
  const childSchoolName =
    buildChildSchoolName(child.preferred_location_name, child.preferred_location) || "—";

  const basePlaceholders: Record<string, string> = {
    contract_number: `BEZ-OPLAT-${child.child_id.slice(0, 8)}`,
    contract_date: formatContractDate(signedAt),
    contract_city: school?.city?.trim() || "Paniówki",
    school_year: formatSchoolYearFromDate(signedAt),
    parent_full_name: parentFullName,
    parent_pesel_or_id: parentPeselOrId,
    parent_address: parentAddress,
    parent_phone: user.phone?.trim() ?? "",
    parent_email: user.email?.trim() ?? "",
    lesson_duration: lessonDuration || formatLessonDuration(60),
    group_schedule: groupSchedule,
    payment_type: "Tryb bez opłat",
    amount_clause: "",
    signed_at_line: "",
    parent_signature_line: "",
    school_signature_line: "",
    teacher_full_name: teacherFullName,
    teacher_id_suffix: buildTeacherIdSuffix(),
    child_school_name: childSchoolName,
  };

  const childPlaceholders = buildSingleChildAttachmentPlaceholders(basePlaceholders, child);
  const unsignedHtml = stripAttachmentContractReferenceLine(
    applySchoolYearToDocumentHtml(
      generateContractHtml(template.content_html, childPlaceholders),
      signedAt,
    ),
  );

  const childName =
    `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
  const pdfContent = await renderHtmlToPdf(unsignedHtml);
  const filename = buildPickupConsentPdfFilename(childName);

  const uploadedKeys = await storeSignedContractPdfsInR2({
    parentUserId: parentId,
    schoolId,
    signedAt,
    pdfFiles: [{ filename, content: pdfContent }],
    parentFirstName: user.first_name,
    parentLastName: user.last_name,
    source: "enrollment.complimentaryPickupConsent",
  });

  return {
    generated: true,
    previewHtml: unsignedHtml,
    childName,
    downloadKey: uploadedKeys[0] ?? null,
  };
}
