import type { PaymentType } from "@/lib/lesson-pricing";

function normalizePaymentTypeKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

/** Krótka nazwa planu (np. przy radio): Ratalny, Jednorazowy, Za pojedyncze zajęcia */
export function paymentTypeShortLabel(type: PaymentType | string): string {
  const t = normalizePaymentTypeKey(type);
  if (t === "MONTHLY") return "Ratalny";
  if (t === "YEARLY") return "Jednorazowy";
  if (t === "PER_LESSON") return "Za pojedyncze zajęcia";
  return t;
}

/** Przysłówek / okres rozliczenia: ratalnie, jednorazowo */
export function paymentTypePeriodLabel(type: PaymentType | string): string {
  const t = normalizePaymentTypeKey(type);
  if (t === "MONTHLY") return "ratalnie";
  if (t === "YEARLY") return "jednorazowo";
  if (t === "PER_LESSON") return "za pojedyncze zajęcia";
  return t.toLowerCase();
}

/** Etykieta stawki w cenniku */
export function paymentRateLabel(
  kind: "monthly" | "yearly" | "per_lesson",
  options?: { withPln?: boolean; individualOptional?: boolean }
): string {
  const pln = options?.withPln ? " (PLN)" : "";
  const optional = options?.individualOptional ? " (indywidualna, opcjonalnie)" : "";
  if (kind === "monthly") return `Stawka ratalna${pln}${optional}`;
  if (kind === "yearly") return `Stawka jednorazowa${pln}${optional}`;
  return `Stawka za pojedyncze zajęcia${pln}${optional}`;
}

/** Etykieta płatności w cenniku grupy */
export function paymentPlanLabel(kind: "monthly" | "yearly" | "per_lesson"): string {
  if (kind === "monthly") return "Płatność ratalna";
  if (kind === "yearly") return "Płatność jednorazowa";
  return "Płatność za pojedyncze zajęcia";
}
