/** Wspólny tekst i nazewnictwo zgody na odebranie dziecka przez lektora. */

export const PICKUP_CONSENT_DOCUMENT_TITLE =
  "Zgoda na odebranie dziecka przez lektora" as const;

/** Prefiks nazwy pliku PDF (Załącznik nr 2). */
export const PICKUP_CONSENT_PDF_TITLE =
  "Załącznik nr 2 – Upoważnienie lektora do odbioru dziecka" as const;

/** Starszy prefiks PDF — nadal rozpoznawany przy pobieraniu. */
export const PICKUP_CONSENT_PDF_TITLE_LEGACY =
  "Załącznik nr 2 – Upoważnienie lektora do towarzyszenia dziecku" as const;

export const PICKUP_CONSENT_PRINT_INSTRUCTIONS = {
  title: "Zgoda na odebranie przez lektora — do wydruku",
  required: "W tej grupie wymagana jest zgoda na odebranie dziecka przez lektora.",
  scopeNote:
    "Dotyczy wyłącznie dzieci, które będą odbierane przez lektora z placówki i odprowadzane na zajęcia.",
  noESign:
    "Tej zgody nie podpisuje się elektronicznie. Wszyscy rodzice muszą przynieść wydrukowany dokument z podpisem ręcznym na pierwsze zajęcia.",
  downloadInDocuments:
    "Dokument jest do pobrania w zakładce Dokumenty — pobierz, wydrukuj i podpisz ręcznie.",
  teacherBlankForms:
    "Jeśli nie masz możliwości wydrukowania, nauczyciel na pierwszych zajęciach będzie miał druki do wypełnienia na miejscu.",
} as const;

/** `Załącznik nr 2 – Upoważnienie lektora do odbioru dziecka _ Imię Nazwisko _ 00031-2-2026.pdf` */
export function buildPickupConsentPdfFilename(
  childFullName: string,
  contractNumber?: string | null
): string {
  const name = childFullName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ");
  const number = String(contractNumber ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "");
  const base = `${PICKUP_CONSENT_PDF_TITLE} _ ${name || "dziecko"}`;
  return number ? `${base} _ ${number}.pdf` : `${base}.pdf`;
}

export function isPickupConsentPdfFilename(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim().toLowerCase();
  return (
    base.startsWith(PICKUP_CONSENT_PDF_TITLE.toLowerCase()) ||
    base.startsWith(PICKUP_CONSENT_PDF_TITLE_LEGACY.toLowerCase()) ||
    base.startsWith(`${PICKUP_CONSENT_DOCUMENT_TITLE.toLowerCase()}_`) ||
    /zalacznik-2-odbior/i.test(base)
  );
}

/**
 * Ujednolica HTML Załącznika 2:
 * - nagłówek: „Załącznik nr 2 do umowy nr {numer}”
 * - usuwa zbędny podtytuł „Zgoda na odebranie…”
 * - łączy zdanie „Upoważniam…” z kontynuacją pod polami
 * - naprawia skutek starej normalizacji (Zgoda… + numer w span)
 */
export function normalizePickupConsentDocumentHtml(html: string): string {
  return html
    .replace(
      /Zgoda\s+na\s+odebranie\s+dziecka\s+przez\s+lektora(?=\s*<span\b)/gi,
      "Załącznik nr 2 do umowy nr ",
    )
    .replace(
      /<(p|div)(\s[^>]*)?>\s*Zgoda\s+na\s+odebranie\s+dziecka\s+przez\s+lektora\s*<\/\1>\s*/gi,
      "",
    )
    .replace(
      /Imię,\s*nazwisko,\s*numer\s+dowodu\s+osobistego\s*:/gi,
      "Imię i nazwisko lektora:",
    )
    .replace(
      /Imię\s+i\s+nazwisko\s*:/gi,
      "Imię i nazwisko lektora:",
    )
    // Stary pusty span po imieniu lektora (dawny teacher_id_suffix) — nie ruszaj osobnego pola nr dowodu.
    .replace(
      /(<span class="ph">[^<]*<\/span>)\s*<span class="ph">\s*<\/span>/gi,
      "$1",
    )
    // Stary układ: „Upoważniam…” nad polami + „do odbioru…” pod spodem → jeden akapit pod polami.
    .replace(
      /<p(\s[^>]*)?>\s*(Upoważniam\s+lektora[\s\S]*?<strong>Harry English<\/strong>)\s*<\/p>\s*(<div class="party-block">[\s\S]*?<\/div>)\s*<p(\s[^>]*)?>\s*(do odbioru dziecka[\s\S]*?)<\/p>/gi,
      "$3\n\n<p>\n  $2\n  $5\n</p>",
    )
    .replace(
      /Klient potwierdza zapoznanie się z treścią załącznika i akceptuje jego warunki\./gi,
      "Klient potwierdza zapoznanie się z treścią dokumentu i akceptuje jego warunki.",
    );
}

/** W trybie bez opłat nie ma umowy — usuń linię „Załącznik nr 2 do umowy nr …”. */
export function stripPickupConsentContractReferenceLine(html: string): string {
  return normalizePickupConsentDocumentHtml(html).replace(
    /<(p|div|h[1-6])(\s[^>]*)?>[\s\S]*?Załącznik\s*nr\s*2\s*do\s*umowy[\s\S]*?<\/\1>\s*/gi,
    "",
  );
}
