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

/** Ręczny % zniżki z profilu dziecka (0–100). null = brak / nieprawidłowy. */
export function parseManualDiscountPercent(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const parsed = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(100, Math.max(0, parsed));
}

/** Odlicza % zniżki i zaokrągla w dół do pełnych złotówek (np. 178,80 → 178). */
export function applyManualDiscountPercent(
  amount: number | null | undefined,
  discountPercent: unknown
): number | null {
  if (amount == null || !Number.isFinite(amount)) return amount ?? null;
  const pct = parseManualDiscountPercent(discountPercent);
  if (pct == null) return amount;
  const after = amount * (1 - pct / 100);
  if (!Number.isFinite(after) || after <= 0) return 0;
  return Math.floor(after);
}

/** Domyślne % gdy szkoła nie ma ustawionych wartości (UI zniżek bywa wyłączone). */
export const DEFAULT_LARGE_FAMILY_DISCOUNT_PERCENT = 10;
export const DEFAULT_SIBLING_DISCOUNT_PERCENT = 5;

export type EffectiveDiscountMode = "contract" | "complimentary";

export type EffectiveDiscountInput = {
  /** Umowa: max z przysługujących. Bez umowy: manager + KDR + rodzeństwo (sumują się). */
  mode: EffectiveDiscountMode;
  /** Rabat wpisany przez managera (children.discount_percent). */
  managerPercent?: unknown;
  hasLargeFamilyCard: boolean;
  /** Checkbox rodzica „zapisuję więcej niż jedno dziecko”. */
  hasSiblingDeclared: boolean;
  settings: Pick<DiscountPercents, "LARGE_FAMILY_CARD" | "SIBLING">;
};

export type EffectiveDiscountResult = {
  /** Łączny % do odjęcia od kwoty (0–100). */
  percent: number;
  managerPercent: number;
  /**
   * Umowa: max(KDR, rodzeństwo).
   * Bez umowy: KDR + rodzeństwo (sumują się).
   */
  familyOrSiblingPercent: number;
  /**
   * Umowa / pojedynczy rabat rodzinny: który wygrał.
   * Bez umowy przy obu zaznaczonych: null (oba weszły w sumę).
   */
  familyOrSiblingKey: DiscountKey | null;
  /**
   * contract: który pojedynczy rabat wygrał.
   * complimentary: „stack” gdy więcej niż jedno źródło, inaczej źródło jedynego.
   */
  source: "none" | "manager" | DiscountKey | "stack";
};

function clampDiscountPercent0to100(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, value);
}

function resolveKdrPercent(
  hasLargeFamilyCard: boolean,
  settings: Pick<DiscountPercents, "LARGE_FAMILY_CARD">
): number {
  if (!hasLargeFamilyCard) return 0;
  const fromSettings = Number(settings.LARGE_FAMILY_CARD) || 0;
  return clampDiscountPercent0to100(
    fromSettings > 0 ? fromSettings : DEFAULT_LARGE_FAMILY_DISCOUNT_PERCENT
  );
}

function resolveSiblingPercent(
  hasSiblingDeclared: boolean,
  settings: Pick<DiscountPercents, "SIBLING">
): number {
  if (!hasSiblingDeclared) return 0;
  const fromSettings = Number(settings.SIBLING) || 0;
  return clampDiscountPercent0to100(
    fromSettings > 0 ? fromSettings : DEFAULT_SIBLING_DISCOUNT_PERCENT
  );
}

/**
 * Wylicza efektywny % rabatu.
 *
 * - Rodzic z umową: KDR (10%) albo rodzeństwo (5%) — nie sumują się; rabat managera pomijany.
 * - Tryb bez umowy: manager + KDR + rodzeństwo (wszystkie zaznaczone się sumują).
 */
export function resolveEffectiveDiscountPercent(
  input: EffectiveDiscountInput
): EffectiveDiscountResult {
  const managerPercent = parseManualDiscountPercent(input.managerPercent) ?? 0;
  const kdrPercent = resolveKdrPercent(input.hasLargeFamilyCard, input.settings);
  const siblingPercent = resolveSiblingPercent(input.hasSiblingDeclared, input.settings);

  if (input.mode === "complimentary") {
    const familyOrSiblingPercent = clampDiscountPercent0to100(
      kdrPercent + siblingPercent
    );
    const familyOrSiblingKey: DiscountKey | null =
      kdrPercent > 0 && siblingPercent > 0
        ? null
        : kdrPercent > 0
          ? DISCOUNT_KEYS.LARGE_FAMILY_CARD
          : siblingPercent > 0
            ? DISCOUNT_KEYS.SIBLING
            : null;
    const percent = clampDiscountPercent0to100(
      managerPercent + familyOrSiblingPercent
    );
    const contributingParts =
      Number(managerPercent > 0) +
      Number(kdrPercent > 0) +
      Number(siblingPercent > 0);
    let source: EffectiveDiscountResult["source"] = "none";
    if (percent <= 0) source = "none";
    else if (contributingParts > 1) source = "stack";
    else if (managerPercent > 0) source = "manager";
    else if (familyOrSiblingKey) source = familyOrSiblingKey;
    return {
      percent,
      managerPercent,
      familyOrSiblingPercent,
      familyOrSiblingKey,
      source,
    };
  }

  // Umowa: KDR i rodzeństwo nie sumują się — bierzemy wyższy.
  // Rabat managera na razie nie wchodzi do umowy (tylko KDR / rodzeństwo).
  void managerPercent;
  const familyOrSiblingPercent = Math.max(kdrPercent, siblingPercent);
  const familyOrSiblingKey: DiscountKey | null =
    familyOrSiblingPercent <= 0
      ? null
      : kdrPercent >= siblingPercent
        ? DISCOUNT_KEYS.LARGE_FAMILY_CARD
        : DISCOUNT_KEYS.SIBLING;

  if (familyOrSiblingPercent <= 0) {
    return {
      percent: 0,
      managerPercent: 0,
      familyOrSiblingPercent: 0,
      familyOrSiblingKey: null,
      source: "none",
    };
  }
  return {
    percent: clampDiscountPercent0to100(familyOrSiblingPercent),
    managerPercent: 0,
    familyOrSiblingPercent,
    familyOrSiblingKey,
    source: familyOrSiblingKey ?? "none",
  };
}

/** Krótki opis źródła rabatu do UI rodzica. */
export function formatEffectiveDiscountInfo(
  result: EffectiveDiscountResult
): string | null {
  if (result.percent <= 0 || result.source === "none") return null;
  if (result.source === "manager") {
    return `${result.percent}% rabatu przyznanego przez szkołę`;
  }
  if (result.source === DISCOUNT_KEYS.LARGE_FAMILY_CARD) {
    return `${result.percent}% rabatu z powodu karty dużej rodziny`;
  }
  if (result.source === DISCOUNT_KEYS.SIBLING) {
    return `${result.percent}% rabatu z powodu rodzeństwa`;
  }
  if (result.source === "stack") {
    return `${result.percent}% rabatu (zniżki się sumują)`;
  }
  return `${result.percent}% rabatu`;
}
