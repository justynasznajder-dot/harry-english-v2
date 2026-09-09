/** Tymczasowo: ręczne generowanie faktur wyłączone dla szkoły produkcyjnej. */
export const INVOICE_MANUAL_GENERATE_DISABLED_SCHOOL_ID =
  "c93d5ac1-fa59-497f-b450-a4e50e1fb50d";

export function isInvoiceManualGenerateDisabled(
  schoolId: string | null | undefined
): boolean {
  const id = String(schoolId ?? "").trim();
  return id === INVOICE_MANUAL_GENERATE_DISABLED_SCHOOL_ID;
}

export const INVOICE_MANUAL_GENERATE_DISABLED_MESSAGE =
  "Generowanie faktur jest tymczasowo wyłączone dla tej szkoły.";
