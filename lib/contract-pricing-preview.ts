import {
  applyDiscountsToAmount,
  DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  type DiscountKey,
  type DiscountPercents,
} from "@/lib/discount-math";

export type ContractPricingContext = {
  billingExempt: boolean;
  discountLargeFamily: boolean;
  discountSettings: DiscountPercents;
  /** Gdy true — ceny indywidualne; żadna zniżka procentowa nie działa. */
  hasIndividualPricing?: boolean;
};

/**
 * Reguły zniżek:
 * - tryb bez opłat → brak zniżek
 * - cena indywidualna → brak zniżek
 * - KDR → tylko KDR (wyłącza rodzeństwo), max 10%
 * - inaczej → ewentualnie rodzeństwo
 */
export function resolveContractDiscountKeys(
  siblingEligible: boolean,
  pricing: ContractPricingContext
): DiscountKey[] {
  if (pricing.billingExempt) return [];
  if (pricing.hasIndividualPricing) return [];
  if (pricing.discountLargeFamily) return [DISCOUNT_KEYS.LARGE_FAMILY_CARD];
  if (siblingEligible) return [DISCOUNT_KEYS.SIBLING];
  return [];
}

/**
 * @param siblingEligible — true gdy rodzic ma ≥2 dzieci ACCEPTED/SIGNED (nie liczba dzieci na umowie).
 * Drugi argument numeryczny jest wspierany wstecznie: `>= 2` ⇒ siblingEligible.
 */
export function computeContractPreviewAmount(
  baseTotal: number | null,
  siblingEligibleOrCount: boolean | number,
  pricing: ContractPricingContext | null | undefined
): {
  finalTotal: number | null;
  discountKeys: DiscountKey[];
  discountLabels: string[];
} {
  if (baseTotal == null) {
    return { finalTotal: null, discountKeys: [], discountLabels: [] };
  }
  if (!pricing) {
    return { finalTotal: baseTotal, discountKeys: [], discountLabels: [] };
  }
  if (pricing.billingExempt) {
    return { finalTotal: 0, discountKeys: [], discountLabels: [] };
  }

  const siblingEligible =
    typeof siblingEligibleOrCount === "number"
      ? siblingEligibleOrCount >= 2
      : siblingEligibleOrCount;

  const discountKeys = resolveContractDiscountKeys(siblingEligible, pricing);
  const finalTotal = applyDiscountsToAmount(baseTotal, discountKeys, pricing.discountSettings);
  const discountLabels = discountKeys.map(
    (key) => `${DISCOUNT_LABELS[key]} (${pricing.discountSettings[key]}%)`
  );

  return { finalTotal, discountKeys, discountLabels };
}
