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
  buildPerLessonClause,
  buildTeacherFullName,
  buildTeacherIdSuffix,
  formatBirthDatePl,
  formatContractDate,
  formatSchoolYearFromDate,
  formatLessonDuration,
  formatPaymentTypeLabel,
  generateContractHtml,
  paymentTypeToClauseKey,
} from "@/lib/contract-html";
import { resolveLessonUnitPrice, resolveMonthlyUnitPrice, resolveYearlyUnitPrice, type PaymentType } from "@/lib/lesson-pricing";

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
  price_per_lesson: string | null;
  lesson_unit_price: string | null;
  monthly_unit_price: string | null;
  yearly_unit_price: string | null;
  preferred_location: string | null;
  preferred_location_name: string | null;
  teacher_first_name: string | null;
  teacher_last_name: string | null;
  teacher_pickup_consent: boolean;
};

/** Załącznik nr 2 jest wymagany, gdy co najmniej jedna grupa dziecka ma włączoną zgodę na odbiór przez lektora. */
export function resolveIncludeAttachment2FromGroups(
  included: Pick<ParentContractChildRow, "teacher_pickup_consent">[]
): boolean {
  return included.some((child) => child.teacher_pickup_consent === true);
}

export type ParentContractContext = {
  parentId: string;
  schoolId: string;
  included: ParentContractChildRow[];
  excludedRequestIds: string[];
  paymentType: PaymentType;
  includeAttachment2: boolean;
  /** Umowa odnowienia — rok docelowy zamiast aktywnego. */
  schoolYearOverride?: { id: string; name: string };
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
       u.last_name AS teacher_last_name
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups g ON g.id = er.proposed_group_id
     LEFT JOIN users u ON u.id = g.teacher_id
     LEFT JOIN locations loc ON loc.id = er.preferred_location
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
  paymentType: PaymentType,
  options: {
    billingExempt: boolean;
    discountSettings: SchoolDiscountSettings;
    discountKeys: DiscountKey[];
  }
): number | null {
  if (options.billingExempt) return 0;
  if (paymentType === "PER_LESSON") return null;

  const total = sumChildrenBaseAmounts(included, paymentType);
  if (total == null || total <= 0) return null;

  return applyDiscountsToAmount(total, options.discountKeys, options.discountSettings);
}

export function resolveChildLessonUnitPriceForContract(
  child: ParentContractChildRow
): number | null {
  return resolveLessonUnitPrice({
    groupPricePerLesson: child.price_per_lesson,
    enrollmentOverride: child.lesson_unit_price,
  });
}

export function resolveChildMonthlyUnitPriceForContract(
  child: ParentContractChildRow
): number | null {
  return resolveMonthlyUnitPrice({
    groupPriceMonthly: child.price_monthly,
    enrollmentOverride: child.monthly_unit_price,
  });
}

export function resolveChildYearlyUnitPriceForContract(
  child: ParentContractChildRow
): number | null {
  return resolveYearlyUnitPrice({
    groupPriceYearly: child.price_yearly,
    enrollmentOverride: child.yearly_unit_price,
  });
}

