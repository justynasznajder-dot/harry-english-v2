export const ENROLLMENT_STATUSES = [
  "NEW",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "SIGNED",
  "COMPLETED",
  "REJECTED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  NEW: "Nowe zgłoszenie",
  PROPOSED: "Propozycja wysłana — oczekuje na rodzica",
  NEGOTIATING: "Odrzucona propozycja — oczekuje na nową z szkoły",
  ACCEPTED: "Zaakceptowane przez rodzica",
  SIGNED: "Umowa podpisana",
  COMPLETED: "Zakończone",
  REJECTED: "Odrzucone przez managera",
};

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  NEW: "bg-amber-100 text-amber-800",
  PROPOSED: "bg-sky-100 text-sky-800",
  NEGOTIATING: "bg-amber-100 text-amber-900",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  SIGNED: "bg-emerald-200 text-emerald-900",
  COMPLETED: "bg-zinc-200 text-zinc-700",
  REJECTED: "bg-rose-100 text-rose-800",
};

export const ENROLLMENT_PROPOSAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Oczekuje na odpowiedź",
  ACCEPTED: "Zaakceptowana",
  REJECTED: "Odrzucona",
};

export function formatEnrollmentStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  if (key in ENROLLMENT_STATUS_LABELS) {
    return ENROLLMENT_STATUS_LABELS[key as EnrollmentStatus];
  }
  return status?.trim() || "—";
}

export function formatEnrollmentProposalStatusLabel(status: string | null | undefined): string {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  return ENROLLMENT_PROPOSAL_STATUS_LABELS[key] ?? status?.trim() ?? "—";
}
