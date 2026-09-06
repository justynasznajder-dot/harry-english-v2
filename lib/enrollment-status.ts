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
    : "Grupa przypisana — oczekuje na podpisanie umowy przez nauczyciela",
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

/**
 * Etykieta/kolor badge na liście zgłoszeń.
 * Szkic NEW z już wybraną grupą pokazuje „Grupa przypisana” (jak filtr ACCEPTED),
 * a nie „Nowe zgłoszenie”.
 */
export function resolveEnrollmentListBadge(child: {
  status?: string | null;
  proposedGroupId?: string | null;
}): { label: string; colorClass: string } {
  const key = String(child.status ?? "NEW")
    .trim()
    .toUpperCase() as EnrollmentStatus;
  if (key === "NEW" && hasProposedGroup(child)) {
    return {
      label: "Grupa przypisana",
      colorClass: ENROLLMENT_STATUS_COLORS.ACCEPTED,
    };
  }
  return {
    label: formatEnrollmentStatusLabel(key),
    colorClass: ENROLLMENT_STATUS_COLORS[key] ?? "bg-zinc-100 text-zinc-700",
  };
}

/**
 * Uproszczony etap listy uczniów (bez akceptacji rodzica / PROPOSED):
 * Zgłoszenie → przypisany do grupy → czeka na umowę → umowa podpisana
 */
export const STUDENT_LIST_PIPELINE_STAGES = [
  "Zgłoszenie",
  "Przypisany do grupy",
  "Czeka na umowę",
  "Umowa podpisana",
] as const;

export type StudentListPipelineStage = (typeof STUDENT_LIST_PIPELINE_STAGES)[number];

export function resolveStudentListPipelineStage(input: {
  enrollmentStatus?: string | null;
  hasGroup?: boolean;
  contractStatus?: string | null;
  /** Tryb bez opłat — flow kończy się na przypisaniu do grupy (bez etapów umowy). */
  complimentary?: boolean;
}): StudentListPipelineStage {
  const level = String(input.enrollmentStatus ?? "")
    .trim()
    .toUpperCase();
  const contract = String(input.contractStatus ?? "")
    .trim()
    .toUpperCase();
  const hasGroup = Boolean(input.hasGroup);

  if (input.complimentary) {
    if (
      hasGroup ||
      level === "ACCEPTED" ||
      level === "PROPOSED" ||
      level === "COMPLETED" ||
      level === "SIGNED" ||
      level === "AWAITING_CONTRACT" ||
      level === "CONTRACT_READY"
    ) {
      return "Przypisany do grupy";
    }
    return "Zgłoszenie";
  }

  if (
    level === "SIGNED" ||
    level === "COMPLETED" ||
    contract === "SIGNED"
  ) {
    return "Umowa podpisana";
  }
  if (
    level === "AWAITING_CONTRACT" ||
    level === "CONTRACT_READY" ||
    (contract.length > 0 && contract !== "SIGNED")
  ) {
    return "Czeka na umowę";
  }
  if (
    hasGroup ||
    level === "ACCEPTED" ||
    level === "PROPOSED"
  ) {
    return "Przypisany do grupy";
  }
  return "Zgłoszenie";
}

/** Filtry listy zgłoszeń w panelu admina. SIGNED/COMPLETED nie wchodzą na listę (proces zakończony). */
export const ENROLLMENT_LIST_FILTERS = [
  { value: "", label: "Wszystkie" },
  { value: "NEW", label: "Nowe" },
  { value: "COMPLIMENTARY", label: "Tryb bez opłat" },
  /** Dzieci z przypisaną grupą (szkic NEW + proposed_group / legacy ACCEPTED). */
  { value: "ACCEPTED", label: "Grupa przypisana" },
  { value: "CONTRACT_READY", label: "Umowa do podpisu" },
] as const;

/** Statusy ukończone — nie pokazujemy ich w widoku Zgłoszeń. */
const ENROLLMENT_LIST_HIDDEN_STATUSES: ReadonlySet<EnrollmentStatus> = new Set([
  "SIGNED",
  "COMPLETED",
]);

function hasProposedGroup(child: { proposedGroupId?: string | null }): boolean {
  return Boolean(child.proposedGroupId && String(child.proposedGroupId).trim());
}

export type EnrollmentStatusFilterOptions = {
  /** Rodzic na liście school_complimentary_parents — wyklucza z „Nowe”, włącza do „Tryb bez opłat”. */
  parentIsComplimentary?: boolean;
};

/**
 * Filtr listy zgłoszeń.
 * „Grupa przypisana” = status ACCEPTED albo szkic NEW z już wybraną grupą (Zapisz bez wysyłki).
 * „Nowe” = NEW bez przypisanej grupy i bez trybu bez opłat.
 * „Tryb bez opłat” = dzieci rodzica w trybie complimentary (widoczne statusy).
 */
export function filterEnrollmentChildrenByStatus<
  T extends { status: EnrollmentStatus; proposedGroupId?: string | null },
>(children: T[], filter: string, options?: EnrollmentStatusFilterOptions): T[] {
  const visible = children.filter((child) => !ENROLLMENT_LIST_HIDDEN_STATUSES.has(child.status));
  const parentIsComplimentary = Boolean(options?.parentIsComplimentary);

  if (filter === "COMPLIMENTARY") {
    return parentIsComplimentary ? visible : [];
  }

  if (!filter) return visible;

  if (filter === "NEW") {
    if (parentIsComplimentary) return [];
    return visible.filter((child) => child.status === "NEW" && !hasProposedGroup(child));
  }
  if (filter === "ACCEPTED") {
    return visible.filter(
      (child) =>
        child.status === "ACCEPTED" ||
        (child.status === "NEW" && hasProposedGroup(child)),
    );
  }

  const status = filter as EnrollmentStatus;
  return visible.filter((child) => child.status === status);
}

export function enrollmentMatchesStatusFilter(
  children: Array<{ status: EnrollmentStatus; proposedGroupId?: string | null }>,
  filter: string,
  options?: EnrollmentStatusFilterOptions,
): boolean {
  return filterEnrollmentChildrenByStatus(children, filter, options).length > 0;
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
