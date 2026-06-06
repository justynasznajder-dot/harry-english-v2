import { randomUUID } from "crypto";
import { formatPersonName } from "@/lib/format-person-name";
import {
  applyDiscountsToAmount,
  DISCOUNT_KEYS,
  getSchoolDiscountSettings,
  isComplimentaryForParent,
  type DiscountKey,
  type SchoolDiscountSettings,
} from "@/lib/school-discounts";
import { queryDb } from "@/lib/db";
import { sumChildrenBaseAmounts } from "@/lib/enrollment-pricing";
import { getParentLargeFamilyCard } from "@/lib/parent-profile-discount";
import {
  buildAmountClause,
  buildChildSchoolName,
  buildContractNumber,
  buildGroupSchedule,
  buildParentAddress,
  buildParentPeselOrId,
  buildTeacherFullName,
  buildTeacherIdSuffix,
  formatBirthDatePl,
  formatContractDate,
  formatLessonDuration,
  formatPaymentTypeLabel,
  generateContractHtml,
  paymentTypeToClauseKey,
} from "@/lib/contract-html";

export type ParentContractChildRow = {
  child_id: string;
  request_id: string;
  access_level: string;
  first_name: string;
  last_name: string;
  birth_date: Date | string;
  group_id: string | null;
  group_name: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  preferred_location: string | null;
  preferred_location_name: string | null;
  teacher_first_name: string | null;
  teacher_last_name: string | null;
};

export type ParentContractContext = {
  parentId: string;
  schoolId: string;
  included: ParentContractChildRow[];
  excludedRequestIds: string[];
  paymentType: "MONTHLY" | "YEARLY";
  includeAttachment2: boolean;
};

const MAX_CHILD_PLACEHOLDERS = 5;

export async function fetchParentEnrollmentChildren(
  parentId: string,
  schoolId: string
): Promise<ParentContractChildRow[]> {
  const accessLevelExpr = `UPPER(BTRIM(COALESCE(c.access_level::text, 'NEW')))`;
  const res = await queryDb<ParentContractChildRow>(
    `SELECT
       c.id AS child_id,
       c.enrollment_request_id AS request_id,
       ${accessLevelExpr} AS access_level,
       c.first_name,
       c.last_name,
       c.birth_date,
       g.id::text AS group_id,
       g.name AS group_name,
       g.price_monthly::text AS price_monthly,
       g.price_yearly::text AS price_yearly,
       er.preferred_location,
       loc.name AS preferred_location_name,
       u.first_name AS teacher_first_name,
       u.last_name AS teacher_last_name
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups g ON g.id = er.proposed_group_id
     LEFT JOIN users u ON u.id = g.teacher_id
     LEFT JOIN locations loc ON loc.id::text = er.preferred_location::text
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND ${accessLevelExpr} IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED')
     ORDER BY er.created_at ASC, c.created_at ASC`,
    [parentId, schoolId]
  );
  return res.rows;
}

export function validateParentContractSelection(
  children: ParentContractChildRow[],
  includedRequestIds: string[]
): { ok: true } | { ok: false; message: string } {
  if (children.length === 0) {
    return { ok: false, message: "Brak dzieci w procesie zapisu" };
  }

  const accepted = children.filter((c) => String(c.access_level).toUpperCase() === "ACCEPTED");
  const includedSet = new Set(includedRequestIds.map((id) => String(id).trim()).filter(Boolean));
  if (includedSet.size === 0) {
    return { ok: false, message: "Wybierz co najmniej jedno dziecko do umowy" };
  }

  for (const id of includedSet) {
    const row = accepted.find((c) => c.request_id === id);
    if (!row) {
      return {
        ok: false,
        message: "Do umowy można dodać tylko dzieci ze statusem „zaakceptowano propozycję”.",
      };
    }
    if (!row.group_id) {
      return {
        ok: false,
        message: `Brak przypisanej grupy dla dziecka ${row.first_name} ${row.last_name}.`,
      };
    }
  }

  return { ok: true };
}

export function computeParentContractAmount(
  included: ParentContractChildRow[],
  paymentType: "MONTHLY" | "YEARLY",
  options: {
    billingExempt: boolean;
    discountSettings: SchoolDiscountSettings;
    discountKeys: DiscountKey[];
  }
): number | null {
  if (options.billingExempt) return 0;

  const total = sumChildrenBaseAmounts(included, paymentType);
  if (total == null || total <= 0) return null;

  return applyDiscountsToAmount(total, options.discountKeys, options.discountSettings);
}

