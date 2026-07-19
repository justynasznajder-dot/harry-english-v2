export type PaymentType = "MONTHLY" | "YEARLY" | "PER_LESSON";

export function normalizePaymentType(raw: string | null | undefined): PaymentType | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "MONTHLY" || t === "YEARLY" || t === "PER_LESSON") return t;
  return null;
}

export function parsePriceDecimal(
  raw: string | number | null | undefined
): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Efektywna stawka za jedno zajęcie: override enrollment/child > cennik grupy. */
export function resolveLessonUnitPrice(params: {
  groupPricePerLesson?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  return parsePriceDecimal(params.groupPricePerLesson);
}

/** Efektywna stawka ratalna: override enrollment/child > cennik grupy. */
export function resolveMonthlyUnitPrice(params: {
  groupPriceMonthly?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  return parsePriceDecimal(params.groupPriceMonthly);
}

/** Efektywna stawka jednorazowa: override enrollment/child > cennik grupy. */
export function resolveYearlyUnitPrice(params: {
  groupPriceYearly?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  return parsePriceDecimal(params.groupPriceYearly);
}
