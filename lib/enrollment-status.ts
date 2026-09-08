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
    : "Grupa przypisana — oczekuje na podpisanie umowy przez rodzica",
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
 * Uproszczony etap listy uczniów:
 * Zgłoszenie → przypisany do grupy (Zapisz) → umowa wysłana (mail z grupą) → umowa podpisana
 */
export const STUDENT_LIST_PIPELINE_STAGES = [
  "Zgłoszenie",
  "Przypisany do grupy",
  "Umowa wysłana",
  "Umowa podpisana",
] as const;

export type StudentListPipelineStage = (typeof STUDENT_LIST_PIPELINE_STAGES)[number];

export function resolveStudentListPipelineStage(input: {
  enrollmentStatus?: string | null;
  hasGroup?: boolean;
  contractStatus?: string | null;
  /** Tryb bez umowy — flow kończy się po wysłaniu maila z loginem i grupą (bez etapów umowy). */
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
      level === "NEGOTIATING" ||
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
  // Mail z grupą wysłany (ACCEPTED/PROPOSED) albo dalszy flow umowy.
  if (
    level === "ACCEPTED" ||
    level === "PROPOSED" ||
    level === "NEGOTIATING" ||
    level === "AWAITING_CONTRACT" ||
    level === "CONTRACT_READY" ||
    (contract.length > 0 && contract !== "SIGNED")
  ) {
    return "Umowa wysłana";
  }
  if (hasGroup) {
    return "Przypisany do grupy";
  }
  return "Zgłoszenie";
}

/** Filtry listy zgłoszeń w panelu admina. „Wszystkie” obejmuje też SIGNED/COMPLETED. */
export const ENROLLMENT_LIST_FILTERS = [
  { value: "", label: "Wszystkie" },
  { value: "NEW", label: "Nowe" },
  { value: "COMPLIMENTARY", label: "Tryb bez umowy" },
  /** Szkic: grupa zapisana (Zapisz), mail z loginem jeszcze niewysłany. */
  { value: "ACCEPTED", label: "Grupa przypisana" },
  /** Mail z danymi do logowania wysłany — rodzic może wygenerować / podpisać umowę. */
  { value: "CONTRACT_READY", label: "Umowa do podpisu" },
] as const;

/** Statusy ukończone — ukryte w filtrach roboczych (Nowe / Grupa / Umowa), widoczne w „Wszystkie” i „Tryb bez umowy”. */
const ENROLLMENT_LIST_HIDDEN_STATUSES: ReadonlySet<EnrollmentStatus> = new Set([
  "SIGNED",
  "COMPLETED",
]);

function hasProposedGroup(child: { proposedGroupId?: string | null }): boolean {
  return Boolean(child.proposedGroupId && String(child.proposedGroupId).trim());
}

export type EnrollmentStatusFilterOptions = {
  /** Rodzic na liście school_complimentary_parents — wyklucza z „Nowe”, włącza do „Tryb bez umowy”. */
  parentIsComplimentary?: boolean;
};

/**
 * Filtr listy zgłoszeń.
 * „Wszystkie” = wszystkie statusy, w tym zakończone (SIGNED/COMPLETED).
 * „Grupa przypisana” = szkic NEW z już wybraną grupą (Zapisz bez wysyłki).
 * „Umowa do podpisu” = mail z loginem wysłany (ACCEPTED) + AWAITING_CONTRACT / CONTRACT_READY.
 * „Nowe” = NEW bez przypisanej grupy i bez trybu bez umowy.
 * „Tryb bez umowy” = dzieci rodzica w trybie complimentary (także zakończone).
 */
export function filterEnrollmentChildrenByStatus<
  T extends { status: EnrollmentStatus; proposedGroupId?: string | null },
>(children: T[], filter: string, options?: EnrollmentStatusFilterOptions): T[] {
  const parentIsComplimentary = Boolean(options?.parentIsComplimentary);
  const activeOnly = children.filter(
    (child) => !ENROLLMENT_LIST_HIDDEN_STATUSES.has(child.status),
  );

  // „Wszystkie” — pełna historia, także przepracowane.
  if (!filter) return children;

  if (filter === "COMPLIMENTARY") {
    return parentIsComplimentary ? children : [];
  }

  if (filter === "NEW") {
    if (parentIsComplimentary) return [];
    return activeOnly.filter((child) => child.status === "NEW" && !hasProposedGroup(child));
  }
  if (filter === "ACCEPTED") {
    // Tylko szkic przed wysyłką — po mailu status = ACCEPTED → „Umowa do podpisu”.
    return activeOnly.filter((child) => child.status === "NEW" && hasProposedGroup(child));
  }
  if (filter === "CONTRACT_READY") {
    return activeOnly.filter(
      (child) =>
        child.status === "ACCEPTED" ||
        child.status === "AWAITING_CONTRACT" ||
        child.status === "CONTRACT_READY",
    );
  }

  const status = filter as EnrollmentStatus;
  return activeOnly.filter((child) => child.status === status);
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
