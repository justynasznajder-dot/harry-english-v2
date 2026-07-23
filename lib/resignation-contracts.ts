import { queryDb } from "@/lib/db";
import {
  buildContractAmountBreakdown,
  parseContractAmountBreakdown,
} from "@/lib/contract-amount-breakdown";
import { normalizePaymentType, type PaymentType } from "@/lib/lesson-pricing";
import {
  DISCOUNT_KEYS,
  getSchoolDiscountSettings,
  type DiscountKey,
} from "@/lib/school-discounts";
import { getParentLargeFamilyCard } from "@/lib/parent-profile-discount";
import { formatPersonName } from "@/lib/format-person-name";

export type ResignationContractAdjustment = {
  cancelledContractIds: string[];
  /** Umowy rodzeństwa z przeliczonym rabatem (bez generowania nowych). */
  recalculatedContractIds: string[];
  /** Legacy: pozostałe dzieci z anulowanych umów wielodzietnych — wymagają nowej umowy. */
  childrenNeedingNewContract: string[];
};

type AffectedContract = {
  id: string;
  parent_id: string;
  payment_type: string | null;
  billing_exempt: boolean;
  amount_breakdown: unknown;
  status: string;
  discount_large_family: boolean;
};

/**
 * Po rezygnacji dziecka:
 * 1) anuluje umowy SENT/SIGNED obejmujące to dziecko,
 * 2) przelicza rabat rodzeństwa na pozostałych umowach rodzica.
 */
export async function adjustContractsAfterChildResignation(params: {
  schoolId: string;
  childId: string;
  resignedAt?: Date;
}): Promise<ResignationContractAdjustment> {
  const resignedAt = params.resignedAt ?? new Date();
  const result: ResignationContractAdjustment = {
    cancelledContractIds: [],
    recalculatedContractIds: [],
    childrenNeedingNewContract: [],
  };

  const contractsRes = await queryDb<AffectedContract>(
    `SELECT DISTINCT c.id, c.parent_id, c.payment_type, c.billing_exempt,
            c.amount_breakdown, c.status, c.discount_large_family
     FROM contracts c
     LEFT JOIN contract_children cc ON cc.contract_id = c.id
     WHERE c.school_id = $1
       AND c.status IN ('SIGNED', 'SENT')
       AND (c.child_id = $2 OR cc.child_id = $2)
     ORDER BY c.created_at DESC`,
    [params.schoolId, params.childId]
  );

  if (contractsRes.rows.length === 0) {
    return result;
  }

  const parentId = contractsRes.rows[0].parent_id;
  const needingNew = new Set<string>();

  for (const contract of contractsRes.rows) {
    const childrenRes = await queryDb<{ child_id: string; active: boolean }>(
      `SELECT cc.child_id, ch.active
       FROM contract_children cc
       JOIN children ch ON ch.id = cc.child_id
       WHERE cc.contract_id = $1`,
      [contract.id]
    );

    const otherActive = childrenRes.rows.filter(
      (row) => row.child_id !== params.childId && row.active
    );
    for (const row of otherActive) {
      needingNew.add(row.child_id);
    }

    await cancelContractForResignation({
      contract,
      resignedChildId: params.childId,
      resignedAt,
    });
    result.cancelledContractIds.push(contract.id);
  }

  // Legacy multi-child: pozostałe dzieci wracają do ACCEPTED (nowe umowy 1:1 wygeneruje rodzic).
  if (needingNew.size > 0) {
    result.childrenNeedingNewContract = [...needingNew];
    await queryDb(
      `UPDATE children
       SET access_level = 'ACCEPTED',
           confirmed = FALSE
       WHERE id = ANY($1::text[])
         AND school_id = $2
         AND active = TRUE`,
      [[...needingNew], params.schoolId]
    );
    await queryDb(
      `UPDATE enrollment_requests er
       SET status = 'ACCEPTED'
       FROM children ch
       WHERE ch.enrollment_request_id = er.id
         AND ch.id = ANY($1::text[])
         AND ch.school_id = $2`,
      [[...needingNew], params.schoolId]
    );
  }

  result.recalculatedContractIds = await recalculateSiblingPricingForParent({
    schoolId: params.schoolId,
    parentId,
    excludeChildId: params.childId,
    reason: "SIBLING_RECALC",
    at: resignedAt,
  });

  return result;
}

