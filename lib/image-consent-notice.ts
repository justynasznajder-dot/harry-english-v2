/** Wspólne nazewnictwo załącznika o wizerunku — bezpieczne też po stronie klienta. */

/** Prefiks nazwy pliku PDF (Załącznik nr 1). */
export const IMAGE_CONSENT_PDF_TITLE =
  "Załącznik nr 1 – Oświadczenie dotyczące wykorzystania wizerunku dziecka" as const;

function sanitizePdfDisplayName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ");
}

function sanitizeContractNumberForFilename(contractNumber: string | null | undefined): string | null {
  const raw = String(contractNumber ?? "").trim();
  if (!raw) return null;
  return raw.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "");
}

/** `Załącznik nr 1 – Oświadczenie ... _ Imię Nazwisko _ 00031-2-2026.pdf` */
export function buildImageConsentPdfFilename(
  childFullName: string,
  contractNumber?: string | null
): string {
  const name = sanitizePdfDisplayName(childFullName);
  const number = sanitizeContractNumberForFilename(contractNumber);
  const base = `${IMAGE_CONSENT_PDF_TITLE} _ ${name || "dziecko"}`;
  return number ? `${base} _ ${number}.pdf` : `${base}.pdf`;
}

export function isImageConsentPdfFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim().toLowerCase();
  return (
    base.startsWith(IMAGE_CONSENT_PDF_TITLE.toLowerCase()) ||
    /zalacznik-1-wizerunek/i.test(base)
  );
}