export function buildChildPlaceholders(
  included: ParentContractChildRow[]
): Record<string, string> {
  const placeholders: Record<string, string> = {};
  for (let i = 0; i < MAX_CHILD_PLACEHOLDERS; i++) {
    const child = included[i];
    const n = i + 1;
    placeholders[`child_${n}_full_name`] = child
      ? `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim()
      : "";
    placeholders[`child_${n}_birth_date`] = child ? formatBirthDatePl(child.birth_date) : "";
  }
  return placeholders;
}

async function findContractTemplate(
  schoolId: string,
  schoolYearName: string,
  kind: "CONTRACT" | "ATTACHMENT_1" | "ATTACHMENT_2" = "CONTRACT"
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

export async function rejectExcludedEnrollmentRequests(
  parentId: string,
  schoolId: string,
  excludedRequestIds: string[]
): Promise<void> {
  if (excludedRequestIds.length === 0) return;
  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'REJECTED',
         rejected_at = NOW()
     WHERE id = ANY($1::text[])
       AND user_id = $2
       AND school_id = $3
       AND UPPER(BTRIM(COALESCE(status::text, ''))) IN ('ACCEPTED', 'PROPOSED', 'NEGOTIATING')`,
    [excludedRequestIds, parentId, schoolId]
  );
  await queryDb(
    `UPDATE children
     SET access_level = 'REJECTED', active = FALSE
     WHERE enrollment_request_id = ANY($1::text[])
       AND parent_id = $2
       AND school_id = $3`,
    [excludedRequestIds, parentId, schoolId]
  );
}

