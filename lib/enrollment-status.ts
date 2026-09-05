export const ENROLLMENT_STATUSES = [
  "NEW",
  "PROPOSED",
  "NEGOTIATING",
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
  "SIGNED",
  "COMPLETED",
  "REJECTED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/**
 * Gdy `true` — rodzic musi kliknąć „Akceptuję propozycję” (status PROPOSED).
 * Gdy `false` — po wysłaniu grupy przez managera od razu ACCEPTED / dane do umowy.
 * Kod akceptacji zostaje w UI/API, żeby dało się szybko włączyć z powrotem.
 */
export const ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE = false;

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  NEW: "Nowe zgłoszenie",
  PROPOSED: ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
    ? "Propozycja wysłana — oczekuje na rodzica"
    : "Propozycja wysłana (stare) — rodzic może uzupełnić dane",
  NEGOTIATING: "Rodzic nie zaakceptował terminu zajęć",
  ACCEPTED: ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
    ? "Zaakceptowane — uzupełnij dane do umowy"
    : "Grupa przypisana — uzupełnij dane do umowy",
  AWAITING_CONTRACT: "Dane uzupełnione — umowa w trakcie generowania / podpisu",
  CONTRACT_READY: "Umowa gotowa — oczekuje na podpis",
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
  AWAITING_CONTRACT: "bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-200",
  CONTRACT_READY: "bg-indigo-100 text-indigo-900 ring-1 ring-inset ring-indigo-200",
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
  { value: "ACCEPTED", label: "Grupa przypisana" },
  { value: "AWAITING_CONTRACT", label: "Czeka na umowę" },
  { value: "CONTRACT_READY", label: "Umowa do podpisu" },
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

/** Statusy w pipeline umowy (po akceptacji grupy, przed / w trakcie umowy). */
export const ENROLLMENT_CONTRACT_PIPELINE_STATUSES: ReadonlySet<string> = new Set([
  "ACCEPTED",
  "AWAITING_CONTRACT",
  "CONTRACT_READY",
  "SIGNED",
]);

export function isEnrollmentContractPipelineStatus(status: string | null | undefined): boolean {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  if (ENROLLMENT_CONTRACT_PIPELINE_STATUSES.has(key)) return true;
  // Stare zgłoszenia PROPOSED przy wyłączonej akceptacji — traktuj jak gotowe do umowy.
  if (!ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE && key === "PROPOSED") return true;
  return false;
}

/** Statusy, które jeszcze blokują przygotowanie umowy (decyzja rodzica / nowe zgłoszenie). */
export function isEnrollmentDecisionPendingStatus(status: string | null | undefined): boolean {
  const key = String(status ?? "")
    .trim()
    .toUpperCase();
  if (key === "NEW" || key === "NEGOTIATING") return true;
  if (ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE && key === "PROPOSED") return true;
  return false;
}
