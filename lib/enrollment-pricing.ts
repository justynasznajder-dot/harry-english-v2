export type PricedEnrollmentRow = {
  price_monthly?: string | number | null;
  price_yearly?: string | number | null;
};

export function resolveChildBaseAmount(
  row: PricedEnrollmentRow,
  paymentType: "MONTHLY" | "YEARLY"
): number | null {
  const raw = paymentType === "YEARLY" ? row.price_yearly : row.price_monthly;
  if (raw == null || raw === "") return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
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
