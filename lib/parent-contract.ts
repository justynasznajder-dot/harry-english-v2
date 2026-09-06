import { randomUUID } from "crypto";
import { formatPersonName } from "@/lib/format-person-name";
import {
  // applyDiscountsToAmount, // wyłączone — sezon cen ręcznych
  DISCOUNT_KEYS,
  getSchoolDiscountSettings,
  hasIndividualPriceOverride,
  isComplimentaryForParent,
  type DiscountKey,
  type SchoolDiscountSettings,
} from "@/lib/school-discounts";
import { resolveContractDiscountKeys } from "@/lib/contract-pricing-preview";
import { getActiveSchoolYear, queryDb, runPgTransaction } from "@/lib/db";
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
  extractContractNumber,
  formatBirthDatePl,
  formatContractDate,
  formatSchoolYearFromDate,
  formatLessonDuration,
  formatPaymentTypeLabel,
  generateContractHtml,
  nextBaseContractIndex,
  paymentTypeToClauseKey,
} from "@/lib/contract-html";
import { ensureChildClientNumber, isAnnexContractNumber } from "@/lib/client-numbers";
import {
  buildContractAmountBreakdown,
  // parseContractAmountBreakdown, // wyłączone przy finalize — rabaty z breakdownu nie są odtwarzane
  type ContractAmountBreakdown,
} from "@/lib/contract-amount-breakdown";
import { resolveLessonUnitPrice, resolveMonthlyUnitPrice, resolveYearlyUnitPrice, type PaymentType } from "@/lib/lesson-pricing";
import {
  filterScheduleForStudentAttendance,
  lessonsPerWeekLabel,
  normalizeLessonsPerWeek,
  scaleAmountByLessonsPerWeek,
  type LessonsPerWeek,
} from "@/lib/lessons-per-week";
import { normalizePickupConsentDocumentHtml } from "@/lib/pickup-consent-notice";

function parsePaymentType(raw: string | null | undefined): PaymentType {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "YEARLY" || value === "PER_LESSON" || value === "MONTHLY") {
    return value;
  }
  return "MONTHLY";
}

