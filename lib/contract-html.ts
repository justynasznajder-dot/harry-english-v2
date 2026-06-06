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

export function formatPaymentTypeLabel(paymentType: string | null | undefined): string {
  const t = String(paymentType ?? "").trim().toUpperCase();
  if (t === "YEARLY") return "rocznie";
  if (t === "MONTHLY") return "miesięcznie";
  if (t === "PER_LESSON") return "za lekcję";
  return t.toLowerCase();
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
      const day = POLISH_DAY_NAMES_1_7[row.day_of_week] ?? `dzień ${row.day_of_week}`;
      const time = formatScheduleTime(row.start_time);
      return time ? `${day} ${time}` : day;
    })
    .filter(Boolean);
  return parts.join(", ");
}

export function buildAmountClause(
  paymentType: string,
  amount: number | string | null | undefined
): string {
  const normalized = String(paymentType ?? "").trim().toLowerCase();
  if (normalized === "per_lesson") return "";
  const formatted = formatContractAmount(amount);
  if (normalized === "monthly") {
    return `<p class="note"><span class="ph">Wysokość miesięcznej opłaty wynosi: ${formatted} zł brutto.</span></p>`;
  }
  if (normalized === "yearly") {
    return `<p class="note"><span class="ph">Łączna opłata roczna wynosi: ${formatted} zł brutto.</span></p>`;
  }
  return "";
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

export function buildContractNumber(schoolYearName: string, sequence: number): string {
  const yearPart = schoolYearName.replace(/\s+/g, "").replace(/-/g, "/");
  return `HE/${yearPart}/${String(sequence).padStart(3, "0")}`;
}

/** Wyciąga numer umowy z wygenerowanego HTML (np. HE/2026/001). */
export function extractContractNumber(contentHtml: string): string | null {
  const match = contentHtml.match(/HE\/[\d/]+\/\d{3}/);
  return match?.[0] ?? null;
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

/** Suffix na numer dowodu lektora — brak w bazie, zostawiamy pusty lub spację przed ręcznym uzupełnieniem. */
export function buildTeacherIdSuffix(): string {
  return "";
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