export async function generateParentContract(
  ctx: ParentContractContext,
  profile: {
    address: string;
    city: string;
    zip_code: string;
    pesel: string | null;
    company_name: string | null;
    nip: string | null;
  },
  user: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string;
  },
  billingType: "private" | "company"
): Promise<{
  contractId: string;
  contentHtml: string;
  attachment1Html: string | null;
  attachment2Html: string | null;
  amount: number;
}> {
  const { parentId, schoolId, included, excludedRequestIds, paymentType, includeAttachment2 } =
    ctx;

  await rejectExcludedEnrollmentRequests(parentId, schoolId, excludedRequestIds);

  const billingExempt = await isComplimentaryForParent(schoolId, {
    parentId,
    parentEmail: user.email,
  });
  const discountSettings = await getSchoolDiscountSettings(schoolId);
  const discountKeys: DiscountKey[] = [];
  if (!billingExempt && included.length >= 2) {
    discountKeys.push(DISCOUNT_KEYS.SIBLING);
  }
  const hasLargeFamilyCard = await getParentLargeFamilyCard(parentId);
  if (!billingExempt && hasLargeFamilyCard) {
    discountKeys.push(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
  }

  const amount =
    computeParentContractAmount(included, paymentType, {
      billingExempt,
      discountSettings,
      discountKeys,
    }) ?? 0;

  if (!billingExempt && amount <= 0) {
    throw new Error(
      "Brak stawki dla wybranych dzieci — skontaktuj się ze szkołą, aby ustalić kwotę w umowie."
    );
  }

  const schoolYearRes = await queryDb<{ id: string; name: string }>(
    `SELECT id::text, name
     FROM school_years
     WHERE school_id = $1 AND active = TRUE
     ORDER BY date_from DESC
     LIMIT 1`,
    [schoolId]
  );
  const activeSchoolYear = schoolYearRes.rows[0];
  const schoolYearName = activeSchoolYear?.name ?? "2025/2026";
  const schoolYearId = activeSchoolYear?.id ?? null;

  const template = await findContractTemplate(schoolId, schoolYearName, "CONTRACT");
  if (!template) {
    throw new Error("Brak aktywnego szablonu umowy — skontaktuj się ze szkołą");
  }

  const attachment1Template = await findContractTemplate(schoolId, schoolYearName, "ATTACHMENT_1");
  const attachment2Template = includeAttachment2
    ? await findContractTemplate(schoolId, schoolYearName, "ATTACHMENT_2")
    : null;

  const schoolRes = await queryDb<{ name: string; city: string | null }>(
    `SELECT name, city FROM schools WHERE id = $1 LIMIT 1`,
    [schoolId]
  );
  const school = schoolRes.rows[0];

  const scheduleParts: string[] = [];
  const schoolNames = new Set<string>();
  let lessonDuration = "";
  const primary = included[0];

  for (const child of included) {
    if (!child.group_id) continue;
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
    const childLabel = `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
    scheduleParts.push(
      schedule ? `${childLabel}: ${schedule}` : `${childLabel}: Do ustalenia`
    );
    if (!lessonDuration && scheduleRes.rows[0]) {
      lessonDuration = formatLessonDuration(scheduleRes.rows[0].duration_min);
    }
    schoolNames.add(
      buildChildSchoolName(child.preferred_location_name, child.preferred_location)
    );
  }

  const existingSent = await queryDb<{ id: string; content_html: string }>(
    `SELECT id::text, content_html
     FROM contracts
     WHERE parent_id = $1
       AND school_id = $2
       AND child_id IS NULL
       AND status IN ('SENT', 'DRAFT')
     ORDER BY created_at DESC
     LIMIT 1`,
    [parentId, schoolId]
  );

  const existingSigned = await queryDb<{ id: string }>(
    `SELECT id::text FROM contracts
     WHERE parent_id = $1 AND school_id = $2 AND child_id IS NULL AND status = 'SIGNED'
     LIMIT 1`,
    [parentId, schoolId]
  );
  if (existingSigned.rows[0]) {
    throw new Error("Umowa została już podpisana");
  }

  let contractNumber: string;
  const existingNumber = existingSent.rows[0]?.content_html
    ? existingSent.rows[0].content_html.match(/HE\/[\d/]+\/\d{3}/)?.[0]
    : null;
  if (existingNumber) {
    contractNumber = existingNumber;
  } else {
    const countRes = await queryDb<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM contracts
       WHERE school_id = $1 AND school_year_id IS NOT DISTINCT FROM $2::text`,
      [schoolId, schoolYearId]
    );
    contractNumber = buildContractNumber(
      schoolYearName,
      Number(countRes.rows[0]?.count ?? 0) + 1
    );
  }

  const parentFullName =
    `${formatPersonName(user.first_name ?? "")} ${formatPersonName(user.last_name ?? "")}`.trim();
  const parentAddress = buildParentAddress(profile.address, profile.zip_code, profile.city);
  const parentPeselOrId = buildParentPeselOrId(
    billingType,
    profile.pesel,
    profile.nip
  );
  const amountClause = buildAmountClause(paymentTypeToClauseKey(paymentType), amount);
  const teacherFullName = buildTeacherFullName(
    primary.teacher_first_name,
    primary.teacher_last_name
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
    lesson_duration: lessonDuration || formatLessonDuration(60),
    group_schedule: scheduleParts.join("; ") || "Do ustalenia",
    payment_type: formatPaymentTypeLabel(paymentType),
    amount_clause: amountClause,
    signed_at_line: "",
    parent_signature_line: "",
    school_signature_line: "",
    teacher_full_name: teacherFullName || "Do ustalenia",
    teacher_id_suffix: buildTeacherIdSuffix(),
    child_school_name: [...schoolNames].filter(Boolean).join(", ") || "—",
    ...buildChildPlaceholders(included),
    child_1_full_name: buildChildPlaceholders(included).child_1_full_name,
    child_1_birth_date: buildChildPlaceholders(included).child_1_birth_date,
  };

  const contentHtml = generateContractHtml(template.content_html, placeholders);
  const attachment1Html = attachment1Template
    ? generateContractHtml(attachment1Template.content_html, placeholders)
    : null;
  let attachment2Html: string | null = null;
  if (includeAttachment2) {
    if (!attachment2Template) {
      throw new Error("Brak szablonu Załącznika nr 2 — skontaktuj się ze szkołą");
    }
    if (!teacherFullName) {
      throw new Error(
        "Grupa nie ma przypisanego lektora — nie można wygenerować Załącznika nr 2"
      );
    }
    attachment2Html = generateContractHtml(attachment2Template.content_html, placeholders);
  }

  await queryDb(
    `UPDATE contracts
     SET status = 'CANCELLED'
     WHERE parent_id = $1
       AND school_id = $2
       AND status IN ('DRAFT', 'SENT')
       AND (child_id IS NOT NULL OR enrollment_request_id IS NOT NULL)`,
    [parentId, schoolId]
  );

  const primaryGroupId = primary.group_id;
  const discountSibling = discountKeys.includes(DISCOUNT_KEYS.SIBLING);
  const discountLargeFamily = discountKeys.includes(DISCOUNT_KEYS.LARGE_FAMILY_CARD);

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
           child_id = NULL,
           enrollment_request_id = NULL,
           discount_large_family = $10,
           discount_sibling = $11,
           billing_exempt = $12,
           school_year_id = $13
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
        primaryGroupId,
        discountLargeFamily,
        discountSibling,
        billingExempt,
        schoolYearId,
      ]
    );
    await queryDb(`DELETE FROM contract_children WHERE contract_id = $1`, [contractId]);
  } else {
    contractId = randomUUID();
    await queryDb(
      `INSERT INTO contracts (
         id, school_id, child_id, parent_id, group_id, template_id,
         enrollment_request_id, content_html, attachment_1_html, attachment_2_html,
         include_attachment_2, status, sent_at,
         payment_type, amount, discount_large_family, discount_sibling, billing_exempt,
         school_year_id, created_at
       ) VALUES (
         $1, $2, NULL, $3, $4, $5,
         NULL, $6, $7, $8,
         $9, 'SENT', NOW(),
         $10, $11, $12, $13, $14,
         $15, NOW()
       )`,
      [
        contractId,
        schoolId,
        parentId,
        primaryGroupId,
        template.id,
        contentHtml,
        attachment1Html,
        attachment2Html,
        includeAttachment2,
        paymentType,
        amount,
        discountLargeFamily,
        discountSibling,
        billingExempt,
        schoolYearId,
      ]
    );
  }

  for (let i = 0; i < included.length; i++) {
    const child = included[i];
    await queryDb(
      `INSERT INTO contract_children (
         contract_id, child_id, enrollment_request_id, group_id, sort_order
       ) VALUES ($1, $2, $3, $4, $5)`,
      [contractId, child.child_id, child.request_id, child.group_id, i]
    );
  }

  return {
    contractId,
    contentHtml,
    attachment1Html,
    attachment2Html,
    amount,
  };
}

