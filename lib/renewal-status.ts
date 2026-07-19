export const RENEWAL_STATUSES = [
  "DRAFT",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "SIGNED",
  "RESIGNED",
] as const;

export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

/** Odnowienie widoczne w panelu rodzica (manager wysłał zapytanie). */
export function isRenewalVisibleToParent(status: string | null | undefined): boolean {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  return key !== "DRAFT" && key !== "RESIGNED" && key.length > 0;
}

export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  DRAFT: "Szkic — niewidoczne dla rodzica",
  PENDING_CONFIRMATION: "Oczekuje potwierdzenia rodzica",
  CONFIRMED: "Rodzic potwierdził chęć kontynuacji",
  PROPOSED: "Propozycja grupy wysłana",
  NEGOTIATING: "Negocjacje terminu",
  ACCEPTED: "Propozycja zaakceptowana",
  SIGNED: "Umowa podpisana",
  RESIGNED: "Rezygnacja z odnowienia",
};

export const RENEWAL_STATUS_COLORS: Record<RenewalStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-sky-100 text-sky-900",
  PROPOSED: "bg-indigo-100 text-indigo-900",
  NEGOTIATING: "bg-amber-100 text-amber-950",
  ACCEPTED: "bg-emerald-100 text-emerald-900",
  SIGNED: "bg-emerald-200 text-emerald-950",
  RESIGNED: "bg-zinc-200 text-zinc-700",
};

export function formatRenewalStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  if (key in RENEWAL_STATUS_LABELS) {
    return RENEWAL_STATUS_LABELS[key as RenewalStatus];
  }
  return status?.trim() || "—";
}
