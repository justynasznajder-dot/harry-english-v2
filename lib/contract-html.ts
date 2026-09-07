/** Polskie nazwy dni — indeks 1..7 (poniedziałek..niedziela), zgodnie z `schedule_templates.day_of_week`. */
const POLISH_DAY_NAMES_1_7 = [
  "",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
  "niedziela",
] as const;

/** Zamienia zmienne {{key}} w szablonie HTML umowy. Wartości HTML (np. amount_clause) nie są escapowane. */
export function generateContractHtml(
  templateHtml: string,
  placeholders: Record<string, string>
): string {
  let html = templateHtml;
  for (const [key, value] of Object.entries(placeholders)) {
    html = html.split(`{{${key}}}`).join(value ?? "");
  }
  return html;
}

import { paymentTypePeriodLabel } from "@/lib/payment-labels";
import {
  buildAnnexContractNumber,
  buildBaseContractNumber,
  isAnnexContractNumber,
} from "@/lib/client-numbers";

export { buildAnnexContractNumber, buildBaseContractNumber };

/** Forma płatności w treści umowy (np. „płatność za pojedyncze zajęcia”). */
export function formatPaymentTypeLabel(paymentType: string | null | undefined): string {
  const t = String(paymentType ?? "").trim().toUpperCase();
  if (t === "MONTHLY") return "płatność ratalna";
  if (t === "YEARLY") return "płatność jednorazowa";
  if (t === "PER_LESSON") return "płatność za pojedyncze zajęcia";
  return paymentTypePeriodLabel(String(paymentType ?? ""));
}

