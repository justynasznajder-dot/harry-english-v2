/** Wspólny tekst i nazewnictwo zgody na odebranie dziecka przez lektora (nie jest załącznikiem). */

export const PICKUP_CONSENT_DOCUMENT_TITLE =
  "Zgoda na odebranie dziecka przez lektora" as const;

export const PICKUP_CONSENT_PRINT_INSTRUCTIONS = {
  title: "Zgoda na odebranie przez lektora — do wydruku",
  required: "W tej grupie wymagana jest zgoda na odebranie dziecka przez lektora.",
  noESign:
    "Tej zgody nie podpisuje się elektronicznie. Wszyscy rodzice muszą przynieść wydrukowany dokument z podpisem ręcznym na pierwsze zajęcia.",
  downloadInDocuments:
    "Dokument jest do pobrania w zakładce Dokumenty — pobierz, wydrukuj i podpisz ręcznie.",
  teacherBlankForms:
    "Jeśli nie masz możliwości wydrukowania, nauczyciel na pierwszych zajęciach będzie miał druki do wypełnienia na miejscu.",
} as const;

/** `Zgoda na odebranie dziecka przez lektora_Imię Nazwisko.pdf` */
export function buildPickupConsentPdfFilename(childFullName: string): string {
  const name = childFullName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ");
  return `${PICKUP_CONSENT_DOCUMENT_TITLE}_${name || "dziecko"}.pdf`;
}

export function isPickupConsentPdfFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  return (
    base.toLowerCase().startsWith(`${PICKUP_CONSENT_DOCUMENT_TITLE.toLowerCase()}_`) ||
    /zalacznik-2-odbior/i.test(base)
  );
}

/** Usuwa z HTML odniesienia, że dokument jest „załącznikiem nr 2 do umowy”. */
export function normalizePickupConsentDocumentHtml(html: string): string {
  return html
    .replace(
      /Załącznik\s*nr\s*2\s*do\s*umowy\s*nr\s*[^<]*/gi,
      PICKUP_CONSENT_DOCUMENT_TITLE,
    )
    .replace(
      /Klient potwierdza zapoznanie się z treścią załącznika i akceptuje jego warunki\./gi,
      "Klient potwierdza zapoznanie się z treścią dokumentu i akceptuje jego warunki.",
    );
}