/** Przelicza amount/sibling na umowach SENT/SIGNED rodzica (bez excludeChildId). */
export async function recalculateSiblingPricingForParent(params: {
  schoolId: string;
  parentId: string;
  excludeChildId: string;
  reason: string;
  at?: Date;
}): Promise<string[]> {
  const at = params.at ?? new Date();
  const siblingCount = await countActiveSiblingChildrenExcluding(
    params.parentId,
    params.schoolId,
    params.excludeChildId
  );
  const siblingEligible = siblingCount >= 2;
  const discountSettings = await getSchoolDiscountSettings(params.schoolId);
  const hasLargeFamily = await getParentLargeFamilyCard(params.parentId);

  const contractsRes = await queryDb<{
    id: string;
    payment_type: string | null;
    billing_exempt: boolean;
    status: string;
    discount_large_family: boolean;
    child_id: string | null;
  }>(
    `SELECT c.id, c.payment_type, c.billing_exempt, c.status,
            c.discount_large_family, c.child_id
     FROM contracts c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.status IN ('SENT', 'SIGNED')
       AND c.child_id IS DISTINCT FROM $3
       AND NOT EXISTS (
         SELECT 1 FROM contract_children cc
         WHERE cc.contract_id = c.id AND cc.child_id = $3
       )`,
    [params.parentId, params.schoolId, params.excludeChildId]
  );

  const updated: string[] = [];

  for (const contract of contractsRes.rows) {
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
      [contract.id]
    );

    if (childrenRes.rows.length === 0) continue;

    const paymentType =
      (normalizePaymentType(contract.payment_type) as PaymentType | null) ?? "MONTHLY";
    const discountKeys: DiscountKey[] = [];
    if (!contract.billing_exempt && siblingEligible) {
      discountKeys.push(DISCOUNT_KEYS.SIBLING);
    }
    if (!contract.billing_exempt && (contract.discount_large_family || hasLargeFamily)) {
      discountKeys.push(DISCOUNT_KEYS.LARGE_FAMILY_CARD);
    }

    const breakdown = buildContractAmountBreakdown({
      paymentType,
      billingExempt: contract.billing_exempt,
      discountKeys,
      discountSettings,
      children: childrenRes.rows.map((row) => ({
        child_id: row.child_id,
        name: `${formatPersonName(row.first_name)} ${formatPersonName(row.last_name)}`.trim(),
        lesson_unit_price: parseMoney(row.lesson_unit_price),
        monthly_unit_price: parseMoney(row.monthly_unit_price),
        yearly_unit_price: parseMoney(row.yearly_unit_price),
      })),
      frozenAt: contract.status === "SIGNED" ? at : null,
    });

    const amount = contract.billing_exempt ? 0 : breakdown.final_total;
    const breakdownWithReason = {
      ...breakdown,
      recalc_reason: params.reason,
      recalc_at: at.toISOString(),
    };

    await queryDb(
      `UPDATE contracts
       SET amount = $2,
           amount_breakdown = $3::jsonb,
           discount_sibling = $4,
           amount_frozen_at = CASE WHEN status = 'SIGNED' THEN $5 ELSE amount_frozen_at END
       WHERE id = $1`,
      [
        contract.id,
        amount,
        JSON.stringify(breakdownWithReason),
        discountKeys.includes(DISCOUNT_KEYS.SIBLING),
        at,
      ]
    );
    updated.push(contract.id);
  }

  return updated;
}

async function countActiveSiblingChildrenExcluding(
  parentId: string,
  schoolId: string,
  excludeChildId: string
): Promise<number> {
  const res = await queryDb<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM children c
     WHERE c.parent_id = $1
       AND c.school_id = $2
       AND c.active = TRUE
       AND c.id <> $3
       AND UPPER(BTRIM(COALESCE(c.access_level::text, ''))) IN ('ACCEPTED', 'SIGNED')`,
    [parentId, schoolId, excludeChildId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

async function cancelContractForResignation(params: {
  contract: AffectedContract;
  resignedChildId: string;
  resignedAt: Date;
}): Promise<void> {
  const existing = parseContractAmountBreakdown(params.contract.amount_breakdown);
  const breakdown = {
    ...(existing ?? {}),
    cancelled_at: params.resignedAt.toISOString(),
    cancel_reason: "CHILD_RESIGNATION",
    resigned_child_id: params.resignedChildId,
  };

  await queryDb(
    `UPDATE contracts
     SET status = 'CANCELLED',
         amount_breakdown = $2::jsonb
     WHERE id = $1`,
    [params.contract.id, JSON.stringify(breakdown)]
  );
}

function parseMoney(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
