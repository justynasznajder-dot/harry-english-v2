export const DISCOUNT_KEYS = {
  LARGE_FAMILY_CARD: "LARGE_FAMILY_CARD",
  SIBLING: "SIBLING",
} as const;

export type DiscountKey = (typeof DISCOUNT_KEYS)[keyof typeof DISCOUNT_KEYS];

export const DISCOUNT_LABELS: Record<DiscountKey, string> = {
  LARGE_FAMILY_CARD: "Karta Dużej Rodziny",
  SIBLING: "Rodzeństwo",
};

export type DiscountPercents = Record<DiscountKey, number>;

export function applyDiscountsToAmount(
  baseAmount: number,
  selectedKeys: DiscountKey[],
  settings: DiscountPercents
): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;

  let totalPercent = 0;
  for (const key of selectedKeys) {
    totalPercent += settings[key] ?? 0;
  }
  totalPercent = Math.min(100, Math.max(0, totalPercent));

  const result = baseAmount * (1 - totalPercent / 100);
  return Math.round(result * 100) / 100;
}