export function formatContractAmount(amount: number | string | null | undefined): string {
  if (amount == null || amount === "") return "";
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return String(amount);
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatContractDate(date: Date = new Date()): string {
  return date.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Rok szkolny w formacie YYYY/YYYY — pierwszy rok to rok z podanej daty (np. podpisu umowy). */
export function formatSchoolYearFromDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  return `${year}/${year + 1}`;
}

/** Ustawia rok szkolny w wygenerowanym HTML umowy / załączników na podstawie daty podpisu. */
export function applySchoolYearToDocumentHtml(contentHtml: string, signedAt: Date): string {
  const schoolYear = formatSchoolYearFromDate(signedAt);
  if (contentHtml.includes("{{school_year}}")) {
    return generateContractHtml(contentHtml, { school_year: schoolYear });
  }
  return contentHtml.replace(
    /(<span class="ph">)\d{4}\/\d{4}(<\/span>)/g,
    `$1${schoolYear}$2`
  );
}

export function formatBirthDatePl(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatLessonDuration(durationMin: number | null | undefined): string {
  if (durationMin == null || !Number.isFinite(durationMin) || durationMin <= 0) return "";
  return String(Math.round(durationMin));
}

/** Czas zajęć z jednostką — placeholder w umowie, np. „45 minut”. */
export function formatLessonDurationLabel(durationMin: number | null | undefined): string {
  const minutes = formatLessonDuration(durationMin);
  return minutes ? `${minutes} minut` : "";
}

/** Planowana liczba zajęć — sama liczba (np. „33”), bez odmiany słowa. */
export function formatPlannedLessonsLabel(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(count) || count <= 0) return "";
  return String(Math.round(count));
}

export function formatLessonUnitPriceLabel(amount: number | string | null | undefined): string {
  const formatted = formatContractAmount(amount);
  if (!formatted) return "";
  return `${formatted} zł brutto`;
}

/**
 * §2 tylko dla wybranej formy płatności — bez punktów o pozostałych trybach.
 * `amountLabel` już sformatowane, np. „20,00 zł brutto”.
 */
export function buildPaymentSectionHtml(params: {
  paymentType: string | null | undefined;
  amountLabel: string;
  contractNumber?: string | null;
}): string {
  const paymentLabel = escapeHtmlText(formatPaymentTypeLabel(params.paymentType));
  const amountLabel = escapeHtmlText(params.amountLabel.trim() || "—");
  const contractNumber = escapeHtmlText(params.contractNumber?.trim() || "—");
  const t = String(params.paymentType ?? "").trim().toUpperCase();

  let specificLi = "";
  if (t === "PER_LESSON") {
    specificLi =
      "<li>Wysokość miesięcznej opłaty ustalana jest na podstawie liczby zajęć, w których Słuchacz uczestniczył w danym miesiącu.</li>";
  } else if (t === "MONTHLY") {
    specificLi =
      `<li>Każda faktura objęta jest dwutygodniowym terminem płatności. Wpłaty prosimy dokonywać na numer rachunku: 91 1050 1298 1000 0092 5894 4835, w tytule przelewu podając <span class="ph">${contractNumber}</span>.</li>`;
  } else if (t === "YEARLY") {
    specificLi =
      "<li>Klient zobowiązuje się do dokonania płatności w kwocie i terminie wskazanych na fakturze.</li>";
  }

  return `<ol class="contract-list">
  <li>Klient wybiera następującą formę płatności: <span class="ph">${paymentLabel}</span>, kwota: <span class="ph">${amountLabel}</span>.</li>
  <li>Opłata za uczestnictwo w kursie uiszczana jest w formie elektronicznej, na podstawie faktury wystawionej przez Harry English.</li>
  ${specificLi}
  <li>W przypadku opóźnienia w płatności Harry English może naliczyć odsetki ustawowe za opóźnienie.</li>
</ol>`;
}

export function formatScheduleTime(value: Date | string | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value.trim())) {
    const [h, m] = value.trim().slice(0, 5).split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function buildGroupSchedule(
  rows: Array<{ day_of_week: number; start_time: Date | string }>
): string {
  const parts = rows
    .map((row) => {
      const rawDay = POLISH_DAY_NAMES_1_7[row.day_of_week] ?? `dzień ${row.day_of_week}`;
      const day =
        rawDay.length > 0
          ? rawDay.charAt(0).toLocaleUpperCase("pl-PL") + rawDay.slice(1)
          : rawDay;
      const time = formatScheduleTime(row.start_time);
      return time ? `${day} ${time}` : day;
    })
    .filter(Boolean);
  return parts.join(", ");
}

export function buildScheduleDayLabel(
  rows: Array<{ day_of_week: number }>
): string {
  const parts = rows
    .map((row) => POLISH_DAY_NAMES_1_7[row.day_of_week] ?? `dzień ${row.day_of_week}`)
    .filter(Boolean);
  return parts.join(", ");
}

export function buildScheduleTimeLabel(
  rows: Array<{ start_time: Date | string }>
): string {
  const parts = rows.map((row) => formatScheduleTime(row.start_time)).filter(Boolean);
  return parts.join(", ");
}

/** Miejsce zajęć: nazwa lokalizacji + adres (jeśli jest). */
export function buildSchedulePlaceLabel(
  name: string | null | undefined,
  address: string | null | undefined
): string {
  const named = stripLocationMarketingSuffix(String(name ?? "").trim());
  const addr = String(address ?? "").trim();
  if (named && addr) return `${named}, ${addr}`;
  return named || addr || "";
}

export function buildAmountClause(
  paymentType: string,
  amount: number | string | null | undefined
): string {
  const normalized = String(paymentType ?? "").trim().toLowerCase();
  if (normalized === "per_lesson") return "";
  const formatted = formatContractAmount(amount);
  if (normalized === "monthly") {
    return `<p class="note"><span class="ph">Wysokość opłaty ratalnej wynosi: ${formatted} zł brutto.</span></p>`;
  }
  if (normalized === "yearly") {
    return `<p class="note"><span class="ph">Łączna opłata jednorazowa wynosi: ${formatted} zł brutto.</span></p>`;
  }
  return "";
}

export function buildPerLessonClause(
  children: Array<{ name: string; unitPrice: number }>
): string {
  const lines = children
    .filter((c) => Number.isFinite(c.unitPrice) && c.unitPrice > 0)
    .map((c) => {
      const formatted = formatContractAmount(c.unitPrice);
      const label = c.name.trim();
      if (label) {
        return `<p class="note"><span class="ph">Stawka za pojedyncze zajęcia dla ${escapeHtmlText(label)} wynosi: ${formatted} zł brutto.</span></p>`;
      }
      return `<p class="note"><span class="ph">Stawka za pojedyncze zajęcia wynosi: ${formatted} zł brutto.</span></p>`;
    });
  return lines.join("\n");
}

export function buildParentPeselOrId(
  billingType: "private" | "company",
  pesel: string | null | undefined,
  nip: string | null | undefined
): string {
  if (billingType === "company") {
    return nip ? `NIP: ${nip}` : "";
  }
  return pesel ? `PESEL: ${pesel}` : "";
}

export function buildParentAddress(
  address: string,
  zipCode: string,
  city: string
): string {
  return `${address}, ${zipCode} ${city}`;
}

/** Numer umowy bazowej: ChildID/rok lub ChildID/rok/n. */
export function buildContractNumber(params: {
  childClientNumber: string;
  year: number;
  baseIndex: number;
}): string {
  return buildBaseContractNumber(params);
}

/** Wyciąga numer umowy z wygenerowanego HTML (nowy + legacy). */
export function extractContractNumber(contentHtml: string): string | null {
  const modernChild = contentHtml.match(
    /Nr umowy:\s*(?:<[^>]*>\s*)*(\d{5}\/\d+\/\d{4}(?:\/\d+)?(?:\/A\d+)?)/i
  );
  if (modernChild?.[1]) return modernChild[1];

  const modern = contentHtml.match(
    /Nr umowy:\s*(?:<[^>]*>\s*)*(\d{1,6}\/\d{4})/i
  );
  if (modern?.[1]) return modern[1];

  const attachmentChild = contentHtml.match(
    /do umowy nr\s*(?:<[^>]*>\s*)*(\d{5}\/\d+\/\d{4}(?:\/\d+)?(?:\/A\d+)?)/i
  );
  if (attachmentChild?.[1]) return attachmentChild[1];

  const attachment = contentHtml.match(
    /do umowy nr\s*(?:<[^>]*>\s*)*(\d{1,6}\/\d{4})/i
  );
  if (attachment?.[1]) return attachment[1];

  const legacy = contentHtml.match(/HE\/[\d/]+\/\d{3}/);
  return legacy?.[0] ?? null;
}

/** Kolejny indeks umowy bazowej w danym roku (aneksów nie liczy). */
export function nextBaseContractIndex(existingBaseNumbers: string[]): number {
  let max = 0;
  for (const n of existingBaseNumbers) {
    if (isAnnexContractNumber(n)) continue;
    const m = n.match(/\/(\d{4})(?:\/(\d+))?$/);
    if (!m) continue;
    const idx = m[2] ? Number(m[2]) : 1;
    if (Number.isInteger(idx) && idx > max) max = idx;
  }
  return max + 1;
}

export function buildSignedAtLine(signedAt: Date = new Date()): string {
  return `<p class="signature-date">Data akceptacji: <span class="ph">${formatContractDate(signedAt)}</span></p>`;
}

export function paymentTypeToClauseKey(paymentType: string): string {
  const t = String(paymentType ?? "").trim().toUpperCase();
  if (t === "YEARLY") return "yearly";
  if (t === "MONTHLY") return "monthly";
  if (t === "PER_LESSON") return "per_lesson";
  return t.toLowerCase();
}

export function buildTeacherFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const parts = [String(firstName ?? "").trim(), String(lastName ?? "").trim()].filter(Boolean);
  return parts.join(" ");
}

