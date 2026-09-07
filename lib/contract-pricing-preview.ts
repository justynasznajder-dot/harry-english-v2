import {
  applyDiscountsToAmount,
  DISCOUNT_KEYS,
  DISCOUNT_LABELS,
  DEFAULT_LARGE_FAMILY_DISCOUNT_PERCENT,
  DEFAULT_SIBLING_DISCOUNT_PERCENT,
  type DiscountKey,
  type DiscountPercents,
} from "@/lib/discount-math";

export type ContractPricingContext = {
  billingExempt: boolean;
  discountLargeFamily: boolean;
  discountSettings: DiscountPercents;
  /** Historyczne — ignorowane; stawki ręczne też dostają KDR/rodzeństwo. */
  hasIndividualPricing?: boolean;
};

/**
 * Reguły zniżek na umowie:
 * - tryb bez opłat → brak zniżek
 * - KDR → tylko KDR (wyłącza rodzeństwo), hard 10% gdy brak ustawienia szkoły
 * - inaczej → ewentualnie rodzeństwo (hard 5%)
 * - rabat managera nie wchodzi
 */
export function resolveContractDiscountKeys(
  siblingEligible: boolean,
  pricing: ContractPricingContext
): DiscountKey[] {
  if (pricing.billingExempt) return [];
  if (pricing.discountLargeFamily) return [DISCOUNT_KEYS.LARGE_FAMILY_CARD];
  if (siblingEligible) return [DISCOUNT_KEYS.SIBLING];
  return [];
}

/** Ustawienia z hard defaultami 10% / 5% gdy szkoła ma 0. */
export function resolveContractDiscountSettings(
  settings: DiscountPercents | null | undefined
): DiscountPercents {
  const kdr = Number(settings?.LARGE_FAMILY_CARD) || 0;
  const sibling = Number(settings?.SIBLING) || 0;
  return {
    LARGE_FAMILY_CARD: kdr > 0 ? kdr : DEFAULT_LARGE_FAMILY_DISCOUNT_PERCENT,
    SIBLING: sibling > 0 ? sibling : DEFAULT_SIBLING_DISCOUNT_PERCENT,
    maxPercent: settings?.maxPercent,
  };
}

/**
 * @param siblingEligible — true gdy rodzic zaznaczył „więcej niż jedno dziecko”
 *   albo ma ≥2 dzieci ACCEPTED/SIGNED (zależnie od wywołania).
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

  const discountSettings = resolveContractDiscountSettings(pricing.discountSettings);
  const discountKeys = resolveContractDiscountKeys(siblingEligible, {
    ...pricing,
    discountSettings,
  });
  const finalTotal = applyDiscountsToAmount(baseTotal, discountKeys, discountSettings);
  const discountLabels = discountKeys.map(
    (key) => `${DISCOUNT_LABELS[key]} (${discountSettings[key]}%)`
  );

  return { finalTotal, discountKeys, discountLabels };
}
