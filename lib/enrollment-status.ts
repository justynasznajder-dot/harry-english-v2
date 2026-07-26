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
  NEGOTIATING: "Rodzic nie zaakceptował terminu zajęć",
  ACCEPTED: "Zaakceptowane przez rodzica",
  SIGNED: "Umowa podpisana",
  COMPLETED: "Zakończone",
  REJECTED: "Odrzucone przez managera",
};

export const ENROLLMENT_STATUS_BADGE_BASE =
  "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold leading-none whitespace-nowrap";

export const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  NEW: "bg-emerald-50 text-emerald-950 ring-1 ring-inset ring-emerald-200",
  PROPOSED: "bg-sky-100 text-sky-800",
  NEGOTIATING: "bg-amber-100 text-amber-900",
  ACCEPTED: "bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-200",
  SIGNED: "bg-emerald-700 text-white",
  COMPLETED: "bg-zinc-200 text-zinc-700",
  REJECTED: "bg-rose-100 text-rose-800",
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

/** Filtry listy zgłoszeń w panelu admina. SIGNED/COMPLETED nie wchodzą na listę (proces zakończony). */
export const ENROLLMENT_LIST_FILTERS = [
  { value: "", label: "Wszystkie" },
  { value: "NEW", label: "Nowe" },
  { value: "PROPOSED", label: "Zaproponowane" },
  { value: "NEGOTIATING", label: "Negocjacje" },
  { value: "ACCEPTED", label: "Zaakceptowane" },
  { value: "REJECTED", label: "Odrzucone" },
] as const;

/** Statusy ukończone — nie pokazujemy ich w widoku Zgłoszeń. */
const ENROLLMENT_LIST_HIDDEN_STATUSES: ReadonlySet<EnrollmentStatus> = new Set([
  "SIGNED",
  "COMPLETED",
]);

export function filterEnrollmentChildrenByStatus<T extends { status: EnrollmentStatus }>(
  children: T[],
  filter: string,
): T[] {
  const visible = children.filter((child) => !ENROLLMENT_LIST_HIDDEN_STATUSES.has(child.status));
  if (!filter) return visible;
  const status = filter as EnrollmentStatus;
  return visible.filter((child) => child.status === status);
}

export function enrollmentMatchesStatusFilter(
  children: Array<{ status: EnrollmentStatus }>,
  filter: string,
): boolean {
  return filterEnrollmentChildrenByStatus(children, filter).length > 0;
}