function parseNullableMoney(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

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

/** Zgoda na odebranie przez lektora jest wymagana, gdy grupa ma włączoną tę opcję. */
export function resolveIncludeAttachment2FromGroups(
  included: Pick<ParentContractChildRow, "teacher_pickup_consent">[]
): boolean {
  return included.some((child) => child.teacher_pickup_consent === true);
}

export type ParentContractContext = {
  parentId: string;
  schoolId: string;
  /** Dokładnie jedno dziecko — jedna umowa = jedno dziecko. */
  included: ParentContractChildRow[];
  excludedRequestIds: string[];
  paymentType: PaymentType;
  includeAttachment2: boolean;
  /** Częstotliwość zajęć wybrana przez rodzica (1 lub 2× w tygodniu). */
  lessonsPerWeek?: LessonsPerWeek | null;
  /** Umowa odnowienia — rok docelowy zamiast aktywnego. */
  schoolYearOverride?: { id: string; name: string };
};

/** Liczba aktywnych dzieci rodzica ze statusem ACCEPTED lub SIGNED (rabat rodzeństwa). */
export async function countActiveSiblingChildren(
  parentId: string,
  schoolId: string
): Promise<number> {
  const res = await queryDb<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM children c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) IN ('ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY', 'SIGNED')`,
    [parentId, schoolId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function parentHasSiblingDiscount(
  parentId: string,
  schoolId: string
): Promise<boolean> {
  return (await countActiveSiblingChildren(parentId, schoolId)) >= 2;
}

/** Czy dziecko ma aktywną umowę SENT/SIGNED w bieżącym roku szkolnym. */
export async function childHasActiveContract(
  parentId: string,
  schoolId: string,
  childId: string
): Promise<boolean> {
  const activeYear = await getActiveSchoolYear(schoolId);
  const yearId = activeYear?.id ? String(activeYear.id) : null;
  if (!yearId) return false;

  const res = await queryDb<{ id: string }>(
    `SELECT c.id
     FROM contracts c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.school_year_id = $4
       AND c.status IN ('SENT', 'SIGNED')
       AND (
         c.child_id = $3
         OR EXISTS (
           SELECT 1 FROM contract_children cc
           WHERE cc.contract_id = c.id AND cc.child_id = $3
         )
       )
     LIMIT 1`,
    [parentId, schoolId, childId, yearId]
  );
  return Boolean(res.rows[0]);
}

/**
 * Pierwsze dziecko z kolejki bez umowy SENT/SIGNED (ignoruje istniejącą SENT).
 * Używane po podpisie / w odpowiedzi generate jako „kolejne w kolejce”.
 */
export async function findNextQueuedChildWithoutContract(
  parentId: string,
  schoolId: string,
  children: ParentContractChildRow[],
  queueRequestIds: string[],
  excludeChildId?: string | null
): Promise<ParentContractChildRow | null> {
  const queue = queueRequestIds.map((id) => String(id).trim()).filter(Boolean);
  const accepted = children.filter(
    (c) => String(c.access_level).toUpperCase() === "AWAITING_CONTRACT"
  );
  const ordered =
    queue.length > 0
      ? queue
          .map((id) => accepted.find((c) => c.request_id === id))
          .filter((c): c is ParentContractChildRow => Boolean(c))
      : accepted;

  for (const child of ordered) {
    if (excludeChildId && child.child_id === excludeChildId) continue;
    if (!(await childHasActiveContract(parentId, schoolId, child.child_id))) {
      return child;
    }
  }
  return null;
}

/**
 * Kolejne dziecko z kolejki do umowy.
 * Najpierw dziecko z istniejącą umową SENT (regeneracja) — max jedna SENT naraz.
 * Potem pierwsze AWAITING_CONTRACT z kolejki bez SENT/SIGNED.
 */
export async function findNextChildNeedingContract(
  parentId: string,
  schoolId: string,
  children: ParentContractChildRow[],
  queueRequestIds: string[]
): Promise<ParentContractChildRow | null> {
  const queue = queueRequestIds.map((id) => String(id).trim()).filter(Boolean);
  const accepted = children.filter(
    (c) => String(c.access_level).toUpperCase() === "AWAITING_CONTRACT"
  );
  const ordered =
    queue.length > 0
      ? queue
          .map((id) => accepted.find((c) => c.request_id === id))
          .filter((c): c is ParentContractChildRow => Boolean(c))
      : accepted;

  const activeYear = await getActiveSchoolYear(schoolId);
  const yearId = activeYear?.id ? String(activeYear.id) : null;
  if (!yearId) return null;

  const existingSent = await queryDb<{ child_id: string | null }>(
    `SELECT COALESCE(
       c.child_id,
       (SELECT cc.child_id FROM contract_children cc WHERE cc.contract_id = c.id ORDER BY cc.sort_order ASC LIMIT 1)
     ) AS child_id
     FROM contracts c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.school_year_id = $3
       AND c.status = 'SENT'
     ORDER BY c.created_at ASC
     LIMIT 1`,
    [parentId, schoolId, yearId]
  );
  const sentChildId = existingSent.rows[0]?.child_id ?? null;
  if (sentChildId) {
    const fromQueue = ordered.find((c) => c.child_id === sentChildId);
    if (fromQueue) return fromQueue;
    const fromAll = accepted.find((c) => c.child_id === sentChildId);
    if (fromAll) return fromAll;
    // SENT istnieje — nie generuj kolejnej, dopóki ta nie zostanie podpisana/anulowana
    return null;
  }

  for (const child of ordered) {
    if (!(await childHasActiveContract(parentId, schoolId, child.child_id))) {
      return child;
    }
  }
  return null;
}

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
       u.last_name AS teacher_last_name,
       COALESCE(g.teacher_pickup_consent, FALSE) AS teacher_pickup_consent
     FROM children c
     JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups g ON g.id = er.proposed_group_id
     LEFT JOIN users u ON u.id = g.teacher_id
     LEFT JOIN locations loc ON loc.id = er.preferred_location
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND ${accessLevelExpr} IN ('PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY', 'SIGNED')
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

  const accepted = children.filter(
    (c) => String(c.access_level).toUpperCase() === "AWAITING_CONTRACT"
  );
  const includedSet = new Set(includedRequestIds.map((id) => String(id).trim()).filter(Boolean));
  if (includedSet.size === 0) {
    return { ok: false, message: "Wybierz co najmniej jedno dziecko do umowy" };
  }

  for (const id of includedSet) {
    const row = accepted.find((c) => c.request_id === id);
    if (!row) {
      return {
        ok: false,
        message:
          "Do umowy można dodać tylko dzieci ze statusem „dane uzupełnione — oczekuje na umowę”.",
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

/** Walidacja generowania umowy dla dokładnie jednego dziecka. */
export function validateSingleChildForContract(
  child: ParentContractChildRow | null | undefined
): { ok: true; child: ParentContractChildRow } | { ok: false; message: string } {
  if (!child) {
    return {
      ok: false,
      message: "Brak kolejnego dziecka do wygenerowania umowy — wszystkie zaznaczone mają już umowę.",
    };
  }
  if (String(child.access_level).toUpperCase() !== "AWAITING_CONTRACT") {
    return {
      ok: false,
      message:
        "Umowę można wygenerować tylko dla dziecka ze statusem „dane uzupełnione — oczekuje na umowę”.",
    };
  }
  if (!child.group_id) {
    return {
      ok: false,
      message: `Brak przypisanej grupy dla dziecka ${child.first_name} ${child.last_name}.`,
    };
  }
  return { ok: true, child };
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

  // Rabaty % wyłączone — kwota = suma stawek ręcznych.
  void options.discountKeys;
  void options.discountSettings;
  return total;
  // return applyDiscountsToAmount(total, options.discountKeys, options.discountSettings);
}

export function buildChildRateSnapshots(
  included: ParentContractChildRow[],
  lessonsPerWeek?: LessonsPerWeek | number | null
): Array<{
  child_id: string;
  name: string;
  lesson_unit_price: number | null;
  monthly_unit_price: number | null;
  yearly_unit_price: number | null;
}> {
  return included.map((child) => ({
    child_id: child.child_id,
    name: `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim(),
    lesson_unit_price: resolveChildLessonUnitPriceForContract(child),
    monthly_unit_price: scaleAmountByLessonsPerWeek(
      resolveChildMonthlyUnitPriceForContract(child),
      lessonsPerWeek
    ),
    yearly_unit_price: scaleAmountByLessonsPerWeek(
      resolveChildYearlyUnitPriceForContract(child),
      lessonsPerWeek
    ),
  }));
}

