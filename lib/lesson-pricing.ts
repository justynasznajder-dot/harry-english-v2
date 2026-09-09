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

export type EnrollmentUnitPrices = {
  lessonUnitPrice?: string | number | null;
  monthlyUnitPrice?: string | number | null;
  yearlyUnitPrice?: string | number | null;
};

/** Ile z trzech stawek (za zajęcia / ratalna / jednorazowa) jest ustawionych. */
export function countEnrollmentUnitPrices(prices: EnrollmentUnitPrices): number {
  let count = 0;
  if (parsePriceDecimal(prices.lessonUnitPrice) != null) count++;
  if (parsePriceDecimal(prices.monthlyUnitPrice) != null) count++;
  if (parsePriceDecimal(prices.yearlyUnitPrice) != null) count++;
  return count;
}

/** Badge NEW — brak jakiejkolwiek ceny w procesie zapisu (znika po uzupełnieniu wszystkich 3). */
export function showsNewEnrollmentPriceBadge(prices: EnrollmentUnitPrices): boolean {
  return countEnrollmentUnitPrices(prices) === 0;
}

/** Brak pełnego zestawu stawek (mniej niż 3). */
export function hasIncompleteEnrollmentPrices(prices: EnrollmentUnitPrices): boolean {
  return countEnrollmentUnitPrices(prices) < 3;
}

/** Efektywna stawka za jedno zajęcie: override enrollment/child (bez cennika grupy w tym sezonie). */
export function resolveLessonUnitPrice(params: {
  groupPricePerLesson?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  // Cennik grupy wyłączony — ceny ręczne per dziecko. Przywrócić przy automatyzacji:
  // return parsePriceDecimal(params.groupPricePerLesson);
  void params.groupPricePerLesson;
  return null;
}

/** Efektywna stawka ratalna: override enrollment/child (bez cennika grupy w tym sezonie). */
export function resolveMonthlyUnitPrice(params: {
  groupPriceMonthly?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  // Cennik grupy wyłączony — ceny ręczne per dziecko. Przywrócić przy automatyzacji:
  // return parsePriceDecimal(params.groupPriceMonthly);
  void params.groupPriceMonthly;
  return null;
}

/** Efektywna stawka jednorazowa: override enrollment/child (bez cennika grupy w tym sezonie). */
export function resolveYearlyUnitPrice(params: {
  groupPriceYearly?: string | number | null;
  enrollmentOverride?: string | number | null;
  storedOverride?: string | number | null;
}): number | null {
  const stored = parsePriceDecimal(params.storedOverride);
  if (stored != null) return stored;
  const enrollment = parsePriceDecimal(params.enrollmentOverride);
  if (enrollment != null) return enrollment;
  // Cennik grupy wyłączony — ceny ręczne per dziecko. Przywrócić przy automatyzacji:
  // return parsePriceDecimal(params.groupPriceYearly);
  void params.groupPriceYearly;
  return null;
}
