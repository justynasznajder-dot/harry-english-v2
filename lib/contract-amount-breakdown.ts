import {
  // applyDiscountsToAmount, // wyłączone — sezon cen ręcznych
  // DISCOUNT_LABELS,
  type DiscountKey,
  type SchoolDiscountSettings,
} from "@/lib/school-discounts";
import type { PaymentType } from "@/lib/lesson-pricing";

export type ContractAmountChildBreakdown = {
  child_id: string;
  name: string;
  lesson_unit_price: number | null;
  monthly_unit_price: number | null;
  yearly_unit_price: number | null;
  /** Kwota bazowa dla wybranego payment_type (MONTHLY/YEARLY); null przy PER_LESSON. */
  base_amount: number | null;
};

export type ContractAmountDiscountBreakdown = {
  key: DiscountKey;
  label: string;
  percent: number;
};

export type ContractAmountBreakdown = {
  payment_type: PaymentType;
  billing_exempt: boolean;
  base_total: number | null;
  final_total: number | null;
  discounts: ContractAmountDiscountBreakdown[];
  children: ContractAmountChildBreakdown[];
  /** ISO timestamp — ustawiane przy podpisie (zamrożenie snapshotu). */
  frozen_at: string | null;
};

export type ContractChildRateSnapshot = {
  child_id: string;
  name: string;
  lesson_unit_price: number | null;
  monthly_unit_price: number | null;
  yearly_unit_price: number | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function baseAmountForPaymentType(
  child: ContractChildRateSnapshot,
  paymentType: PaymentType
): number | null {
  if (paymentType === "MONTHLY") return child.monthly_unit_price;
  if (paymentType === "YEARLY") return child.yearly_unit_price;
  return null;
}

export function buildContractAmountBreakdown(input: {
  paymentType: PaymentType;
  billingExempt: boolean;
  discountKeys: DiscountKey[];
  discountSettings: SchoolDiscountSettings;
  children: ContractChildRateSnapshot[];
  frozenAt?: Date | string | null;
}): ContractAmountBreakdown {
  // Rabaty % wyłączone — nie zapisujemy pozycji zniżek. Przywrócić mapowanie discountKeys.
  void input.discountKeys;
  void input.discountSettings;
  const discounts: ContractAmountDiscountBreakdown[] = [];
  // const discounts: ContractAmountDiscountBreakdown[] = input.discountKeys.map((key) => ({
  //   key,
  //   label: DISCOUNT_LABELS[key],
  //   percent: input.discountSettings[key] ?? 0,
  // }));

  const children: ContractAmountChildBreakdown[] = input.children.map((child) => ({
    child_id: child.child_id,
    name: child.name,
    lesson_unit_price: child.lesson_unit_price,
    monthly_unit_price: child.monthly_unit_price,
    yearly_unit_price: child.yearly_unit_price,
    base_amount: baseAmountForPaymentType(child, input.paymentType),
  }));

  if (input.billingExempt) {
    return {
      payment_type: input.paymentType,
      billing_exempt: true,
      base_total: 0,
      final_total: 0,
      discounts,
      children,
      frozen_at: input.frozenAt ? new Date(input.frozenAt).toISOString() : null,
    };
  }

  if (input.paymentType === "PER_LESSON") {
    return {
      payment_type: input.paymentType,
      billing_exempt: false,
      base_total: null,
      final_total: null,
      discounts,
      children,
      frozen_at: input.frozenAt ? new Date(input.frozenAt).toISOString() : null,
    };
  }

  let baseTotal = 0;
  let hasAny = false;
  for (const child of children) {
    if (child.base_amount == null) continue;
    baseTotal += child.base_amount;
    hasAny = true;
  }

  const base_total = hasAny ? roundMoney(baseTotal) : null;
  // Rabaty % wyłączone (sezon cen ręcznych) — final = base. Przywrócić applyDiscountsToAmount.
  const final_total = base_total;
  // const final_total =
  //   base_total == null
  //     ? null
  //     : applyDiscountsToAmount(base_total, input.discountKeys, input.discountSettings);

  return {
    payment_type: input.paymentType,
    billing_exempt: false,
    base_total,
    final_total,
    discounts,
    children,
    frozen_at: input.frozenAt ? new Date(input.frozenAt).toISOString() : null,
  };
}

export function parseContractAmountBreakdown(raw: unknown): ContractAmountBreakdown | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ContractAmountBreakdown;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as ContractAmountBreakdown;
  return null;
}

/** Przelicza final_total z zapisanego breakdownu (bez cennika grup). */
export function recomputeFinalTotalFromBreakdown(
  breakdown: ContractAmountBreakdown
): number | null {
  if (breakdown.billing_exempt) return 0;
  if (breakdown.payment_type === "PER_LESSON") return null;

  let baseTotal = 0;
  let hasAny = false;
  for (const child of breakdown.children) {
    const amount =
      breakdown.payment_type === "YEARLY"
        ? child.yearly_unit_price
        : child.monthly_unit_price;
    if (amount == null) continue;
    baseTotal += amount;
    hasAny = true;
  }
  if (!hasAny) return null;

  // Rabaty % wyłączone — final = suma stawek. Przywrócić applyDiscountsToAmount.
  return roundMoney(baseTotal);
  // const settings = {
  //   ...Object.fromEntries(breakdown.discounts.map((d) => [d.key, d.percent])),
  // } as SchoolDiscountSettings;
  // const keys = breakdown.discounts.map((d) => d.key);
  // return applyDiscountsToAmount(roundMoney(baseTotal), keys, settings);
}
