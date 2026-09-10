/**
 * Generowanie faktur (ręczne / auto / cron / korekty) — tylko szkoła DEV.
 * Szkoła produkcyjna pozostaje zablokowana do czasu świadomego włączenia procesu.
 */
export const INVOICE_GENERATE_ALLOWED_SCHOOL_ID =
  "efcb641a-e5bd-4e59-aa39-c08fd1b318e9"; // DEV

/** @deprecated Używaj isInvoiceGenerationAllowed / isInvoiceManualGenerateDisabled */
export const INVOICE_MANUAL_GENERATE_DISABLED_SCHOOL_ID =
  "c93d5ac1-fa59-497f-b450-a4e50e1fb50d"; // PROD

export function isInvoiceGenerationAllowed(
  schoolId: string | null | undefined
): boolean {
  const id = String(schoolId ?? "").trim();
  return id === INVOICE_GENERATE_ALLOWED_SCHOOL_ID;
}

/** true = generowanie zablokowane (UI + API). */
export function isInvoiceManualGenerateDisabled(
  schoolId: string | null | undefined
): boolean {
  return !isInvoiceGenerationAllowed(schoolId);
}

export const INVOICE_MANUAL_GENERATE_DISABLED_MESSAGE =
  "Generowanie faktur jest dostępne tylko na środowisku DEV (testy). Na produkcji pozostaje wyłączone.";
