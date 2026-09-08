import { queryDb } from "@/lib/db";
import {
  applyManualDiscountPercent,
  getSchoolDiscountSettings,
  resolveEffectiveDiscountPercent,
} from "@/lib/school-discounts";
import {
  enrollChildrenForEnrollmentRequest,
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";
import { getParentLargeFamilyCard } from "@/lib/parent-profile-discount";

async function parentHasSiblingDeclaredLocal(
  parentId: string,
  schoolId: string
): Promise<boolean> {
  const res = await queryDb<{ declared: boolean }>(
    `SELECT COALESCE(BOOL_OR(enrolling_multiple_children), FALSE) AS declared
     FROM enrollment_requests
     WHERE school_id = $1
       AND user_id = $2
       AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'REJECTED'`,
    [schoolId, parentId]
  );
  return res.rows[0]?.declared === true;
}

/**
 * Zamraża stawki netto na children (manager + KDR + rodzeństwo) — źródło pod faktury w trybie bez umowy.
 * Baza zawsze z enrollment_requests / cennika grupy (nie z już zamrożonych children.*),
 * żeby ponowne wyliczenie po zmianie checkboxów nie robiło podwójnego rabatu.
 */
async function freezeComplimentaryChildNetRates(params: {
  enrollmentRequestId: string;
  parentId: string;
  schoolId: string;
}): Promise<void> {
  const settings = await getSchoolDiscountSettings(params.schoolId);
  const hasLargeFamilyCard = await getParentLargeFamilyCard(params.parentId);
  const hasSiblingDeclared = await parentHasSiblingDeclaredLocal(
    params.parentId,
    params.schoolId
  );

  const children = await queryDb<{
    id: string;
    discount_percent: string | null;
    lesson_unit_price: string | null;
    monthly_unit_price: string | null;
    yearly_unit_price: string | null;
    er_lesson_unit_price: string | null;
    er_monthly_unit_price: string | null;
    er_yearly_unit_price: string | null;
    group_price_per_lesson: string | null;
    group_price_monthly: string | null;
    group_price_yearly: string | null;
  }>(
    `SELECT c.id,
            c.discount_percent::text AS discount_percent,
            c.lesson_unit_price::text AS lesson_unit_price,
            c.monthly_unit_price::text AS monthly_unit_price,
            c.yearly_unit_price::text AS yearly_unit_price,
            er.lesson_unit_price::text AS er_lesson_unit_price,
            er.monthly_unit_price::text AS er_monthly_unit_price,
            er.yearly_unit_price::text AS er_yearly_unit_price,
            g.price_per_lesson::text AS group_price_per_lesson,
            g.price_monthly::text AS group_price_monthly,
            g.price_yearly::text AS group_price_yearly
     FROM children c
     LEFT JOIN enrollment_requests er ON er.id = c.enrollment_request_id
     LEFT JOIN groups g ON g.id = er.proposed_group_id
     WHERE c.enrollment_request_id = $1
       AND c.parent_id = $2
       AND c.school_id = $3`,
    [params.enrollmentRequestId, params.parentId, params.schoolId]
  );

  for (const child of children.rows) {
    const managerRaw = child.discount_percent;
    const effective = resolveEffectiveDiscountPercent({
      mode: "complimentary",
      managerPercent: managerRaw,
      hasLargeFamilyCard,
      hasSiblingDeclared,
      settings,
    });
    const parseMoney = (raw: string | null): number | null => {
      if (raw == null || String(raw).trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    // Baza wyłącznie z ER / cennika grupy — children.* mogą być już netto po wcześniejszym freeze.
    const grossLesson =
      parseMoney(child.er_lesson_unit_price) ??
      parseMoney(child.group_price_per_lesson);
    const grossMonthly =
      parseMoney(child.er_monthly_unit_price) ??
      parseMoney(child.group_price_monthly);
    const grossYearly =
      parseMoney(child.er_yearly_unit_price) ??
      parseMoney(child.group_price_yearly);
    const lesson = applyManualDiscountPercent(
      grossLesson,
      effective.percent || null
    );
    const monthly = applyManualDiscountPercent(
      grossMonthly,
      effective.percent || null
    );
    const yearly = applyManualDiscountPercent(
      grossYearly,
      effective.percent || null
    );
    await queryDb(
      `UPDATE children
       SET lesson_unit_price = COALESCE($2, lesson_unit_price),
           monthly_unit_price = COALESCE($3, monthly_unit_price),
           yearly_unit_price = COALESCE($4, yearly_unit_price),
           discount_percent = $5
       WHERE id = $1`,
      [
        child.id,
        lesson,
        monthly,
        yearly,
        // Stawki już netto — nie zostawiamy %, żeby faktura/UI nie odjęły go drugi raz.
        // Zachowaj % managera, gdy był — do ponownego wyliczenia po zmianie KDR/rodzeństwa.
        managerRaw != null && String(managerRaw).trim() !== ""
          ? Number(managerRaw)
          : null,
      ]
    );
  }
}

/**
 * Ponownie zamraża stawki netto dla wszystkich zakończonych dzieci rodzica w trybie bez umowy
 * (np. po zmianie checkboxów KDR / rodzeństwo w Podsumowaniu).
 */
export async function reapplyComplimentaryNetRatesForParent(
  parentId: string,
  schoolId: string
): Promise<number> {
  const rows = await queryDb<{ enrollment_request_id: string }>(
    `SELECT DISTINCT c.enrollment_request_id
     FROM children c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.enrollment_request_id IS NOT NULL
       AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) IN ('COMPLETED', 'SIGNED')`,
    [parentId, schoolId]
  );
  let n = 0;
  for (const row of rows.rows) {
    if (!row.enrollment_request_id) continue;
    await freezeComplimentaryChildNetRates({
      enrollmentRequestId: row.enrollment_request_id,
      parentId,
      schoolId,
    });
    n += 1;
  }
  return n;
}

/**
 * Kończy zapis po akceptacji grupy — bez umowy i bez zgody na wizerunek (tryb bez umowy).
 * Zgody na odbiór przez lektora rodzic generuje ręcznie w kroku Podsumowanie
 * (jednorazowo, potem dokument jest w zakładce Dokumenty).
 */
export async function completeComplimentaryEnrollment(
  enrollmentRequestId: string,
  parentId: string,
  schoolId: string
): Promise<void> {
  await queryDb(
    `UPDATE enrollment_requests
     SET status = 'COMPLETED',
         accepted_at = COALESCE(accepted_at, NOW())
     WHERE id = $1
       AND school_id = $2`,
    [enrollmentRequestId, schoolId]
  );

  await syncChildrenAccessLevelForEnrollment(enrollmentRequestId, "COMPLETED");

  await queryDb(
    `UPDATE children
     SET confirmed = TRUE,
         access_level = 'COMPLETED'
     WHERE enrollment_request_id = $1
       AND parent_id = $2
       AND school_id = $3`,
    [enrollmentRequestId, parentId, schoolId]
  );

  await enrollChildrenForEnrollmentRequest(enrollmentRequestId);
  await freezeComplimentaryChildNetRates({
    enrollmentRequestId,
    parentId,
    schoolId,
  });
  await syncParentUserAccessLevel(parentId);
}

async function resolveComplimentaryParentIds(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<string[]> {
  const parentId = String(identity.parentId ?? "").trim();
  const parentEmail = String(identity.parentEmail ?? "")
    .trim()
    .toLowerCase();
  if (!parentId && !parentEmail) return [];

  const ids = new Set<string>();
  if (parentId) ids.add(parentId);

  if (parentEmail) {
    const byEmail = await queryDb<{ id: string }>(
      `SELECT id FROM users
       WHERE school_id = $1
         AND role = 'PARENT'
         AND LOWER(BTRIM(email)) = $2`,
      [schoolId, parentEmail]
    );
    for (const row of byEmail.rows) ids.add(row.id);
  }

  return [...ids];
}

/**
 * Po dodaniu rodzica do trybu bez opłat: domknij otwarte zgłoszenia z już przypisaną grupą
 * (bez etapu umowy), ale tylko gdy status ≠ NEW — czyli po wcześniejszej wysyłce maila /
 * akceptacji. Szkice NEW (nawet z grupą + stawkami) zostają — manager klika „Wyślij maila”.
 * Zgłoszenia bez grupy zostają — admin przypisze ją później.
 */
export async function completeOpenComplimentaryEnrollmentsForParent(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<number> {
  const parentId = String(identity.parentId ?? "").trim();
  const parentEmail = String(identity.parentEmail ?? "")
    .trim()
    .toLowerCase();
  if (!parentId && !parentEmail) return 0;

  const open = await queryDb<{
    er_id: string;
    parent_id: string;
  }>(
    `SELECT DISTINCT er.id AS er_id, c.parent_id
     FROM enrollment_requests er
     JOIN children c ON c.enrollment_request_id = er.id AND c.school_id = er.school_id
     JOIN users u ON u.id = c.parent_id
     WHERE er.school_id = $1
       AND er.proposed_group_id IS NOT NULL
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN (
         'COMPLETED', 'REJECTED', 'SIGNED', 'NEW'
       )
       AND (
         ($2 <> '' AND c.parent_id = $2)
         OR ($3 <> '' AND LOWER(BTRIM(u.email)) = $3)
         OR ($3 <> '' AND LOWER(BTRIM(er.parent_email)) = $3)
       )`,
    [schoolId, parentId, parentEmail]
  );

  let completed = 0;
  for (const row of open.rows) {
    await completeComplimentaryEnrollment(row.er_id, row.parent_id, schoolId);
    completed += 1;
  }
  return completed;
}

/**
 * Po włączeniu trybu bez opłat dla rodzica z już podpisaną umową:
 * - oznacz umowy jako billing_exempt (brak kolejnych faktur),
 * - anuluj otwarte płatności,
 * - anuluj otwarte okresy rozliczeń za zajęcia.
 * Grupa, zajęcia i historia umów w bazie zostają; rodzic nie pobiera starych dokumentów w portalu.
 */
export async function applyComplimentaryBillingExemptionForParent(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<{
  parentIds: string[];
  contractsExempted: number;
  paymentsCancelled: number;
  billingPeriodsCancelled: number;
}> {
  const parentIds = await resolveComplimentaryParentIds(schoolId, identity);
  if (parentIds.length === 0) {
    return {
      parentIds: [],
      contractsExempted: 0,
      paymentsCancelled: 0,
      billingPeriodsCancelled: 0,
    };
  }

  const contracts = await queryDb<{ id: string }>(
    `UPDATE contracts
     SET billing_exempt = TRUE
     WHERE school_id = $1
       AND parent_id = ANY($2::text[])
       AND COALESCE(billing_exempt, FALSE) = FALSE
       AND UPPER(BTRIM(COALESCE(status::text, ''))) <> 'CANCELLED'
     RETURNING id`,
    [schoolId, parentIds]
  );

  const payments = await queryDb<{ id: string }>(
    `UPDATE payments
     SET status = 'CANCELLED'
     WHERE school_id = $1
       AND parent_id = ANY($2::text[])
       AND UPPER(BTRIM(COALESCE(status, 'PENDING'))) IN ('PENDING', 'UNPAID', 'OVERDUE')
       AND paid_at IS NULL
     RETURNING id`,
    [schoolId, parentIds]
  );

  const billingPeriods = await queryDb<{ id: string }>(
    `UPDATE lesson_billing_periods
     SET status = 'CANCELLED'
     WHERE school_id = $1
       AND parent_id = ANY($2::text[])
       AND UPPER(BTRIM(COALESCE(status, ''))) NOT IN ('CANCELLED', 'PAID')
       AND payment_id IS NULL
     RETURNING id`,
    [schoolId, parentIds]
  );

  return {
    parentIds,
    contractsExempted: contracts.rows.length,
    paymentsCancelled: payments.rows.length,
    billingPeriodsCancelled: billingPeriods.rows.length,
  };
}

/** Domknięcie otwartych zapisów + zwolnienie z billing po dodaniu do trybu bez opłat.
 *  Nie domykamy zgłoszeń automatycznie — COMPLETED dopiero po „Wyślij maila”.
 */
export async function activateComplimentaryModeForParent(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<void> {
  await applyComplimentaryBillingExemptionForParent(schoolId, identity);
  // Karty `children` tworzy `addComplimentaryParent` przy zapisie trybu bez opłat.
}