export function validatePerLessonContractRates(
  included: ParentContractChildRow[],
  billingExempt: boolean
): { ok: true } | { ok: false; message: string } {
  if (billingExempt) return { ok: true };
  for (const child of included) {
    const price = resolveChildLessonUnitPriceForContract(child);
    if (price == null || price <= 0) {
      return {
        ok: false,
        message: `Brak stawki za pojedyncze zajęcia dla ${child.first_name} ${child.last_name} — skontaktuj się ze szkołą.`,
      };
    }
  }
  return { ok: true };
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

/** Placeholdery załącznika dla jednego dziecka (szablony używają child_1_*). */
export function buildSingleChildAttachmentPlaceholders(
  base: Record<string, string>,
  child: ParentContractChildRow
): Record<string, string> {
  const childFullName =
    `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
  return {
    ...base,
    child_1_full_name: childFullName,
    child_1_birth_date: formatBirthDatePl(child.birth_date),
    teacher_full_name:
      buildTeacherFullName(child.teacher_first_name, child.teacher_last_name) || "Do ustalenia",
    child_school_name: buildChildSchoolName(
      child.preferred_location_name,
      child.preferred_location
    ),
  };
}

async function findContractTemplate(
  schoolId: string,
  schoolYearName: string,
  kind: "CONTRACT" | "ATTACHMENT_1" | "ATTACHMENT_2" = "CONTRACT"
): Promise<{ id: string; content_html: string } | null> {
  const exact = await queryDb<{ id: string; content_html: string }>(
    `SELECT id, content_html
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
        `SELECT id, content_html
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
      `SELECT id, content_html
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
  childAttachments: Array<{
    child_id: string;
    first_name: string;
    last_name: string;
    attachment_1_html: string | null;
    attachment_2_html: string | null;
  }>;
  amount: number | null;
}> {
  const { parentId, schoolId, included, excludedRequestIds, paymentType, includeAttachment2, schoolYearOverride } =
    ctx;

  if (excludedRequestIds.length > 0) {
    await rejectExcludedEnrollmentRequests(parentId, schoolId, excludedRequestIds);
  }

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
    });

  if (paymentType === "PER_LESSON") {
    const perLessonValidation = validatePerLessonContractRates(included, billingExempt);
    if (!perLessonValidation.ok) {
      throw new Error(perLessonValidation.message);
    }
  } else if (!billingExempt && (amount == null || amount <= 0)) {
    throw new Error(
      "Brak stawki dla wybranych dzieci — skontaktuj się ze szkołą, aby ustalić kwotę w umowie."
    );
  }

  const schoolYearRes = schoolYearOverride
    ? { rows: [{ id: schoolYearOverride.id, name: schoolYearOverride.name }] }
    : await queryDb<{ id: string; name: string }>(
        `SELECT id, name
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
    `SELECT id, content_html
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
    `SELECT id FROM contracts
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
       WHERE school_id = $1 AND school_year_id IS NOT DISTINCT FROM $2`,
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
  const amountClause =
    paymentType === "PER_LESSON"
      ? buildPerLessonClause(
          included.map((child) => ({
            name: `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim(),
            unitPrice: resolveChildLessonUnitPriceForContract(child) ?? 0,
          }))
        )
      : buildAmountClause(paymentTypeToClauseKey(paymentType), amount);
  const teacherFullName = buildTeacherFullName(
    primary.teacher_first_name,
    primary.teacher_last_name
  );

  const contractDate = new Date();
  const contractSchoolYear = formatSchoolYearFromDate(contractDate);

  const placeholders: Record<string, string> = {
    contract_number: contractNumber,
    contract_date: formatContractDate(contractDate),
    contract_city: school?.city?.trim() || "Paniówki",
    school_year: contractSchoolYear,
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

  const perChildAttachments: Array<{
    childId: string;
    attachment1Html: string | null;
    attachment2Html: string | null;
  }> = [];

  for (const child of included) {
    const childPlaceholders = buildSingleChildAttachmentPlaceholders(placeholders, child);
    const childAttachment1 = attachment1Template
      ? generateContractHtml(attachment1Template.content_html, childPlaceholders)
      : null;

    let childAttachment2: string | null = null;
    if (includeAttachment2) {
      if (!attachment2Template) {
        throw new Error("Brak szablonu Załącznika nr 2 — skontaktuj się ze szkołą");
      }
      const childTeacher = buildTeacherFullName(
        child.teacher_first_name,
        child.teacher_last_name
      );
      if (!childTeacher) {
        throw new Error(
          `Grupa dziecka ${child.first_name} ${child.last_name} nie ma przypisanego lektora — nie można wygenerować Załącznika nr 2`
        );
      }
      childAttachment2 = generateContractHtml(
        attachment2Template.content_html,
        childPlaceholders
      );
    }

    perChildAttachments.push({
      childId: child.child_id,
      attachment1Html: childAttachment1,
      attachment2Html: childAttachment2,
    });
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
           include_attachment_2 = $3,
           status = 'SENT',
           sent_at = NOW(),
           payment_type = $4,
           amount = $5,
           template_id = $6,
           group_id = $7,
           child_id = NULL,
           enrollment_request_id = NULL,
           discount_large_family = $8,
           discount_sibling = $9,
           billing_exempt = $10,
           school_year_id = $11
       WHERE id = $1`,
      [
        contractId,
        contentHtml,
        includeAttachment2,
        paymentType,
        billingExempt ? 0 : amount,
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
         enrollment_request_id, content_html,
         include_attachment_2, status, sent_at,
         payment_type, amount, discount_large_family, discount_sibling, billing_exempt,
         school_year_id, created_at
       ) VALUES (
         $1, $2, NULL, $3, $4, $5,
         NULL, $6,
         $7, 'SENT', NOW(),
         $8, $9, $10, $11, $12,
         $13, NOW()
       )`,
      [
        contractId,
        schoolId,
        parentId,
        primaryGroupId,
        template.id,
        contentHtml,
        includeAttachment2,
        paymentType,
        billingExempt ? 0 : amount,
        discountLargeFamily,
        discountSibling,
        billingExempt,
        schoolYearId,
      ]
    );
  }

  for (let i = 0; i < included.length; i++) {
    const child = included[i];
    const attachments = perChildAttachments.find((a) => a.childId === child.child_id);
    await queryDb(
      `INSERT INTO contract_children (
         contract_id, child_id, enrollment_request_id, group_id, sort_order,
         attachment_1_html, attachment_2_html, lesson_unit_price,
         monthly_unit_price, yearly_unit_price
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        contractId,
        child.child_id,
        child.request_id,
        child.group_id,
        i,
        attachments?.attachment1Html ?? null,
        attachments?.attachment2Html ?? null,
        paymentType === "PER_LESSON"
          ? resolveChildLessonUnitPriceForContract(child)
          : null,
        paymentType === "MONTHLY"
          ? resolveChildMonthlyUnitPriceForContract(child)
          : null,
        paymentType === "YEARLY"
          ? resolveChildYearlyUnitPriceForContract(child)
          : null,
      ]
    );
  }

  return {
    contractId,
    contentHtml,
    childAttachments: perChildAttachments.map((a) => {
      const child = included.find((c) => c.child_id === a.childId)!;
      return {
        child_id: a.childId,
        first_name: child.first_name,
        last_name: child.last_name,
        attachment_1_html: a.attachment1Html,
        attachment_2_html: a.attachment2Html,
      };
    }),
    amount,
  };
}

export type ParentContractChildAttachment = {
  child_id: string;
  request_id: string;
  first_name: string;
  last_name: string;
  attachment_1_html: string | null;
  attachment_2_html: string | null;
};

export async function fetchParentContractForPortal(
  parentId: string,
  schoolId: string
): Promise<{
  id: string;
  status: string;
  content_html: string | null;
  include_attachment_2: boolean;
  payment_type: string | null;
  amount: number | null;
  signed_at: Date | string | null;
  included_children: Array<{ child_id: string; request_id: string; first_name: string; last_name: string }>;
  child_attachments: ParentContractChildAttachment[];
} | null> {
  const res = await queryDb<{
    id: string;
    status: string;
    content_html: string | null;
    include_attachment_2: boolean;
    payment_type: string | null;
    amount: string | null;
    signed_at: Date | string | null;
  }>(
    `SELECT id, status, content_html,
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
    attachment_1_html: string | null;
    attachment_2_html: string | null;
  }>(
    `SELECT cc.child_id, cc.enrollment_request_id AS request_id,
            c.first_name, c.last_name,
            cc.attachment_1_html, cc.attachment_2_html
     FROM contract_children cc
     JOIN children c ON c.id = cc.child_id
     WHERE cc.contract_id = $1
     ORDER BY cc.sort_order ASC`,
    [row.id]
  );

  const showDocs = row.status === "SENT" || row.status === "SIGNED";

  return {
    id: row.id,
    status: row.status,
    content_html: showDocs ? row.content_html : null,
    include_attachment_2: row.include_attachment_2,
    payment_type: row.payment_type,
    amount: row.amount != null ? Number(row.amount) : null,
    signed_at: row.signed_at,
    included_children: childrenRes.rows.map((c) => ({
      child_id: c.child_id,
      request_id: c.request_id,
      first_name: c.first_name,
      last_name: c.last_name,
    })),
    child_attachments: childrenRes.rows.map((c) => ({
      child_id: c.child_id,
      request_id: c.request_id,
      first_name: c.first_name,
      last_name: c.last_name,
      attachment_1_html: showDocs ? c.attachment_1_html : null,
      attachment_2_html: showDocs ? c.attachment_2_html : null,
    })),
  };
}
