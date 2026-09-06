import { generateComplimentaryPickupConsentIfNeeded } from "@/lib/complimentary-pickup-consent";
import { queryDb } from "@/lib/db";
import {
  enrollChildrenForEnrollmentRequest,
  syncChildrenAccessLevelForEnrollment,
  syncParentUserAccessLevel,
} from "@/lib/enrollment-sync";

/**
 * Kończy zapis po akceptacji grupy — bez umowy i bez zgody na wizerunek (tryb bez opłat).
 * Jeśli grupa wymaga zgody na odbiór przez lektora — generuje PDF zgody (nie załącznik).
 */
export async function completeComplimentaryEnrollment(
  enrollmentRequestId: string,
  parentId: string,
  schoolId: string
): Promise<{
  pickupConsentGenerated: boolean;
  pickupConsentPreviewHtml?: string;
  pickupConsentChildName?: string;
  pickupConsentDownloadKey?: string | null;
}> {
  // Najpierw dokument (przed COMPLETED), żeby przy błędzie rodzic mógł ponowić akceptację.
  const pickup = await generateComplimentaryPickupConsentIfNeeded({
    enrollmentRequestId,
    parentId,
    schoolId,
  });

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
  await syncParentUserAccessLevel(parentId);

  return {
    pickupConsentGenerated: pickup.generated,
    pickupConsentPreviewHtml: pickup.previewHtml,
    pickupConsentChildName: pickup.childName,
    pickupConsentDownloadKey: pickup.downloadKey ?? null,
  };
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
 * (bez etapu umowy). Zgłoszenia bez grupy zostają — admin przypisze ją później.
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
       AND UPPER(BTRIM(COALESCE(er.status::text, ''))) NOT IN ('COMPLETED', 'REJECTED', 'SIGNED')
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

/** Domknięcie otwartych zapisów + zwolnienie z billing po dodaniu do trybu bez opłat. */
export async function activateComplimentaryModeForParent(
  schoolId: string,
  identity: { parentId?: string | null; parentEmail?: string | null }
): Promise<void> {
  await completeOpenComplimentaryEnrollmentsForParent(schoolId, identity);
  await applyComplimentaryBillingExemptionForParent(schoolId, identity);
}
