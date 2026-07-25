import { parsePriceDecimal } from "@/lib/lesson-pricing";

export const DISCOUNT_KEYS = {
  LARGE_FAMILY_CARD: "LARGE_FAMILY_CARD",
  SIBLING: "SIBLING",
} as const;

export type DiscountKey = (typeof DISCOUNT_KEYS)[keyof typeof DISCOUNT_KEYS];

export const DISCOUNT_LABELS: Record<DiscountKey, string> = {
  LARGE_FAMILY_CARD: "Karta Dużej Rodziny",
  SIBLING: "Rodzeństwo",
};

/** Domyślny max rabat %, gdy szkoła nie ma jeszcze ustawienia. */
export const DEFAULT_MAX_DISCOUNT_PERCENT = 10;

/** Absolutny sufit dla pola ustawień szkoły (0–100). */
export const ABSOLUTE_MAX_DISCOUNT_PERCENT = 100;

/** @deprecated Używaj DEFAULT_MAX_DISCOUNT_PERCENT — zostawione dla kompatybilności testów. */
export const MAX_DISCOUNT_PERCENT = DEFAULT_MAX_DISCOUNT_PERCENT;

export type DiscountPercents = Record<DiscountKey, number> & {
  /** Limit łącznego rabatu dla szkoły; brak = DEFAULT_MAX_DISCOUNT_PERCENT. */
  maxPercent?: number;
};

export type IndividualPriceFields = {
  lesson_unit_price?: string | number | null;
  monthly_unit_price?: string | number | null;
  yearly_unit_price?: string | number | null;
};

/** Cena indywidualna = wpisany override na enrollment/dziecku (nie cennik grupy). */
export function hasIndividualPriceOverride(row: IndividualPriceFields): boolean {
  return (
    parsePriceDecimal(row.lesson_unit_price) != null ||
    parsePriceDecimal(row.monthly_unit_price) != null ||
    parsePriceDecimal(row.yearly_unit_price) != null
  );
}

export function clampMaxDiscountPercent(raw: unknown): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_MAX_DISCOUNT_PERCENT;
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_DISCOUNT_PERCENT;
  return Math.min(ABSOLUTE_MAX_DISCOUNT_PERCENT, Math.max(0, parsed));
}

export function resolveDiscountCap(settings: DiscountPercents): number {
  return clampMaxDiscountPercent(settings.maxPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT);
}

export function applyDiscountsToAmount(
  baseAmount: number,
  selectedKeys: DiscountKey[],
  settings: DiscountPercents
): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;

  const cap = resolveDiscountCap(settings);
  let totalPercent = 0;
  for (const key of selectedKeys) {
    totalPercent += settings[key] ?? 0;
  }
  totalPercent = Math.min(cap, Math.max(0, totalPercent));

  const result = baseAmount * (1 - totalPercent / 100);
  return Math.round(result * 100) / 100;
}
