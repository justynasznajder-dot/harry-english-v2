import {
  resolveMonthlyUnitPrice,
  resolveYearlyUnitPrice,
} from "@/lib/lesson-pricing";

export type PricedEnrollmentRow = {
  price_monthly?: string | number | null;
  price_yearly?: string | number | null;
  monthly_unit_price?: string | number | null;
  yearly_unit_price?: string | number | null;
};

export function resolveChildBaseAmount(
  row: PricedEnrollmentRow,
  paymentType: "MONTHLY" | "YEARLY"
): number | null {
  if (paymentType === "YEARLY") {
    return resolveYearlyUnitPrice({
      groupPriceYearly: row.price_yearly,
      enrollmentOverride: row.yearly_unit_price,
    });
  }
  return resolveMonthlyUnitPrice({
    groupPriceMonthly: row.price_monthly,
    enrollmentOverride: row.monthly_unit_price,
  });
}

export function sumChildrenBaseAmounts(
  rows: PricedEnrollmentRow[],
  paymentType: "MONTHLY" | "YEARLY",
  includeRow?: (row: PricedEnrollmentRow, index: number) => boolean
): number | null {
  let total = 0;
  let hasAny = false;
  rows.forEach((row, index) => {
    if (includeRow && !includeRow(row, index)) return;
    const amount = resolveChildBaseAmount(row, paymentType);
    if (amount == null) return;
    total += amount;
    hasAny = true;
  });
  return hasAny ? total : null;
}