export async function fetchParentContractForPortal(
  parentId: string,
  schoolId: string
): Promise<{
  id: string;
  status: string;
  content_html: string | null;
  attachment_1_html: string | null;
  attachment_2_html: string | null;
  include_attachment_2: boolean;
  payment_type: string | null;
  amount: number | null;
  signed_at: Date | string | null;
  included_children: Array<{ child_id: string; request_id: string; first_name: string; last_name: string }>;
} | null> {
  const res = await queryDb<{
    id: string;
    status: string;
    content_html: string | null;
    attachment_1_html: string | null;
    attachment_2_html: string | null;
    include_attachment_2: boolean;
    payment_type: string | null;
    amount: string | null;
    signed_at: Date | string | null;
  }>(
    `SELECT id::text, status, content_html, attachment_1_html, attachment_2_html,
            include_attachment_2, payment_type, amount::text, signed_at
     FROM contracts
     WHERE parent_id = $1 AND school_id = $2 AND child_id IS NULL
       AND status IN ('SENT', 'SIGNED')
     ORDER BY created_at DESC
     LIMIT 1`,
    [parentId, schoolId]
  );
  const row = res.rows[0];
  if (!row) return null;

  const childrenRes = await queryDb<{
    child_id: string;
    request_id: string;
    first_name: string;
    last_name: string;
  }>(
    `SELECT cc.child_id, cc.enrollment_request_id AS request_id,
            c.first_name, c.last_name
     FROM contract_children cc
     JOIN children c ON c.id = cc.child_id
     WHERE cc.contract_id = $1
     ORDER BY cc.sort_order ASC`,
    [row.id]
  );

  return {
    id: row.id,
    status: row.status,
    content_html:
      row.status === "SENT" || row.status === "SIGNED" ? row.content_html : null,
    attachment_1_html:
      row.status === "SENT" || row.status === "SIGNED" ? row.attachment_1_html : null,
    attachment_2_html:
      row.status === "SENT" || row.status === "SIGNED" ? row.attachment_2_html : null,
    include_attachment_2: row.include_attachment_2,
    payment_type: row.payment_type,
    amount: row.amount != null ? Number(row.amount) : null,
    signed_at: row.signed_at,
    included_children: childrenRes.rows,
  };
}