/** Usuwa etykietę marketingową lokalizacji — nie powinna trafiać do dokumentów umowy. */
export function stripLocationMarketingSuffix(value: string): string {
  return value.replace(/\s*\(Nowość!\)\s*$/i, "").trim();
}

export function buildChildSchoolName(
  preferredLocationName: string | null | undefined,
  preferredLocationRaw: string | null | undefined
): string {
  const named = stripLocationMarketingSuffix(String(preferredLocationName ?? "").trim());
  if (named) return named;
  const raw = stripLocationMarketingSuffix(String(preferredLocationRaw ?? "").trim());
  return raw || "—";
}

/** Tekst w polu podpisu szkoły (nad linią) po podpisaniu umowy. */
export const CONTRACT_SCHOOL_SIGNATORY_NAME = "Michał Sznajder";

/** Etykieta pod linią podpisu szkoły w szablonie HTML umowy. */
export const CONTRACT_SCHOOL_SIGNATURE_NAME = "Harry English – FHU Michał Sznajder";

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectSignedAtLine(contentHtml: string, signedAt: Date): string {
  const line = buildSignedAtLine(signedAt);

  if (contentHtml.includes("{{signed_at_line}}")) {
    return generateContractHtml(contentHtml, { signed_at_line: line });
  }

  if (contentHtml.includes("{{signed_at}}")) {
    return generateContractHtml(contentHtml, { signed_at: formatContractDate(signedAt) });
  }

  if (contentHtml.includes("Data akceptacji:")) {
    return contentHtml.replace(/<p class="signature-date">[\s\S]*?<\/p>/, line);
  }

  return contentHtml.replace('<div class="signature-row">', `${line}\n  <div class="signature-row">`);
}

function fillLegacySignatureLines(
  contentHtml: string,
  parentFullName: string,
  schoolSignatureName: string,
): string {
  const parentHtml = `<span class="ph signature-text">${escapeHtmlText(parentFullName)}</span>`;
  const schoolHtml = `<span class="ph signature-text">${escapeHtmlText(schoolSignatureName)}</span>`;
  let index = 0;
  return contentHtml.replace(/<div class="signature-line">[\s\S]*?<\/div>/g, (match) => {
    index += 1;
    const inner = index === 1 ? parentHtml : schoolHtml;
    return `<div class="signature-line">${inner}</div>`;
  });
}

/** Po podpisie: data akceptacji + imię rodzica i podpis szkoły w polach podpisu. */
export function applyContractSignaturesToDocumentHtml(
  contentHtml: string,
  params: { signedAt: Date; parentFullName: string },
): string {
  const parentFullName = params.parentFullName.trim();
  const schoolSignatoryName = CONTRACT_SCHOOL_SIGNATORY_NAME;

  let html = injectSignedAtLine(contentHtml, params.signedAt);

  if (html.includes("{{parent_signature_line}}") || html.includes("{{school_signature_line}}")) {
    html = generateContractHtml(html, {
      parent_signature_line: parentFullName,
      school_signature_line: schoolSignatoryName,
    });
    return html;
  }

  return fillLegacySignatureLines(html, parentFullName, schoolSignatoryName);
}