export function buildParentContractAmountBreakdown(
  included: ParentContractChildRow[],
  paymentType: PaymentType,
  options: {
    billingExempt: boolean;
    discountSettings: SchoolDiscountSettings;
    discountKeys: DiscountKey[];
    frozenAt?: Date | string | null;
    lessonsPerWeek?: LessonsPerWeek | number | null;
  }
): ContractAmountBreakdown {
  return buildContractAmountBreakdown({
    paymentType,
    billingExempt: options.billingExempt,
    discountKeys: options.discountKeys,
    discountSettings: options.discountSettings,
    children: buildChildRateSnapshots(included, options.lessonsPerWeek),
    frozenAt: options.frozenAt ?? null,
  });
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

/** Lista wszystkich dzieci w umowie (HTML, wiele wierszy). */
export function buildChildrenListHtml(included: ParentContractChildRow[]): string {
  return included
    .map((child) => {
      const name =
        `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
      return `${name} / ${formatBirthDatePl(child.birth_date)}`;
    })
    .filter(Boolean)
    .join("<br>");
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
       AND UPPER(BTRIM(COALESCE(status::text, ''))) IN ('ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY', 'PROPOSED', 'NEGOTIATING')`,
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

  if (included.length !== 1) {
    throw new Error("Umowa obejmuje dokładnie jedno dziecko — wygeneruj umowy po kolei.");
  }
  const child = included[0];

  let lessonsPerWeek =
    normalizeLessonsPerWeek(ctx.lessonsPerWeek) ??
    null;
  if (!lessonsPerWeek && child.group_id) {
    const membershipFreq = await queryDb<{ lessons_per_week: number | null }>(
      `SELECT lessons_per_week
       FROM group_students
       WHERE child_id = $1 AND group_id = $2 AND left_at IS NULL
       ORDER BY enrolled_at DESC
       LIMIT 1`,
      [child.child_id, child.group_id]
    );
    lessonsPerWeek = normalizeLessonsPerWeek(membershipFreq.rows[0]?.lessons_per_week);
  }
  if (!lessonsPerWeek && child.request_id) {
    const freqRes = await queryDb<{ lessons_per_week: number | null }>(
      `SELECT lessons_per_week
       FROM enrollment_requests
       WHERE id = $1 AND school_id = $2
       LIMIT 1`,
      [child.request_id, schoolId]
    );
    lessonsPerWeek = normalizeLessonsPerWeek(freqRes.rows[0]?.lessons_per_week);
  }

  if (excludedRequestIds.length > 0) {
    await rejectExcludedEnrollmentRequests(parentId, schoolId, excludedRequestIds);
  }

  const billingExempt = await isComplimentaryForParent(schoolId, {
    parentId,
    parentEmail: user.email,
  });
  const discountSettings = await getSchoolDiscountSettings(schoolId);
  const hasLargeFamilyCard = await getParentLargeFamilyCard(parentId);
  const discountKeys = resolveContractDiscountKeys(
    await parentHasSiblingDiscount(parentId, schoolId),
    {
      billingExempt,
      discountLargeFamily: hasLargeFamilyCard,
      discountSettings,
      hasIndividualPricing: hasIndividualPriceOverride(child),
    }
  );

  const childRates = buildChildRateSnapshots([child], lessonsPerWeek);
  const amountBreakdown = buildContractAmountBreakdown({
    paymentType,
    billingExempt,
    discountKeys,
    discountSettings,
    children: childRates,
    frozenAt: null,
  });
  const amount = amountBreakdown.final_total;

  if (paymentType === "PER_LESSON") {
    const perLessonValidation = validatePerLessonContractRates([child], billingExempt);
    if (!perLessonValidation.ok) {
      throw new Error(perLessonValidation.message);
    }
  } else if (!billingExempt && (amount == null || amount <= 0)) {
    throw new Error(
      "Brak stawki dla dziecka — skontaktuj się ze szkołą, aby ustalić kwotę w umowie."
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

  let lessonDuration = "";
  let groupSchedule = "Do ustalenia";
  if (child.group_id) {
    const scheduleRes = await queryDb<{
      day_of_week: number;
      start_time: Date | string;
      duration_min: number;
      once_weekly_day: boolean;
      group_lessons_per_week: number | null;
    }>(
      `SELECT
         st.day_of_week,
         st.start_time,
         st.duration_min,
         st.once_weekly_day,
         g.lessons_per_week AS group_lessons_per_week
       FROM schedule_templates st
       JOIN groups g ON g.id = st.group_id
       WHERE st.group_id = $1
         AND st.active = TRUE
       ORDER BY st.day_of_week ASC, st.start_time ASC`,
      [child.group_id]
    );
    const filtered = filterScheduleForStudentAttendance(scheduleRes.rows, {
      groupLessonsPerWeek: scheduleRes.rows[0]?.group_lessons_per_week,
      studentLessonsPerWeek: lessonsPerWeek,
    });
    const schedule = buildGroupSchedule(filtered);
    groupSchedule = schedule || "Do ustalenia";
    if (filtered[0]) {
      lessonDuration = formatLessonDuration(filtered[0].duration_min);
    } else if (scheduleRes.rows[0]) {
      lessonDuration = formatLessonDuration(scheduleRes.rows[0].duration_min);
    }
  }
  const childSchoolName =
    buildChildSchoolName(child.preferred_location_name, child.preferred_location) || "—";

  if (!schoolYearId) {
    throw new Error("Brak aktywnego roku szkolnego — nie można wygenerować umowy");
  }

  const signedOnly = await queryDb<{ id: string }>(
    `SELECT c.id
     FROM contracts c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.school_year_id = $4
       AND c.status = 'SIGNED'
       AND (
         c.child_id = $3
         OR EXISTS (
           SELECT 1 FROM contract_children cc
           WHERE cc.contract_id = c.id AND cc.child_id = $3
         )
       )
     LIMIT 1`,
    [parentId, schoolId, child.child_id, schoolYearId]
  );
  if (signedOnly.rows[0]) {
    throw new Error(
      `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)} ma już podpisaną umowę w tym roku szkolnym`
    );
  }

  // Ponów edycję SENT/DRAFT dla tego samego dziecka (tylko bieżący rok).
  const existingSent = await queryDb<{
    id: string;
    content_html: string;
    contract_number: string | null;
  }>(
    `SELECT id, content_html, contract_number
     FROM contracts c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.school_year_id = $4
       AND c.status IN ('SENT', 'DRAFT')
       AND (
         c.child_id = $3
         OR (
           c.child_id IS NULL
           AND EXISTS (
             SELECT 1 FROM contract_children cc
             WHERE cc.contract_id = c.id AND cc.child_id = $3
           )
           AND NOT EXISTS (
             SELECT 1 FROM contract_children cc2
             WHERE cc2.contract_id = c.id AND cc2.child_id <> $3
           )
         )
       )
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [parentId, schoolId, child.child_id, schoolYearId]
  );

  const contractDate = new Date();
  const contractYear = contractDate.getFullYear();

  let contractNumber: string;
  const existingNumber =
    existingSent.rows[0]?.contract_number?.trim() ||
    (existingSent.rows[0]?.content_html
      ? extractContractNumber(existingSent.rows[0].content_html)
      : null);
  if (existingNumber) {
    contractNumber = existingNumber;
  } else {
    contractNumber = await runPgTransaction(async (client) => {
      const childClientNumber = await ensureChildClientNumber(
        client,
        child.child_id,
        schoolId,
        parentId
      );
      const yearNumbers = await client.query<{ contract_number: string | null; content_html: string }>(
        `SELECT contract_number, content_html
         FROM contracts
         WHERE school_id = $1
           AND child_id = $2
           AND EXTRACT(YEAR FROM created_at) = $3
         FOR UPDATE`,
        [schoolId, child.child_id, contractYear]
      );
      const numbers: string[] = [];
      for (const row of yearNumbers.rows) {
        const n =
          row.contract_number?.trim() ||
          extractContractNumber(row.content_html) ||
          "";
        if (!n || isAnnexContractNumber(n)) continue;
        if (n.startsWith(`${childClientNumber}/${contractYear}`)) {
          numbers.push(n);
        }
      }
      const baseIndex = nextBaseContractIndex(numbers);
      return buildContractNumber({
        childClientNumber,
        year: contractYear,
        baseIndex,
      });
    });
  }

  const parentFullName =
    `${formatPersonName(user.first_name ?? "")} ${formatPersonName(user.last_name ?? "")}`.trim();
  const parentAddress = buildParentAddress(profile.address, profile.zip_code, profile.city);
  const parentPeselOrId = buildParentPeselOrId(
    billingType,
    profile.pesel,
    profile.nip
  );
  const childFullName =
    `${formatPersonName(child.first_name)} ${formatPersonName(child.last_name)}`.trim();
  const amountClause =
    paymentType === "PER_LESSON"
      ? buildPerLessonClause([
          {
            name: childFullName,
            unitPrice: resolveChildLessonUnitPriceForContract(child) ?? 0,
          },
        ])
      : buildAmountClause(paymentTypeToClauseKey(paymentType), amount);
  const teacherFullName = buildTeacherFullName(
    child.teacher_first_name,
    child.teacher_last_name
  );

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
    group_schedule: groupSchedule,
    lessons_per_week: lessonsPerWeek ? String(lessonsPerWeek) : "",
    lessons_per_week_label: lessonsPerWeek ? lessonsPerWeekLabel(lessonsPerWeek) : "",
    payment_type: formatPaymentTypeLabel(paymentType),
    amount_clause: amountClause,
    signed_at_line: "",
    parent_signature_line: "",
    school_signature_line: "",
    teacher_full_name: teacherFullName || "Do ustalenia",
    teacher_id_suffix: buildTeacherIdSuffix(),
    child_school_name: childSchoolName,
    ...buildChildPlaceholders([child]),
    children_list: buildChildrenListHtml([child]),
  };

  const contentHtml = generateContractHtml(template.content_html, placeholders);

  const childPlaceholders = buildSingleChildAttachmentPlaceholders(placeholders, child);
  const childAttachment1 = attachment1Template
    ? generateContractHtml(attachment1Template.content_html, childPlaceholders)
    : null;

  let childAttachment2: string | null = null;
  if (includeAttachment2) {
    if (!attachment2Template) {
      throw new Error(
        "Brak szablonu zgody na odebranie dziecka przez lektora — skontaktuj się ze szkołą"
      );
    }
    if (!teacherFullName) {
      throw new Error(
        `Grupa dziecka ${child.first_name} ${child.last_name} nie ma przypisanego lektora — nie można wygenerować zgody na odebranie`
      );
    }
    childAttachment2 = normalizePickupConsentDocumentHtml(
      generateContractHtml(attachment2Template.content_html, childPlaceholders)
    );
  }

  // Anuluj tylko stare szkice powiązane z tym dzieckiem (nie ruszaj SENT innych dzieci).
  await queryDb(
    `UPDATE contracts
     SET status = 'CANCELLED'
     WHERE parent_id = $1
       AND school_id = $2
       AND status IN ('DRAFT', 'SENT')
       AND id <> COALESCE($4::text, '')
       AND (
         child_id = $3
         OR enrollment_request_id = $5
         OR (
           child_id IS NOT NULL
           AND child_id = $3
         )
       )`,
    [
      parentId,
      schoolId,
      child.child_id,
      existingSent.rows[0]?.id ?? null,
      child.request_id && child.request_id !== child.child_id ? child.request_id : null,
    ]
  );

  const primaryGroupId = child.group_id;
  const enrollmentRequestId =
    child.request_id && child.request_id !== child.child_id ? child.request_id : null;
  const discountSibling = discountKeys.includes(DISCOUNT_KEYS.SIBLING);
  const discountLargeFamily = discountKeys.includes(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
  const rates = childRates[0];

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
           amount_breakdown = $6::jsonb,
           amount_frozen_at = NULL,
           template_id = $7,
           group_id = $8,
           child_id = $9,
           enrollment_request_id = $10,
           discount_large_family = $11,
           discount_sibling = $12,
           billing_exempt = $13,
           school_year_id = $14,
           contract_number = $15
       WHERE id = $1`,
      [
        contractId,
        contentHtml,
        includeAttachment2,
        paymentType,
        billingExempt ? 0 : amount,
        JSON.stringify(amountBreakdown),
        template.id,
        primaryGroupId,
        child.child_id,
        enrollmentRequestId,
        discountLargeFamily,
        discountSibling,
        billingExempt,
        schoolYearId,
        contractNumber,
      ]
    );
    await queryDb(`DELETE FROM contract_children WHERE contract_id = $1`, [contractId]);
  } else {
    contractId = randomUUID();
    await queryDb(
      `INSERT INTO contracts (
         id, school_id, child_id, parent_id, group_id, template_id,
         enrollment_request_id, content_html, contract_number,
         include_attachment_2, status, sent_at,
         payment_type, amount, amount_breakdown, amount_frozen_at,
         discount_large_family, discount_sibling, billing_exempt,
         school_year_id, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9,
         $10, 'SENT', NOW(),
         $11, $12, $13::jsonb, NULL,
         $14, $15, $16,
         $17, NOW()
       )`,
      [
        contractId,
        schoolId,
        child.child_id,
        parentId,
        primaryGroupId,
        template.id,
        enrollmentRequestId,
        contentHtml,
        contractNumber,
        includeAttachment2,
        paymentType,
        billingExempt ? 0 : amount,
        JSON.stringify(amountBreakdown),
        discountLargeFamily,
        discountSibling,
        billingExempt,
        schoolYearId,
      ]
    );
  }

  await queryDb(
    `INSERT INTO contract_children (
       school_id, contract_id, child_id, enrollment_request_id, group_id, sort_order,
       attachment_1_html, attachment_2_html, lesson_unit_price,
       monthly_unit_price, yearly_unit_price
     ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10)`,
    [
      schoolId,
      contractId,
      child.child_id,
      enrollmentRequestId,
      child.group_id,
      childAttachment1,
      childAttachment2,
      rates.lesson_unit_price,
      rates.monthly_unit_price,
      rates.yearly_unit_price,
    ]
  );

  return {
    contractId,
    contentHtml,
    childAttachments: [
      {
        child_id: child.child_id,
        first_name: child.first_name,
        last_name: child.last_name,
        attachment_1_html: childAttachment1,
        attachment_2_html: childAttachment2,
      },
    ],
    amount,
  };
}

/**
 * Zamraża kwotę umowy przy podpisie na podstawie snapshotu w contract_children
 * i procentów rabatów z amount_breakdown (bez ponownego odczytu cennika grup).
 */
export async function finalizeContractPricingAtSign(
  contractId: string,
  frozenAt: Date = new Date()
): Promise<{ amount: number | null; breakdown: ContractAmountBreakdown }> {
  const contractRes = await queryDb<{
    school_id: string;
    payment_type: string | null;
    billing_exempt: boolean;
    discount_sibling: boolean;
    discount_large_family: boolean;
    amount_breakdown: unknown;
  }>(
    `SELECT school_id, payment_type, billing_exempt,
            discount_sibling, discount_large_family, amount_breakdown
     FROM contracts
     WHERE id = $1
     LIMIT 1`,
    [contractId]
  );
  const contract = contractRes.rows[0];
  if (!contract) {
    throw new Error("Nie znaleziono umowy do zamrożenia kwoty");
  }

  const childrenRes = await queryDb<{
    child_id: string;
    first_name: string;
    last_name: string;
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
  }>(
    `SELECT cc.child_id, ch.first_name, ch.last_name,
            cc.lesson_unit_price::text AS lesson_unit_price,
            cc.monthly_unit_price::text AS monthly_unit_price,
            cc.yearly_unit_price::text AS yearly_unit_price
     FROM contract_children cc
     JOIN children ch ON ch.id = cc.child_id
     WHERE cc.contract_id = $1
     ORDER BY cc.sort_order ASC`,
    [contractId]
  );

  const children = childrenRes.rows.map((row) => ({
    child_id: row.child_id,
    name: `${formatPersonName(row.first_name)} ${formatPersonName(row.last_name)}`.trim(),
    lesson_unit_price: parseNullableMoney(row.lesson_unit_price),
    monthly_unit_price: parseNullableMoney(row.monthly_unit_price),
    yearly_unit_price: parseNullableMoney(row.yearly_unit_price),
  }));

  const paymentType = parsePaymentType(contract.payment_type);
  // Rabaty % wyłączone — nie odtwarzamy zniżek z breakdownu / flag umowy.
  const discountKeys: DiscountKey[] = [];
  const discountSettings = await getSchoolDiscountSettings(contract.school_id);
  /*
  const existing = parseContractAmountBreakdown(contract.amount_breakdown);

  let discountKeys: DiscountKey[];
  let discountSettings: SchoolDiscountSettings;

  if (existing && existing.discounts.length > 0) {
    discountKeys = existing.discounts.map((d) => d.key);
    const schoolSettings = await getSchoolDiscountSettings(contract.school_id);
    discountSettings = {
      LARGE_FAMILY_CARD: 0,
      SIBLING: 0,
      maxPercent: schoolSettings.maxPercent,
      ...Object.fromEntries(existing.discounts.map((d) => [d.key, d.percent])),
    };
  } else {
    discountKeys = [];
    if (contract.discount_sibling) discountKeys.push(DISCOUNT_KEYS.SIBLING);
    if (contract.discount_large_family) {
      discountKeys.push(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
    }
    discountSettings = await getSchoolDiscountSettings(contract.school_id);
  }
  */
  void contract.discount_sibling;
  void contract.discount_large_family;
  void contract.amount_breakdown;

  const breakdown = buildContractAmountBreakdown({
    paymentType,
    billingExempt: contract.billing_exempt,
    discountKeys,
    discountSettings,
    children,
    frozenAt,
  });

  const amount = contract.billing_exempt ? 0 : breakdown.final_total;

  await queryDb(
    `UPDATE contracts
     SET amount = $2,
         amount_breakdown = $3::jsonb,
         amount_frozen_at = $4
     WHERE id = $1`,
    [contractId, amount, JSON.stringify(breakdown), frozenAt]
  );

  return { amount, breakdown };
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
  const activeYear = await getActiveSchoolYear(schoolId);
  const yearId = activeYear?.id ? String(activeYear.id) : null;
  if (!yearId) return null;

  // Preferuj SENT (kolejna umowa do podpisu). SIGNED tylko gdy brak SENT i brak ACCEPTED bez umowy w tym roku.
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
     FROM contracts c
     WHERE c.parent_id = $1 AND c.school_id = $2
       AND c.school_year_id = $3
       AND c.status IN ('SENT', 'SIGNED')
       AND (
         c.status = 'SENT'
         OR NOT EXISTS (
           SELECT 1
           FROM children ch
           WHERE ch.parent_id = $1
             AND ch.school_id = $2
             AND ch.active = TRUE
             AND UPPER(BTRIM(COALESCE(ch.access_level::text, ''))) IN ('ACCEPTED', 'AWAITING_CONTRACT', 'CONTRACT_READY')
             AND NOT EXISTS (
               SELECT 1
               FROM contracts ct
               LEFT JOIN contract_children cc ON cc.contract_id = ct.id
               WHERE ct.parent_id = $1
                 AND ct.school_id = $2
                 AND ct.school_year_id = $3
                 AND ct.status IN ('SENT', 'SIGNED')
                 AND (ct.child_id = ch.id OR cc.child_id = ch.id)
             )
         )
       )
     ORDER BY CASE c.status WHEN 'SENT' THEN 0 ELSE 1 END, c.created_at DESC
     LIMIT 1`,
    [parentId, schoolId, yearId]
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
