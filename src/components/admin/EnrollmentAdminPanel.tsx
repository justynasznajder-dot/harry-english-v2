'use client';

import { useCallback, useMemo, useState } from 'react';
import StudentPipelinePanel from '@/src/components/admin/StudentPipelinePanel';
import {
  ENROLLMENT_LIST_FILTERS,
  ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE,
  ENROLLMENT_STATUS_BADGE_BASE,
  ENROLLMENT_STATUS_COLORS,
  ENROLLMENT_STATUS_LABELS,
  filterEnrollmentChildrenByStatus,
  resolveEnrollmentListBadge,
} from '@/lib/enrollment-status';
import { downloadEnrollmentListXlsx, downloadReportedChildrenXlsx } from '@/lib/enrollment-list-xlsx';
import { parsePriceDecimal } from '@/lib/lesson-pricing';
import { parseManualDiscountPercent } from '@/lib/discount-math';
import { isParentInComplimentaryList } from '@/lib/complimentary-parent-list';
import { isEnrollmentProposalEmailEnabled } from '@/lib/enrollment-proposal-email';
import { compareGroupsYoungestToOldest } from '@/src/data/harryEnglishLevels';
import type {
  ComplimentaryParentRow,
  EnrollmentGroupRow,
  EnrollmentParentRow,
} from '@/src/components/enrollment/types';

type ProposalDraft = {
  groupId: string;
  lessonUnitPrice: string;
  monthlyUnitPrice: string;
  yearlyUnitPrice: string;
  discountPercent: string;
};

/** Domyślny % zniżki w trybie bez umowy (manager może zmienić). */
const COMPLIMENTARY_DEFAULT_DISCOUNT_PERCENT = '14';

/** Wyświetlanie w polu: „14.00” → „14” (bez zbędnych zer po przecinku). */
function formatDiscountPercentForInput(raw: unknown): string {
  if (raw == null) return '';
  const trimmed = String(raw).trim();
  if (trimmed === '') return '';
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n)) return trimmed;
  return String(n);
}

function emptyProposalDraft(groupId = ''): ProposalDraft {
  return {
    groupId,
    lessonUnitPrice: '',
    monthlyUnitPrice: '',
    yearlyUnitPrice: '',
    discountPercent: '',
  };
}

/** Etykieta harmonogramu — „brak harmonogramu” gdy brak poprawnego dnia/godziny. */
function groupScheduleLabel(schedule: string | null | undefined): string {
  const text = (schedule ?? '').trim();
  if (!text || text === '-') return 'brak harmonogramu';
  if (text.split(/,\s*/).every((line) => /^Dzień(\s|\d|$)/i.test(line.trim()))) {
    return 'brak harmonogramu';
  }
  return text;
}

function groupServesPreferredLocation(
  group: { location_ids?: string[] } | null | undefined,
  preferredLocationId: string | null | undefined,
): boolean {
  const pref = preferredLocationId?.trim();
  if (!pref) return true;
  if (!group) return false;
  return (group.location_ids ?? []).includes(pref);
}

function splitGroupsByPreferredLocation(
  allGroups: EnrollmentGroupRow[],
  preferredLocationId: string | null | undefined,
): { matching: EnrollmentGroupRow[]; other: EnrollmentGroupRow[] } {
  const pref = preferredLocationId?.trim();
  if (!pref) {
    return { matching: [...allGroups].sort(compareGroupsYoungestToOldest), other: [] };
  }
  const matching: EnrollmentGroupRow[] = [];
  const other: EnrollmentGroupRow[] = [];
  for (const g of allGroups) {
    if (groupServesPreferredLocation(g, pref)) matching.push(g);
    else other.push(g);
  }
  matching.sort(compareGroupsYoungestToOldest);
  other.sort(compareGroupsYoungestToOldest);
  return { matching, other };
}

/** Wszystkie 3 stawki ręczne muszą być podane (sezon bez cennika grupy / rabatów). */
function draftHasRequiredPrices(draft?: ProposalDraft): boolean {
  if (!draft) return false;
  return (
    parsePriceDecimal(draft.yearlyUnitPrice) != null &&
    parsePriceDecimal(draft.monthlyUnitPrice) != null &&
    parsePriceDecimal(draft.lessonUnitPrice) != null
  );
}

/** Tryb bez umowy: wymagane jednorazowa + ratalna; za zajęcia opcjonalne. */
function draftHasComplimentaryRequiredPrices(draft?: ProposalDraft): boolean {
  if (!draft) return false;
  return (
    parsePriceDecimal(draft.yearlyUnitPrice) != null &&
    parsePriceDecimal(draft.monthlyUnitPrice) != null
  );
}

function draftFilledPriceCount(draft?: ProposalDraft): number {
  if (!draft) return 0;
  return [
    draft.yearlyUnitPrice,
    draft.monthlyUnitPrice,
    draft.lessonUnitPrice,
  ].filter((v) => parsePriceDecimal(v) != null).length;
}

/** Częściowo uzupełnione stawki (1–2 z 3) — blokują zapis. */
function draftHasPartialPrices(draft?: ProposalDraft): boolean {
  const n = draftFilledPriceCount(draft);
  return n === 1 || n === 2;
}

/** Tryb bez umowy: coś wpisane, ale brak jednorazowej lub ratalnej. */
function draftHasComplimentaryPartialPrices(draft?: ProposalDraft): boolean {
  if (!draft) return false;
  const n = draftFilledPriceCount(draft);
  if (n === 0) return false;
  return !draftHasComplimentaryRequiredPrices(draft);
}

function draftIsSaveable(draft?: ProposalDraft): boolean {
  return Boolean((draft?.groupId ?? '').trim()) || draftHasRequiredPrices(draft);
}

/** W trybie bez umowy: jednorazowa + ratalna obowiązkowe; grupa opcjonalna. */
function draftIsComplimentarySaveable(draft?: ProposalDraft): boolean {
  return draftHasComplimentaryRequiredPrices(draft);
}

/*
 * Rabaty procentowe (KDR) — wyłączone na ten sezon (ceny ręczne per dziecko).
 * function applyDiscountPreview(...) { ... applyDiscountsToAmount ... }
 */

function EmptyDataPanel({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 text-center">
      <h3 className="text-lg font-semibold text-[#0f6e56]">{title}</h3>
      <p className="mt-3 text-sm text-zinc-600">Brak danych.</p>
    </section>
  );
}

function formatEnrollmentPrice(value: string | number | null | undefined): string {
  const n = parsePriceDecimal(value);
  if (n == null) return '—';
  return `${n.toLocaleString('pl-PL', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })} PLN`;
}

/** Brak pełnego zestawu cen (jednorazowa / ratalna / za zajęcia). */
function childHasMissingEnrollmentPrices(
  child: Pick<
    EnrollmentParentRow['children'][number],
    'yearlyUnitPrice' | 'monthlyUnitPrice' | 'lessonUnitPrice'
  >,
): boolean {
  return (
    parsePriceDecimal(child.yearlyUnitPrice) == null ||
    parsePriceDecimal(child.monthlyUnitPrice) == null ||
    parsePriceDecimal(child.lessonUnitPrice) == null
  );
}

type ReportedChildRow = {
  child: EnrollmentParentRow['children'][number];
  parent: EnrollmentParentRow;
};

/** Wartość selecta: wszystkie lokalizacje w widoku „Zgłoszone dzieci”. */
const REPORTED_CHILDREN_ALL_LOCATIONS = '__all__';

/** Klucz lokalizacji z preferencji zgłoszenia (id albo nazwa). */
function reportedChildLocationKey(
  child: Pick<EnrollmentParentRow['children'][number], 'preferredLocationId' | 'preferredLocation'>,
): string {
  const id = (child.preferredLocationId ?? '').trim();
  if (id) return `id:${id}`;
  const name = (child.preferredLocation ?? '').trim();
  if (name) return `name:${name.toLowerCase()}`;
  return '__none__';
}

function reportedChildLocationLabel(
  child: Pick<EnrollmentParentRow['children'][number], 'preferredLocationId' | 'preferredLocation'>,
): string {
  const name = (child.preferredLocation ?? '').trim();
  if (name) return name;
  const id = (child.preferredLocationId ?? '').trim();
  if (id) return `Lokalizacja (${id.slice(0, 8)}…)`;
  return 'Bez lokalizacji';
}

/** Normalizacja daty urodzenia do YYYY-MM-DD (sortowanie / grupowanie). */
function normalizeBirthDateKey(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rok urodzenia do grupowania (YYYY). */
function normalizeBirthYearKey(raw: string | null | undefined): string {
  const iso = normalizeBirthDateKey(raw);
  if (!iso) return '';
  return iso.slice(0, 4);
}

function formatBirthYearLabel(yearKey: string): string {
  if (!yearKey) return 'Brak daty urodzenia';
  return `Rok ${yearKey}`;
}

export type EnrollmentAdminPanelProps = {
  pushToast: (kind: 'success' | 'error', message: string) => void;
  parents: EnrollmentParentRow[];
  groups: EnrollmentGroupRow[];
  complimentaryParents: ComplimentaryParentRow[];
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number };
  onRefresh: () => Promise<void>;
  onComplimentaryParentsChange?: (parents: ComplimentaryParentRow[]) => void;
};

export default function EnrollmentAdminPanel({
  pushToast,
  parents,
  groups,
  complimentaryParents,
  discountSettings: _discountSettings,
  onRefresh,
  onComplimentaryParentsChange,
}: EnrollmentAdminPanelProps) {
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState('');
  const [studentNameSearch, setStudentNameSearch] = useState('');
  const [expandedGroupPriceKeys, setExpandedGroupPriceKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [unassignedMissingPricesOnly, setUnassignedMissingPricesOnly] = useState(false);
  /** Filtr lokalizacji w widoku „Zgłoszone dzieci” — domyślnie wszystkie. */
  const [reportedChildrenLocationKey, setReportedChildrenLocationKey] = useState(
    REPORTED_CHILDREN_ALL_LOCATIONS,
  );
  /** '' = wszystkie, assigned / unassigned — po proposedGroupId. */
  const [reportedChildrenGroupFilter, setReportedChildrenGroupFilter] = useState<
    '' | 'assigned' | 'unassigned'
  >('');
  const [proposalModalParentId, setProposalModalParentId] = useState<string | null>(null);
  const [submittingProposalRequestId, setSubmittingProposalRequestId] = useState<string | null>(null);
  const [rejectingParentResignationId, setRejectingParentResignationId] = useState<string | null>(
    null,
  );
  const [submittingBatchProposals, setSubmittingBatchProposals] = useState(false);
  const [savingBatchProposals, setSavingBatchProposals] = useState(false);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  const [showOtherLocationGroups, setShowOtherLocationGroups] = useState<
    Record<string, boolean>
  >({});
  const [savingParentDiscountId, setSavingParentDiscountId] = useState<string | null>(null);
  const [savingComplimentaryKey, setSavingComplimentaryKey] = useState<string | null>(null);
  const [exportingList, setExportingList] = useState(false);
  const discountSettings = _discountSettings;

  /** KDR / rodzeństwo — te same pola co checkboxy rodzica. */
  const saveParentDiscounts = useCallback(
    async (
      parent: {
        id: string;
        parentUserId?: string | null;
        email: string;
        discountLargeFamily?: boolean;
        enrollingMultipleChildren?: boolean;
      },
      patch: {
        discountLargeFamily?: boolean;
        enrollingMultipleChildren?: boolean;
      },
    ) => {
      const saveKey = parent.parentUserId ?? parent.id;
      setSavingParentDiscountId(saveKey);
      try {
        const res = await fetch('/api/admin/enrollment/parent-discount', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentUserId: parent.parentUserId,
            parentEmail: parent.email,
            ...patch,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        if (!res.ok) {
          pushToast('error', data?.message ?? 'Nie udało się zapisać zniżki');
          return;
        }
        await onRefresh();
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Błąd zapisu zniżki rodzica',
        );
      } finally {
        setSavingParentDiscountId(null);
      }
    },
    [onRefresh, pushToast],
  );

  const saveParentComplimentary = useCallback(
    async (
      parent: {
        id: string;
        parentUserId?: string | null;
        email: string;
      },
      checked: boolean,
    ) => {
      const email = (parent.email ?? '').trim();
      const parentUserId = (parent.parentUserId ?? '').trim();
      const saveKey = parentUserId || parent.id;
      if (checked && !email && !parentUserId) {
        pushToast('error', 'Brak e-maila rodzica — nie można oznaczyć trybu bez umowy');
        return;
      }

      setSavingComplimentaryKey(saveKey);
      try {
        if (checked) {
          const res = await fetch('/api/admin/discounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              parentUserId
                ? { parentId: parentUserId }
                : { parentEmail: email },
            ),
          });
          const data = (await res.json().catch(() => ({}))) as {
            message?: string;
            complimentaryParents?: ComplimentaryParentRow[];
          };
          if (!res.ok) {
            pushToast('error', data.message ?? 'Nie udało się włączyć trybu bez umowy');
            return;
          }
          if (Array.isArray(data.complimentaryParents)) {
            onComplimentaryParentsChange?.(data.complimentaryParents);
          }
          pushToast('success', 'Włączono tryb bez umowy');
          // Odśwież listę — zapis kończy się dopiero po „Wyślij maila”.
          await onRefresh();
        } else {
          const existing = complimentaryParents.find((row) => {
            if (parentUserId && row.parentId === parentUserId) return true;
            if (!email) return false;
            const rowEmail = row.email.trim().toLowerCase();
            const rowParentEmail = (row.parentEmail ?? '').trim().toLowerCase();
            return rowEmail === email.toLowerCase() || rowParentEmail === email.toLowerCase();
          });
          const res = await fetch('/api/admin/discounts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              existing
                ? { id: existing.id }
                : parentUserId
                  ? { parentId: parentUserId }
                  : { parentEmail: email },
            ),
          });
          const data = (await res.json().catch(() => ({}))) as {
            message?: string;
            complimentaryParents?: ComplimentaryParentRow[];
          };
          if (!res.ok) {
            pushToast('error', data.message ?? 'Nie udało się wyłączyć trybu bez umowy');
            return;
          }
          if (Array.isArray(data.complimentaryParents)) {
            onComplimentaryParentsChange?.(data.complimentaryParents);
          }
          pushToast('success', 'Wyłączono tryb bez umowy');
          await onRefresh();
        }
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Błąd zapisu trybu bez umowy',
        );
      } finally {
        setSavingComplimentaryKey(null);
      }
    },
    [complimentaryParents, onComplimentaryParentsChange, onRefresh, pushToast],
  );

  const proposalParent =
    proposalModalParentId == null
      ? null
      : parents.find((parent) => {
          const pid = proposalModalParentId.trim();
          if (parent.id === pid) return true;
          // Po wysłaniu propozycji API zwraca UUID konta — karty listy mają id = e-mail.
          if ((parent.parentUserId ?? '').trim() === pid) return true;
          const em = (parent.email ?? '').trim().toLowerCase();
          if (em.length > 0 && pid.includes('@') && em === pid.toLowerCase()) return true;
          return false;
        }) ?? null;
  const proposalParentIsComplimentary = useMemo(
    () =>
      proposalParent
        ? isParentInComplimentaryList(proposalParent, complimentaryParents)
        : false,
    [proposalParent, complimentaryParents],
  );

  const openProposalModal = useCallback(
    (parent: EnrollmentParentRow) => {
      const parentIsComplimentary = isParentInComplimentaryList(parent, complimentaryParents);
      setProposalModalParentId(parent.id);
      setProposalDrafts(() => {
        const next: Record<string, ProposalDraft> = {};
        for (const child of parent.children) {
          const draft = emptyProposalDraft(child.proposedGroupId ?? '');
          if (child.lessonUnitPrice != null && child.lessonUnitPrice !== '') {
            draft.lessonUnitPrice = String(child.lessonUnitPrice);
          }
          if (child.monthlyUnitPrice != null && child.monthlyUnitPrice !== '') {
            draft.monthlyUnitPrice = String(child.monthlyUnitPrice);
          }
          if (child.yearlyUnitPrice != null && child.yearlyUnitPrice !== '') {
            draft.yearlyUnitPrice = String(child.yearlyUnitPrice);
          }
          if (child.discountPercent != null && child.discountPercent !== '') {
            draft.discountPercent = formatDiscountPercentForInput(child.discountPercent);
          } else if (parentIsComplimentary) {
            draft.discountPercent = COMPLIMENTARY_DEFAULT_DISCOUNT_PERCENT;
          }
          next[child.requestId] = draft;
        }
        return next;
      });
    },
    [complimentaryParents],
  );
  /** NEW + PROPOSED (retry trybu bez umowy po częściowym zapisie przed COMPLETED). */
  const proposalNewChildren =
    proposalParent?.children.filter(
      (c) =>
        c.status === 'NEW' ||
        (proposalParentIsComplimentary && c.status === 'PROPOSED'),
    ) ?? [];
  const hasAcceptedSibling = (requestId: string) =>
    proposalParent?.children.some(
      (c) => c.requestId !== requestId && c.status === 'ACCEPTED',
    ) ?? false;
  const proposalEmailEnabled = isEnrollmentProposalEmailEnabled(proposalParent?.schoolId);
  const proposalBatchReady =
    proposalNewChildren.length >= 1 &&
    proposalNewChildren.every((c) => {
      const draft = proposalDrafts[c.requestId];
      if (!(draft?.groupId ?? '').trim()) return false;
      return proposalParentIsComplimentary
        ? draftHasComplimentaryRequiredPrices(draft)
        : draftHasRequiredPrices(draft);
    });
  /**
   * Zapisz: wystarczy pełne dane u jednego dziecka; pozostałe mogą być puste.
   * Częściowe stawki u któregokolwiek dziecka blokują zapis.
   * Tryb bez umowy: jednorazowa + ratalna u zapisywanego dziecka; grupa opcjonalna;
   * przy rodzeństwie wystarczy jedno dziecko (reszta później).
   */
  const proposalBatchSaveReady =
    proposalNewChildren.length >= 1 &&
    (proposalParentIsComplimentary
      ? proposalNewChildren.every(
          (c) => !draftHasComplimentaryPartialPrices(proposalDrafts[c.requestId]),
        ) &&
        proposalNewChildren.some((c) => draftIsComplimentarySaveable(proposalDrafts[c.requestId]))
      : proposalNewChildren.every((c) => !draftHasPartialPrices(proposalDrafts[c.requestId])) &&
        proposalNewChildren.some((c) => draftIsSaveable(proposalDrafts[c.requestId])));
  const proposalBatchSaveTitle = (() => {
    if (proposalParentIsComplimentary) {
      if (proposalBatchSaveReady) {
        const anyGroup = proposalNewChildren.some((c) =>
          Boolean((proposalDrafts[c.requestId]?.groupId ?? '').trim()),
        );
        return anyGroup
          ? 'Zapisz grupę i stawki (bez umowy, bez e-maila) — pozostałe dzieci możesz uzupełnić później'
          : 'Zapisz stawki (tryb bez umowy) — grupę możesz przypisać później';
      }
      if (
        proposalNewChildren.some((c) =>
          draftHasComplimentaryPartialPrices(proposalDrafts[c.requestId]),
        )
      ) {
        return 'Uzupełnij stawkę jednorazową i ratalną — za zajęcia jest opcjonalne';
      }
      return 'Podaj stawkę jednorazową i ratalną dla co najmniej jednego dziecka (za zajęcia opcjonalnie)';
    }
    if (proposalBatchSaveReady) {
      const allHaveGroup = proposalNewChildren
        .filter((c) => draftIsSaveable(proposalDrafts[c.requestId]))
        .every((c) => Boolean((proposalDrafts[c.requestId]?.groupId ?? '').trim()));
      return allHaveGroup
        ? 'Zapisz grupę i stawki bez wysyłania e-maila'
        : 'Zapisz stawki (grupę możesz uzupełnić później)';
    }
    if (proposalNewChildren.some((c) => draftHasPartialPrices(proposalDrafts[c.requestId]))) {
      return 'Uzupełnij wszystkie 3 stawki albo wyczyść je — częściowe ceny blokują zapis';
    }
    return 'Wybierz grupę albo podaj wszystkie 3 stawki dla co najmniej jednego dziecka';
  })();

  const buildBatchProposalsPayload = (opts?: { saveOnly?: boolean }) =>
    proposalNewChildren
      .filter((child) => {
        if (!opts?.saveOnly) return true;
        if (proposalParentIsComplimentary) {
          return draftIsComplimentarySaveable(proposalDrafts[child.requestId]);
        }
        return draftIsSaveable(proposalDrafts[child.requestId]);
      })
      .map((child) => {
        const draft = proposalDrafts[child.requestId];
        return {
          requestId: child.requestId,
          groupId: draft?.groupId ?? '',
          lessonUnitPrice: draft?.lessonUnitPrice?.trim() || null,
          monthlyUnitPrice: draft?.monthlyUnitPrice?.trim() || null,
          yearlyUnitPrice: draft?.yearlyUnitPrice?.trim() || null,
          discountPercent: draft?.discountPercent?.trim() || null,
        };
      });

  /** Potwierdzenie przy zmianie wcześniej zapisanej grupy. */
  const confirmGroupChangesIfNeeded = (): boolean => {
    const changes = proposalNewChildren.flatMap((child) => {
      const newGroupId = (proposalDrafts[child.requestId]?.groupId ?? '').trim();
      const prevGroupId = (child.proposedGroupId ?? '').trim();
      if (!newGroupId || !prevGroupId || newGroupId === prevGroupId) return [];
      const prevName = groups.find((g) => g.id === prevGroupId)?.name ?? 'poprzedniej';
      const nextName = groups.find((g) => g.id === newGroupId)?.name ?? 'nowej';
      return [
        `${child.firstName} ${child.lastName}: ${prevName} → ${nextName}`,
      ];
    });
    if (changes.length === 0) return true;
    return window.confirm(
      `Zmiana grupy dla:\n\n${changes.join('\n')}\n\nNa pewno przenieść dziecko do nowej grupy?`,
    );
  };

  const enrollmentStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const filter of ENROLLMENT_LIST_FILTERS) {
      counts[filter.value] = 0;
    }
    for (const parent of parents) {
      const parentIsComplimentary = isParentInComplimentaryList(parent, complimentaryParents);
      for (const filter of ENROLLMENT_LIST_FILTERS) {
        counts[filter.value] += filterEnrollmentChildrenByStatus(
          parent.children,
          filter.value,
          { parentIsComplimentary },
        ).length;
      }
    }
    return counts;
  }, [parents, complimentaryParents]);

  const childrenByProposedGroup = useMemo(() => {
    type Row = {
      child: EnrollmentParentRow['children'][number];
      parent: EnrollmentParentRow;
    };
    const byGroupId = new Map<string, Row[]>();
    const unassigned: Row[] = [];

    for (const parent of parents) {
      for (const child of parent.children) {
        const groupId = (child.proposedGroupId ?? '').trim();
        const row = { child, parent };
        if (!groupId) {
          unassigned.push(row);
          continue;
        }
        const list = byGroupId.get(groupId) ?? [];
        list.push(row);
        byGroupId.set(groupId, list);
      }
    }

    const sortedGroups = [...groups].sort(compareGroupsYoungestToOldest);
    const sections: {
      key: string;
      title: string;
      subtitle?: string;
      rows: Row[];
    }[] = [];

    for (const group of sortedGroups) {
      const rows = byGroupId.get(group.id);
      if (!rows?.length) continue;
      rows.sort((a, b) => {
        const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
        if (last !== 0) return last;
        return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
      });
      sections.push({
        key: group.id,
        title: group.name,
        subtitle:
          [group.location_name, groupScheduleLabel(group.schedule)]
            .filter(Boolean)
            .join(' · ') || undefined,
        rows,
      });
      byGroupId.delete(group.id);
    }

    // Grupy usunięte / nieobecne na liście, ale nadal przypisane w enrollment_requests
    for (const [groupId, rows] of byGroupId) {
      rows.sort((a, b) => {
        const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
        if (last !== 0) return last;
        return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
      });
      sections.push({
        key: groupId,
        title: `Nieznana grupa (${groupId.slice(0, 8)}…)`,
        rows,
      });
    }

    if (unassigned.length > 0) {
      unassigned.sort((a, b) => {
        const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
        if (last !== 0) return last;
        return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
      });
      sections.push({
        key: '__unassigned__',
        title: 'Bez przypisanej grupy',
        rows: unassigned,
      });
    }

    const assignedCount = sections
      .filter((s) => s.key !== '__unassigned__')
      .reduce((sum, s) => sum + s.rows.length, 0);

    return { sections, assignedCount, totalCount: assignedCount + unassigned.length };
  }, [parents, groups]);

  /** Widok „Zgłoszone dzieci”: lokalizacje + grupy po dacie urodzenia. */
  const reportedChildrenView = useMemo(() => {
    const allRows: ReportedChildRow[] = [];
    for (const parent of parents) {
      for (const child of parent.children) {
        allRows.push({ child, parent });
      }
    }

    const locationMap = new Map<string, { key: string; label: string; count: number }>();
    for (const row of allRows) {
      const key = reportedChildLocationKey(row.child);
      const existing = locationMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        locationMap.set(key, {
          key,
          label: reportedChildLocationLabel(row.child),
          count: 1,
        });
      }
    }

    const locations = [...locationMap.values()].sort((a, b) => {
      if (a.key === '__none__') return 1;
      if (b.key === '__none__') return -1;
      return a.label.localeCompare(b.label, 'pl');
    });

    const selectedKey = reportedChildrenLocationKey;
    let rowsForLocation =
      selectedKey === REPORTED_CHILDREN_ALL_LOCATIONS
        ? allRows
        : selectedKey
          ? allRows.filter((row) => reportedChildLocationKey(row.child) === selectedKey)
          : [];

    const locationLabel =
      selectedKey === REPORTED_CHILDREN_ALL_LOCATIONS
        ? 'Wszystkie lokalizacje'
        : selectedKey
          ? (locationMap.get(selectedKey)?.label ?? 'Lokalizacja')
          : '';

    const assignedInLocation = rowsForLocation.filter((row) =>
      Boolean((row.child.proposedGroupId ?? '').trim()),
    ).length;
    const unassignedInLocation = rowsForLocation.length - assignedInLocation;

    if (reportedChildrenGroupFilter === 'assigned') {
      rowsForLocation = rowsForLocation.filter((row) =>
        Boolean((row.child.proposedGroupId ?? '').trim()),
      );
    } else if (reportedChildrenGroupFilter === 'unassigned') {
      rowsForLocation = rowsForLocation.filter(
        (row) => !Boolean((row.child.proposedGroupId ?? '').trim()),
      );
    }

    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const assignedCountByGroupId = new Map<string, number>();
    for (const row of allRows) {
      const gid = (row.child.proposedGroupId ?? '').trim();
      if (!gid) continue;
      assignedCountByGroupId.set(gid, (assignedCountByGroupId.get(gid) ?? 0) + 1);
    }

    const byBirthYear = new Map<string, ReportedChildRow[]>();
    for (const row of rowsForLocation) {
      const yearKey = normalizeBirthYearKey(row.child.birthDate) || '__none__';
      const list = byBirthYear.get(yearKey) ?? [];
      list.push(row);
      byBirthYear.set(yearKey, list);
    }

    const yearKeys = [...byBirthYear.keys()].sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b); // starsze roczniki najpierw
    });

    const sections = yearKeys.map((yearKey) => {
      const rows = byBirthYear.get(yearKey) ?? [];
      rows.sort((a, b) => {
        const birthA = normalizeBirthDateKey(a.child.birthDate);
        const birthB = normalizeBirthDateKey(b.child.birthDate);
        if (birthA && birthB && birthA !== birthB) return birthA.localeCompare(birthB);
        const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
        if (last !== 0) return last;
        return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
      });
      return {
        key: yearKey,
        title: formatBirthYearLabel(yearKey === '__none__' ? '' : yearKey),
        rows,
      };
    });

    return {
      totalCount: allRows.length,
      locations,
      selectedKey,
      locationLabel,
      sections,
      selectedCount: rowsForLocation.length,
      assignedInLocation,
      unassignedInLocation,
      groupNameById,
      assignedCountByGroupId,
    };
  }, [parents, groups, reportedChildrenLocationKey, reportedChildrenGroupFilter]);

  const renderList = () => {
    const isPipeline = enrollmentStatusFilter === 'pipeline';
    const isByGroupPrices = enrollmentStatusFilter === 'by-group-prices';
    const isReportedChildren = enrollmentStatusFilter === 'by-reported-children';
    const studentQuery = studentNameSearch.trim().toLowerCase();
    const enrollmentRows = parents.filter((parent) => parent.children.length > 0);
    const filteredEnrollmentRows = enrollmentRows
      .map((parent) => {
        const parentIsComplimentary = isParentInComplimentaryList(parent, complimentaryParents);
        let children = filterEnrollmentChildrenByStatus(
          parent.children,
          enrollmentStatusFilter,
          { parentIsComplimentary },
        );
        if (studentQuery) {
          children = children.filter((child) => {
            const first = (child.firstName ?? '').toLowerCase();
            const last = (child.lastName ?? '').toLowerCase();
            return (
              first.includes(studentQuery) ||
              last.includes(studentQuery) ||
              `${first} ${last}`.includes(studentQuery)
            );
          });
        }
        return { ...parent, children };
      })
      .filter((parent) => parent.children.length > 0);

    const filteredByGroupSections = isByGroupPrices
      ? childrenByProposedGroup.sections
          .map((section) => {
            if (!studentQuery) return section;
            const rows = section.rows.filter(({ child, parent }) => {
              const first = (child.firstName ?? '').toLowerCase();
              const last = (child.lastName ?? '').toLowerCase();
              const parentName = `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.toLowerCase();
              return (
                first.includes(studentQuery) ||
                last.includes(studentQuery) ||
                `${first} ${last}`.includes(studentQuery) ||
                parentName.includes(studentQuery)
              );
            });
            return { ...section, rows };
          })
          .filter((section) => section.rows.length > 0)
      : [];

    const filteredReportedSections = isReportedChildren
      ? reportedChildrenView.sections
          .map((section) => {
            if (!studentQuery) return section;
            const rows = section.rows.filter(({ child, parent }) => {
              const first = (child.firstName ?? '').toLowerCase();
              const last = (child.lastName ?? '').toLowerCase();
              const parentName = `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.toLowerCase();
              return (
                first.includes(studentQuery) ||
                last.includes(studentQuery) ||
                `${first} ${last}`.includes(studentQuery) ||
                parentName.includes(studentQuery)
              );
            });
            return { ...section, rows };
          })
          .filter((section) => section.rows.length > 0)
      : [];

    return (
      <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Zgłoszenia</h2>

        {!isPipeline && (
          <input
            type="search"
            autoComplete="off"
            value={studentNameSearch}
            onChange={(e) => setStudentNameSearch(e.target.value)}
            placeholder="Szukaj po imieniu lub nazwisku ucznia…"
            className="w-full max-w-md rounded-xl border border-emerald-200 px-3 py-2 text-sm"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {ENROLLMENT_LIST_FILTERS.map((filter) => (
            <button
              key={filter.value || 'all'}
              type="button"
              onClick={() => setEnrollmentStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                enrollmentStatusFilter === filter.value
                  ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                  : 'border-emerald-200 bg-white text-zinc-700'
              }`}
            >
              {filter.label} ({enrollmentStatusCounts[filter.value] ?? 0})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEnrollmentStatusFilter('pipeline')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isPipeline
                ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                : 'border-emerald-200 bg-white text-zinc-700'
            }`}
          >
            Status zapisów ({enrollmentStatusCounts[''] ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setEnrollmentStatusFilter('by-group-prices')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isByGroupPrices
                ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                : 'border-emerald-200 bg-white text-zinc-700'
            }`}
          >
            Grupy i ceny ({childrenByProposedGroup.assignedCount})
          </button>
          <button
            type="button"
            onClick={() => setEnrollmentStatusFilter('by-reported-children')}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isReportedChildren
                ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                : 'border-emerald-200 bg-white text-zinc-700'
            }`}
          >
            Zgłoszone dzieci ({reportedChildrenView.totalCount})
          </button>
          {!isPipeline && !isByGroupPrices && !isReportedChildren && (
            <button
              type="button"
              disabled={exportingList || filteredEnrollmentRows.length === 0}
              onClick={() => {
                void (async () => {
                  if (exportingList || filteredEnrollmentRows.length === 0) return;
                  setExportingList(true);
                  try {
                    const filterLabel =
                      ENROLLMENT_LIST_FILTERS.find((f) => f.value === enrollmentStatusFilter)
                        ?.label ?? 'Zgłoszenia';
                    const groupNameById = Object.fromEntries(
                      groups.map((g) => [g.id, g.name]),
                    );
                    await downloadEnrollmentListXlsx({
                      filterLabel,
                      groupNameById,
                      rows: filteredEnrollmentRows.map((parent) => ({
                        firstName: parent.firstName,
                        lastName: parent.lastName,
                        email: parent.email,
                        complimentary: isParentInComplimentaryList(
                          parent,
                          complimentaryParents,
                        ),
                        children: parent.children,
                      })),
                    });
                  } catch (e) {
                    pushToast(
                      'error',
                      e instanceof Error ? e.message : 'Nie udało się wygenerować pliku Excel',
                    );
                  } finally {
                    setExportingList(false);
                  }
                })();
              }}
              className="ml-auto rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingList ? 'Generowanie…' : 'Pobierz Excel'}
            </button>
          )}
        </div>

        {isPipeline ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Zgłoszenie → przypisany do grupy → umowa wysłana → umowa podpisana
            </p>
            <StudentPipelinePanel
              embedded
              complimentaryParents={complimentaryParents}
            />
          </div>
        ) : isByGroupPrices ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm text-zinc-600">
                Dzieci pogrupowane po proponowanej grupie — ceny z zgłoszenia (
                <span className="font-medium text-zinc-800">
                  jednorazowa / ratalna / za zajęcia
                </span>
                ).
              </p>
              {filteredByGroupSections.length > 0 ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#0f6e56] hover:bg-emerald-50"
                    onClick={() =>
                      setExpandedGroupPriceKeys(
                        new Set(filteredByGroupSections.map((s) => s.key)),
                      )
                    }
                  >
                    Rozwiń wszystkie
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                    onClick={() => setExpandedGroupPriceKeys(new Set())}
                  >
                    Zwiń
                  </button>
                </div>
              ) : null}
            </div>
            {filteredByGroupSections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
                {studentQuery ? 'Brak dzieci dla podanego wyszukiwania' : 'Brak dzieci'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredByGroupSections.map((section) => {
                  const isUnassigned = section.key === '__unassigned__';
                  const displayRows =
                    isUnassigned && unassignedMissingPricesOnly
                      ? section.rows.filter(({ child }) =>
                          childHasMissingEnrollmentPrices(child),
                        )
                      : section.rows;
                  const open =
                    studentQuery.length > 0 || expandedGroupPriceKeys.has(section.key);
                  return (
                    <div
                      key={section.key}
                      className="overflow-hidden rounded-xl border border-emerald-100 bg-white"
                    >
                      <div className="flex items-start gap-2 pr-3">
                        <button
                          type="button"
                          aria-expanded={open}
                          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition hover:bg-emerald-50/50"
                          onClick={() => {
                            if (studentQuery) return;
                            setExpandedGroupPriceKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(section.key)) next.delete(section.key);
                              else next.add(section.key);
                              return next;
                            });
                          }}
                        >
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-zinc-500 transition ${
                              open ? 'rotate-90' : ''
                            }`}
                            aria-hidden
                          >
                            ▸
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-zinc-900">{section.title}</p>
                            {section.subtitle ? (
                              <p className="mt-0.5 text-xs text-zinc-500">{section.subtitle}</p>
                            ) : null}
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-zinc-600 ring-1 ring-emerald-100">
                            {displayRows.length}
                            {isUnassigned &&
                            unassignedMissingPricesOnly &&
                            displayRows.length !== section.rows.length
                              ? ` / ${section.rows.length}`
                              : ''}
                          </span>
                        </button>
                        {isUnassigned ? (
                          <button
                            type="button"
                            className={`mt-2.5 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                              unassignedMissingPricesOnly
                                ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                                : 'border-emerald-200 bg-white text-zinc-700 hover:bg-emerald-50'
                            }`}
                            onClick={() => {
                              setUnassignedMissingPricesOnly((prev) => {
                                const next = !prev;
                                if (next) {
                                  setExpandedGroupPriceKeys((keys) => {
                                    const copy = new Set(keys);
                                    copy.add('__unassigned__');
                                    return copy;
                                  });
                                }
                                return next;
                              });
                            }}
                          >
                            Bez wpisanych cen
                          </button>
                        ) : null}
                      </div>
                      {open ? (
                        displayRows.length === 0 ? (
                          <p className="border-t border-emerald-100 bg-emerald-50/20 px-4 py-4 text-sm text-zinc-600">
                            {unassignedMissingPricesOnly
                              ? 'Brak dzieci bez pełnych cen w tej sekcji'
                              : 'Brak dzieci'}
                          </p>
                        ) : (
                          <ul className="divide-y divide-emerald-100 border-t border-emerald-100 bg-emerald-50/20 px-4">
                            {displayRows.map(({ child, parent }) => {
                              const managerPct = parseManualDiscountPercent(child.discountPercent);
                              const hasKdr = Boolean(parent.discountLargeFamily);
                              const hasSibling = Boolean(parent.enrollingMultipleChildren);
                              const isComplimentary = isParentInComplimentaryList(
                                parent,
                                complimentaryParents,
                              );
                              const hasAnyDiscount =
                                isComplimentary || hasKdr || hasSibling || managerPct != null;
                              return (
                              <li key={child.requestId} className="py-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                  <p className="text-sm font-medium text-zinc-900">
                                    {child.firstName} {child.lastName}
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-[#0f6e56] underline-offset-2 hover:underline"
                                    onClick={() => openProposalModal(parent)}
                                  >
                                    {parent.firstName} {parent.lastName}
                                  </button>
                                </div>
                                {hasAnyDiscount ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {isComplimentary ? (
                                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-inset ring-sky-200">
                                        Tryb bez umowy
                                      </span>
                                    ) : null}
                                    {hasKdr ? (
                                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
                                        KDR {discountSettings.LARGE_FAMILY_CARD}%
                                      </span>
                                    ) : null}
                                    {hasSibling ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">
                                        Rodzeństwo {discountSettings.SIBLING}%
                                      </span>
                                    ) : null}
                                    {managerPct != null ? (
                                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                                        Manager {managerPct}%
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                <dl className="mt-1.5 grid grid-cols-3 gap-1 text-xs">
                                  <div>
                                    <dt className="text-zinc-500">Jednorazowa</dt>
                                    <dd className="font-semibold tabular-nums text-zinc-800">
                                      {formatEnrollmentPrice(child.yearlyUnitPrice)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-zinc-500">Ratalna</dt>
                                    <dd className="font-semibold tabular-nums text-zinc-800">
                                      {formatEnrollmentPrice(child.monthlyUnitPrice)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-zinc-500">Za zajęcia</dt>
                                    <dd className="font-semibold tabular-nums text-zinc-800">
                                      {formatEnrollmentPrice(child.lessonUnitPrice)}
                                    </dd>
                                  </div>
                                </dl>
                              </li>
                              );
                            })}
                          </ul>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : isReportedChildren ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-col gap-1 text-xs font-medium text-zinc-600">
                Lokalizacja
                <select
                  className="rounded-xl border border-emerald-200 px-3 py-2 text-sm text-zinc-900"
                  value={reportedChildrenLocationKey}
                  onChange={(e) => setReportedChildrenLocationKey(e.target.value)}
                >
                  <option value="">Wybierz lokalizację…</option>
                  <option value={REPORTED_CHILDREN_ALL_LOCATIONS}>
                    Wszystkie lokalizacje ({reportedChildrenView.totalCount})
                  </option>
                  {reportedChildrenView.locations.map((loc) => (
                    <option key={loc.key} value={loc.key}>
                      {loc.label} ({loc.count})
                    </option>
                  ))}
                </select>
              </label>
              {reportedChildrenLocationKey ? (
                <div className="flex flex-wrap items-center gap-2 pb-0.5">
                  {(
                    [
                      { value: '' as const, label: 'Wszystkie', count: reportedChildrenView.assignedInLocation + reportedChildrenView.unassignedInLocation },
                      { value: 'unassigned' as const, label: 'Nieprzypisani do grupy', count: reportedChildrenView.unassignedInLocation },
                      { value: 'assigned' as const, label: 'Przypisani do grupy', count: reportedChildrenView.assignedInLocation },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value || 'all-groups'}
                      type="button"
                      onClick={() => setReportedChildrenGroupFilter(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        reportedChildrenGroupFilter === opt.value
                          ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                          : 'border-emerald-200 bg-white text-zinc-700'
                      }`}
                    >
                      {opt.label} ({opt.count})
                    </button>
                  ))}
                </div>
              ) : null}
              {reportedChildrenLocationKey ? (
                <button
                  type="button"
                  disabled={
                    exportingList ||
                    filteredReportedSections.reduce((s, sec) => s + sec.rows.length, 0) === 0
                  }
                  onClick={() => {
                    void (async () => {
                      const exportRows = filteredReportedSections.flatMap((section) =>
                        section.rows.map(({ child, parent }) => {
                          const groupId = (child.proposedGroupId ?? '').trim();
                          const groupName = groupId
                            ? reportedChildrenView.groupNameById.get(groupId) ?? groupId
                            : 'nieprzypisana';
                          const badge = resolveEnrollmentListBadge(child);
                          return {
                            childFirstName: child.firstName,
                            childLastName: child.lastName,
                            birthDate: child.birthDate,
                            birthYear:
                              section.key === '__none__'
                                ? ''
                                : section.key,
                            preferredLocation: child.preferredLocation,
                            parentFirstName: parent.firstName,
                            parentLastName: parent.lastName,
                            parentEmail: parent.email,
                            complimentary: isParentInComplimentaryList(
                              parent,
                              complimentaryParents,
                            ),
                            hasKdr: Boolean(parent.discountLargeFamily),
                            hasSibling: Boolean(parent.enrollingMultipleChildren),
                            managerDiscountPercent: parseManualDiscountPercent(
                              child.discountPercent,
                            ),
                            statusLabel: badge.label,
                            groupName,
                            groupAssignedCount: groupId
                              ? (reportedChildrenView.assignedCountByGroupId.get(groupId) ?? 0)
                              : null,
                            yearlyUnitPrice: child.yearlyUnitPrice,
                            monthlyUnitPrice: child.monthlyUnitPrice,
                            lessonUnitPrice: child.lessonUnitPrice,
                          };
                        }),
                      );
                      if (exportingList || exportRows.length === 0) return;
                      setExportingList(true);
                      try {
                        const groupFilterLabel =
                          reportedChildrenGroupFilter === 'assigned'
                            ? 'przypisani do grupy'
                            : reportedChildrenGroupFilter === 'unassigned'
                              ? 'nieprzypisani do grupy'
                              : 'wszystkie';
                        const filterLabel = [
                          'Zgłoszone dzieci',
                          reportedChildrenView.locationLabel,
                          groupFilterLabel,
                          studentQuery ? `szukaj: ${studentQuery}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        await downloadReportedChildrenXlsx({
                          filterLabel,
                          discountSettings,
                          rows: exportRows,
                        });
                      } catch (e) {
                        pushToast(
                          'error',
                          e instanceof Error
                            ? e.message
                            : 'Nie udało się wygenerować pliku Excel',
                        );
                      } finally {
                        setExportingList(false);
                      }
                    })();
                  }}
                  className="ml-auto rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingList ? 'Generowanie…' : 'Pobierz Excel'}
                </button>
              ) : null}
            </div>
            {reportedChildrenLocationKey ? (
              <p className="text-sm text-zinc-600">
                {filteredReportedSections.reduce((s, sec) => s + sec.rows.length, 0)} dzieci ·
                pogrupowane po roku urodzenia
              </p>
            ) : (
              <p className="text-sm text-zinc-500">
                Wybierz lokalizację, żeby zobaczyć listę dzieci.
              </p>
            )}
            {!reportedChildrenLocationKey ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
                Wybierz lokalizację powyżej
              </p>
            ) : filteredReportedSections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
                {studentQuery
                  ? 'Brak dzieci dla podanego wyszukiwania'
                  : reportedChildrenGroupFilter === 'assigned'
                    ? 'Brak dzieci przypisanych do grupy w tej lokalizacji'
                    : reportedChildrenGroupFilter === 'unassigned'
                      ? 'Brak dzieci bez grupy w tej lokalizacji'
                      : reportedChildrenLocationKey === REPORTED_CHILDREN_ALL_LOCATIONS
                        ? 'Brak dzieci'
                        : 'Brak dzieci w tej lokalizacji'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredReportedSections.map((section) => (
                  <div
                    key={section.key}
                    className="overflow-hidden rounded-xl border border-emerald-100 bg-white"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/40 px-4 py-3">
                      <p className="font-semibold text-zinc-900">{section.title}</p>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 ring-1 ring-emerald-100">
                        {section.rows.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-emerald-100 px-4">
                      {section.rows.map(({ child, parent }) => {
                        const badge = resolveEnrollmentListBadge(child);
                        const groupId = (child.proposedGroupId ?? '').trim();
                        const groupName = groupId
                          ? reportedChildrenView.groupNameById.get(groupId) ??
                            `Nieznana grupa (${groupId.slice(0, 8)}…)`
                          : null;
                        const groupAssignedCount = groupId
                          ? (reportedChildrenView.assignedCountByGroupId.get(groupId) ?? 0)
                          : 0;
                        const managerPct = parseManualDiscountPercent(child.discountPercent);
                        const hasKdr = Boolean(parent.discountLargeFamily);
                        const hasSibling = Boolean(parent.enrollingMultipleChildren);
                        const isComplimentary = isParentInComplimentaryList(
                          parent,
                          complimentaryParents,
                        );
                        const hasAnyDiscount =
                          isComplimentary || hasKdr || hasSibling || managerPct != null;
                        return (
                          <li
                            key={child.requestId}
                            className="grid grid-cols-1 items-start gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,42%)_minmax(0,1fr)_minmax(7rem,auto)]"
                          >
                            <div className="min-w-0 overflow-hidden">
                              <p className="text-sm font-medium text-zinc-900">
                                {child.firstName} {child.lastName}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                Rodzic:{' '}
                                <button
                                  type="button"
                                  className="font-medium text-[#0f6e56] underline-offset-2 hover:underline"
                                  onClick={() => openProposalModal(parent)}
                                >
                                  {parent.firstName} {parent.lastName}
                                </button>
                                {parent.email ? ` · ${parent.email}` : ''}
                              </p>
                              {hasAnyDiscount ? (
                                <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5">
                                  {isComplimentary ? (
                                    <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-inset ring-sky-200">
                                      Tryb bez umowy
                                    </span>
                                  ) : null}
                                  {hasKdr ? (
                                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
                                      KDR {discountSettings.LARGE_FAMILY_CARD}%
                                    </span>
                                  ) : null}
                                  {hasSibling ? (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">
                                      Rodzeństwo {discountSettings.SIBLING}%
                                    </span>
                                  ) : null}
                                  {managerPct != null ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">
                                      Manager {managerPct}%
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <p className="min-w-0 self-center text-left text-sm text-zinc-700">
                              <span className="font-medium text-zinc-900">
                                {groupName
                                  ? `${groupName} (${groupAssignedCount})`
                                  : 'nieprzypisana'}
                              </span>
                            </p>
                            <span
                              className={`${ENROLLMENT_STATUS_BADGE_BASE} ${badge.colorClass} h-auto max-w-[11rem] justify-self-start self-center whitespace-normal py-1 text-center text-[10px] leading-snug sm:justify-self-end`}
                            >
                              {badge.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : enrollmentRows.length === 0 ? (
          <EmptyDataPanel title="Zgłoszenia" />
        ) : filteredEnrollmentRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            {studentQuery ? 'Brak zgłoszeń dla podanego ucznia' : 'Brak zgłoszeń'}
          </p>
        ) : (
          <div className="space-y-3">
          {filteredEnrollmentRows.map((parent) => {
            const isNegotiating =
              parent.accessLevel === 'NEGOTIATING' ||
              parent.children.some(
                (child) =>
                  child.status === 'NEGOTIATING' || child.childAccessLevel === 'NEGOTIATING',
              );
            const parentIsComplimentary = isParentInComplimentaryList(parent, complimentaryParents);
            return (
            <div
              key={parent.id}
              className={`rounded-xl border p-4 ${
                isNegotiating
                  ? 'border-amber-300 bg-amber-50/80'
                  : 'border-emerald-100 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {parent.firstName} {parent.lastName}
                  </p>
                  <p className="text-sm text-zinc-600">{parent.email}</p>
                  {parentIsComplimentary && (
                    <p className="mt-1 text-xs font-medium text-sky-800">Tryb bez umowy</p>
                  )}
                </div>
                <button
                  className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm text-white"
                  onClick={() => openProposalModal(parent)}
                >
                  Zobacz szczegóły
                </button>
              </div>
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Dzieci
                </p>
                <ul className="space-y-2">
                  {parent.children.map((child) => {
                    const badge = resolveEnrollmentListBadge(child);
                    return (
                      <li
                        key={child.requestId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                      >
                        <span className="font-medium text-zinc-900">
                          {child.firstName} {child.lastName}
                        </span>
                        <span
                          className={`${ENROLLMENT_STATUS_BADGE_BASE} ${badge.colorClass}`}
                        >
                          {badge.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            );
          })}
          </div>
          )}
        </section>
      );
  };

  return (
    <>
      {renderList()}
            {proposalModalParentId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white">
            <div className="shrink-0 border-b border-emerald-100 px-5 py-3">
              <h3 className="text-lg font-semibold">Szczegóły zgłoszenia</h3>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {proposalParent ? (
              <div className="mt-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Rodzic
                  </p>
                  <p className="mt-1 break-words text-lg font-semibold leading-tight text-zinc-900">
                    {proposalParent.firstName} {proposalParent.lastName}
                  </p>
                  <p className="mt-1 break-all text-sm text-zinc-600">{proposalParent.email}</p>
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Rozliczenia
                    </p>
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={proposalParentIsComplimentary}
                        disabled={
                          savingComplimentaryKey ===
                            (proposalParent.parentUserId ?? proposalParent.id) ||
                          (!(proposalParent.email ?? '').trim() &&
                            !(proposalParent.parentUserId ?? '').trim())
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            setProposalDrafts((prev) => {
                              const next = { ...prev };
                              for (const child of proposalParent.children) {
                                const existing =
                                  next[child.requestId] ??
                                  emptyProposalDraft(child.proposedGroupId ?? '');
                                next[child.requestId] = {
                                  ...existing,
                                  discountPercent: COMPLIMENTARY_DEFAULT_DISCOUNT_PERCENT,
                                };
                              }
                              return next;
                            });
                          }
                          void saveParentComplimentary(proposalParent, checked);
                        }}
                      />
                      Tryb bez umowy
                    </label>
                    <p className="mt-1 text-xs text-zinc-500">
                      Bez umowy, faktur i płatności. Zapis kończy się dopiero po „Wyślij maila”
                      (login + grupa + termin). „Zapisz” tylko utrwala stawki/grupę. Podaj
                      jednorazową i ratalną — widoczne w panelu rodzica; za zajęcia i % zniżki
                      opcjonalne. Grupę możesz przypisać później.
                    </p>
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-zinc-500">
                        {proposalParentIsComplimentary ? (
                          <>
                            Tryb bez umowy — rabaty się sumują: % managera + KDR{' '}
                            {discountSettings.LARGE_FAMILY_CARD}% + rodzeństwo{' '}
                            {discountSettings.SIBLING}%.
                          </>
                        ) : (
                          <>
                            Rabaty jak u rodzica — nie sumują się (najwyższy: szkoła / KDR{' '}
                            {discountSettings.LARGE_FAMILY_CARD}% / rodzeństwo{' '}
                            {discountSettings.SIBLING}%). Po pierwszym logowaniu rodzic widzi
                            zaznaczone opcje i naliczone rabaty.
                          </>
                        )}
                      </p>
                      <label
                        className={`inline-flex items-center gap-2 text-sm ${
                          !proposalParentIsComplimentary &&
                          Boolean(proposalParent.enrollingMultipleChildren)
                            ? 'text-zinc-400'
                            : 'text-zinc-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            proposalParentIsComplimentary
                              ? Boolean(proposalParent.discountLargeFamily)
                              : Boolean(proposalParent.discountLargeFamily) &&
                                !Boolean(proposalParent.enrollingMultipleChildren)
                          }
                          disabled={
                            savingParentDiscountId ===
                              (proposalParent.parentUserId ?? proposalParent.id) ||
                            (!proposalParentIsComplimentary &&
                              Boolean(proposalParent.enrollingMultipleChildren)) ||
                            (!(proposalParent.email ?? '').trim() &&
                              !(proposalParent.parentUserId ?? '').trim())
                          }
                          onChange={(e) => {
                            if (proposalParentIsComplimentary) {
                              void saveParentDiscounts(proposalParent, {
                                discountLargeFamily: e.target.checked,
                              });
                              return;
                            }
                            void saveParentDiscounts(proposalParent, {
                              discountLargeFamily: e.target.checked,
                              enrollingMultipleChildren: e.target.checked
                                ? false
                                : Boolean(proposalParent.enrollingMultipleChildren),
                            });
                          }}
                        />
                        Karta Dużej Rodziny ({discountSettings.LARGE_FAMILY_CARD}%)
                      </label>
                      <label
                        className={`flex items-center gap-2 text-sm ${
                          !proposalParentIsComplimentary &&
                          Boolean(proposalParent.discountLargeFamily)
                            ? 'text-zinc-400'
                            : 'text-zinc-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            proposalParentIsComplimentary
                              ? Boolean(proposalParent.enrollingMultipleChildren)
                              : Boolean(proposalParent.enrollingMultipleChildren) &&
                                !Boolean(proposalParent.discountLargeFamily)
                          }
                          disabled={
                            savingParentDiscountId ===
                              (proposalParent.parentUserId ?? proposalParent.id) ||
                            (!proposalParentIsComplimentary &&
                              Boolean(proposalParent.discountLargeFamily)) ||
                            (!(proposalParent.email ?? '').trim() &&
                              !(proposalParent.parentUserId ?? '').trim())
                          }
                          onChange={(e) => {
                            if (proposalParentIsComplimentary) {
                              void saveParentDiscounts(proposalParent, {
                                enrollingMultipleChildren: e.target.checked,
                              });
                              return;
                            }
                            void saveParentDiscounts(proposalParent, {
                              enrollingMultipleChildren: e.target.checked,
                              discountLargeFamily: e.target.checked
                                ? false
                                : Boolean(proposalParent.discountLargeFamily),
                            });
                          }}
                        />
                        Więcej niż jedno dziecko ({discountSettings.SIBLING}%)
                      </label>
                      {!(proposalParent.parentUserId ?? '').trim() &&
                        Boolean((proposalParent.email ?? '').trim()) && (
                          <p className="text-xs text-zinc-500">
                            Zapis na zgłoszeniu; po utworzeniu konta rodzic zobaczy to przy
                            pierwszym logowaniu.
                          </p>
                        )}
                    </div>
                  </div>
                  {proposalParentIsComplimentary && (
                    <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      Rodzic jest w trybie bez umowy — wyślij potwierdzenie o przypisaniu do
                      grupy i terminie zajęć.
                    </p>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {proposalParent.children.map((child) => {
                    const proposalAllowed =
                      child.status === 'NEW' || child.status === 'NEGOTIATING';
                    const listBadge = resolveEnrollmentListBadge(child);
                    const proposedGroup =
                      child.proposedGroupId
                        ? groups.find((g) => g.id === child.proposedGroupId)
                        : null;
                    const proposedAtFormatted = child.proposedAt
                      ? (() => {
                          const d = new Date(child.proposedAt as string);
                          return Number.isNaN(d.getTime())
                            ? child.proposedAt
                            : d.toLocaleString('pl-PL', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              });
                        })()
                      : null;
                    return (
                    <div key={child.requestId} className="rounded-xl border border-emerald-100 p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="font-semibold">
                            {child.firstName} {child.lastName}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-2">
                            <span
                              className={`${ENROLLMENT_STATUS_BADGE_BASE} ${listBadge.colorClass}`}
                            >
                              Zgłoszenie: {listBadge.label}
                            </span>
                            {child.childAccessLevel && child.childAccessLevel !== child.status && (
                              <span
                                className={`${ENROLLMENT_STATUS_BADGE_BASE} ${ENROLLMENT_STATUS_COLORS[child.childAccessLevel] ?? 'bg-zinc-100 text-zinc-700'}`}
                              >
                                Dziecko:{' '}
                                {ENROLLMENT_STATUS_LABELS[child.childAccessLevel] ?? child.childAccessLevel}
                              </span>
                            )}
                          </p>
                          <p className="mt-2 text-sm text-zinc-600">Data urodzenia: {child.birthDate ?? 'brak'}</p>
                          <p className="text-sm text-zinc-600">
                            Preferowana lokalizacja: {child.preferredLocation ?? 'brak'}
                          </p>
                          {child.lessonsPerWeek === 1 || child.lessonsPerWeek === 2 ? (
                            <p className="text-sm text-zinc-600">
                              Częstotliwość: {child.lessonsPerWeek === 1 ? '1× w tygodniu' : '2× w tygodniu'}
                            </p>
                          ) : null}
                        </div>
                        <div className="min-w-0 space-y-2">
                          {child.status === 'PROPOSED' && (
                            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                              <p className="font-semibold text-sky-900">Propozycja wysłana</p>
                              {proposedGroup ? (
                                <p className="mt-1 text-sky-900">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : (
                                <p className="mt-1 text-sky-900">
                                  (nie udało się dopasować grupy w aktualnej liście)
                                </p>
                              )}
                              {proposedAtFormatted && (
                                <p className="mt-1 text-xs text-sky-800">
                                  Wysłano: {proposedAtFormatted}
                                </p>
                              )}
                              <p className="mt-2 text-xs text-sky-800">
                                Czekamy na decyzję rodzica
                              </p>
                            </div>
                          )}
                          {child.status === 'NEGOTIATING' && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                              <p className="font-semibold text-amber-950">
                                Rodzic nie zaakceptował terminu zajęć
                              </p>
                              {proposedGroup ? (
                                <p className="mt-1 text-amber-950">
                                  Poprzednia propozycja: {proposedGroup.name} ·{' '}
                                  {proposedGroup.location_name} · {proposedGroup.schedule}
                                </p>
                              ) : (
                                <p className="mt-1 text-amber-950">
                                  (nie udało się dopasować poprzedniej grupy w aktualnej liście)
                                </p>
                              )}
                              <p className="mt-2 text-xs text-amber-900">
                                Wyślij nową propozycję grupy poniżej.
                              </p>
                            </div>
                          )}
                          {(child.status === 'ACCEPTED' ||
                            (child.status === 'NEW' && Boolean(child.proposedGroupId))) && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                              <p className="font-semibold text-emerald-900">
                                Grupa przypisana
                              </p>
                              {proposedGroup ? (
                                <p className="mt-1 text-emerald-900">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-emerald-800">
                                {child.status === 'NEW'
                                  ? 'Szkic: grupa zapisana, propozycja jeszcze nie wysłana.'
                                  : ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
                                    ? 'Rodzic uzupełnia dane do umowy.'
                                    : 'Czekamy na podpisanie umowy przez rodzica.'}
                              </p>
                            </div>
                          )}
                          {child.status === 'AWAITING_CONTRACT' && (
                            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm">
                              <p className="font-semibold text-violet-950">
                                Dane uzupełnione — generowanie / podpis umowy
                              </p>
                              {proposedGroup ? (
                                <p className="mt-1 text-violet-950">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-violet-900">
                                Rodzic zapisał dane — umowa generuje się automatycznie w portalu.
                              </p>
                            </div>
                          )}
                          {child.status === 'CONTRACT_READY' && (
                            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
                              <p className="font-semibold text-indigo-950">
                                Umowa gotowa — oczekuje na podpis rodzica
                              </p>
                              {proposedGroup ? (
                                <p className="mt-1 text-indigo-950">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : null}
                            </div>
                          )}
                          {(child.status === 'SIGNED' || child.status === 'COMPLETED') && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                              <p className="font-semibold text-emerald-900">
                                {child.status === 'SIGNED'
                                  ? 'Umowa podpisana — uczeń w grupie'
                                  : 'Zapis zakończony — uczeń w grupie'}
                              </p>
                              {proposedGroup ? (
                                <p className="mt-1 text-emerald-900">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : (
                                <p className="mt-1 text-emerald-900">
                                  (grupa niedostępna w aktualnej liście — sprawdź w zakładce Grupy)
                                </p>
                              )}
                            </div>
                          )}
                          {child.status === 'REJECTED' && (
                            <p className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                              Zgłoszenie odrzucone (rezygnacja rodzica lub decyzja szkoły).
                            </p>
                          )}
                          {proposalAllowed && (
                            <>
                              <div className="space-y-2">
                                {(() => {
                                  const { matching, other } = splitGroupsByPreferredLocation(
                                    groups,
                                    child.preferredLocationId,
                                  );
                                  const selectedGroupId =
                                    proposalDrafts[child.requestId]?.groupId ?? '';
                                  const selectedInOther = other.some(
                                    (g) => g.id === selectedGroupId,
                                  );
                                  const allowOther =
                                    showOtherLocationGroups[child.requestId] === true ||
                                    selectedInOther;
                                  const hasPreferred = Boolean(
                                    child.preferredLocationId?.trim(),
                                  );

                                  return (
                                    <>
                                      <select
                                        className="w-full max-w-full rounded-xl border border-emerald-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={!proposalAllowed}
                                        value={selectedGroupId}
                                        onChange={(e) =>
                                          setProposalDrafts((prev) => ({
                                            ...prev,
                                            [child.requestId]: {
                                              ...emptyProposalDraft(),
                                              ...prev[child.requestId],
                                              groupId: e.target.value,
                                            },
                                          }))
                                        }
                                      >
                                        <option value="">Wybierz grupę</option>
                                        {matching.map((group) => {
                                          const label = `${group.name} · ${group.location_name} · ${group.schedule}`;
                                          return (
                                            <option
                                              key={group.id}
                                              value={group.id}
                                              title={label}
                                            >
                                              {label}
                                            </option>
                                          );
                                        })}
                                        {allowOther && other.length > 0 ? (
                                          <optgroup label="Inne lokalizacje">
                                            {other.map((group) => {
                                              const label = `${group.name} · ${group.location_name} · ${group.schedule}`;
                                              return (
                                                <option
                                                  key={group.id}
                                                  value={group.id}
                                                  title={label}
                                                >
                                                  {label}
                                                </option>
                                              );
                                            })}
                                          </optgroup>
                                        ) : null}
                                      </select>
                                      {hasPreferred && other.length > 0 ? (
                                        <label className="flex items-start gap-2 text-xs text-zinc-700">
                                          <input
                                            type="checkbox"
                                            className="mt-0.5 accent-emerald-600"
                                            checked={allowOther}
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              setShowOtherLocationGroups((prev) => ({
                                                ...prev,
                                                [child.requestId]: checked,
                                              }));
                                              if (!checked && selectedInOther) {
                                                setProposalDrafts((prev) => ({
                                                  ...prev,
                                                  [child.requestId]: {
                                                    ...emptyProposalDraft(),
                                                    ...prev[child.requestId],
                                                    groupId: '',
                                                  },
                                                }));
                                              }
                                            }}
                                          />
                                          <span>
                                            Wybierz grupę z innej lokalizacji
                                            {child.preferredLocation
                                              ? ` (poza: ${child.preferredLocation})`
                                              : ''}
                                          </span>
                                        </label>
                                      ) : null}
                                      {hasPreferred && matching.length === 0 ? (
                                        <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                          Brak grup w lokalizacji{' '}
                                          {child.preferredLocation ?? 'wybranej przez rodzica'}.
                                          Zaznacz „Wybierz grupę z innej lokalizacji”, żeby zobaczyć
                                          pozostałe.
                                        </p>
                                      ) : null}
                                    </>
                                  );
                                })()}
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
                                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                                    <span className="leading-snug">
                                      Jednorazowa{' '}
                                      <span className="font-normal text-zinc-400">(PLN)</span>
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      required
                                      className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                      disabled={!proposalAllowed}
                                      placeholder="np. 1200"
                                      value={
                                        proposalDrafts[child.requestId]?.yearlyUnitPrice ?? ''
                                      }
                                      onChange={(e) =>
                                        setProposalDrafts((prev) => ({
                                          ...prev,
                                          [child.requestId]: {
                                            ...emptyProposalDraft(),
                                            ...prev[child.requestId],
                                            yearlyUnitPrice: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                                    <span className="leading-snug">
                                      Ratalna{' '}
                                      <span className="font-normal text-zinc-400">(PLN)</span>
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      required
                                      className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                      disabled={!proposalAllowed}
                                      placeholder="np. 150"
                                      value={
                                        proposalDrafts[child.requestId]?.monthlyUnitPrice ?? ''
                                      }
                                      onChange={(e) =>
                                        setProposalDrafts((prev) => ({
                                          ...prev,
                                          [child.requestId]: {
                                            ...emptyProposalDraft(),
                                            ...prev[child.requestId],
                                            monthlyUnitPrice: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                                    <span className="leading-snug">
                                      Za zajęcia{' '}
                                      <span className="font-normal text-zinc-400">(PLN)</span>
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      required={!proposalParentIsComplimentary}
                                      className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                      disabled={!proposalAllowed}
                                      placeholder={
                                        proposalParentIsComplimentary ? 'opcjonalnie' : 'np. 50'
                                      }
                                      value={
                                        proposalDrafts[child.requestId]?.lessonUnitPrice ?? ''
                                      }
                                      onChange={(e) =>
                                        setProposalDrafts((prev) => ({
                                          ...prev,
                                          [child.requestId]: {
                                            ...emptyProposalDraft(),
                                            ...prev[child.requestId],
                                            lessonUnitPrice: e.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </label>
                                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
                                    <span className="leading-snug">% zniżki</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                      disabled={!proposalAllowed}
                                      placeholder="0–100"
                                      value={
                                        proposalDrafts[child.requestId]?.discountPercent ?? ''
                                      }
                                      onChange={(e) =>
                                        setProposalDrafts((prev) => ({
                                          ...prev,
                                          [child.requestId]: {
                                            ...emptyProposalDraft(),
                                            ...prev[child.requestId],
                                            discountPercent: e.target.value,
                                          },
                                        }))
                                      }
                                      onBlur={(e) => {
                                        const formatted = formatDiscountPercentForInput(
                                          e.target.value,
                                        );
                                        if (
                                          formatted ===
                                          (proposalDrafts[child.requestId]?.discountPercent ?? '')
                                        ) {
                                          return;
                                        }
                                        setProposalDrafts((prev) => ({
                                          ...prev,
                                          [child.requestId]: {
                                            ...emptyProposalDraft(),
                                            ...prev[child.requestId],
                                            discountPercent: formatted,
                                          },
                                        }));
                                      }}
                                    />
                                  </label>
                                </div>
                                {(() => {
                                  const selectedGroupId =
                                    proposalDrafts[child.requestId]?.groupId ?? '';
                                  const selectedGroup = selectedGroupId
                                    ? groups.find((g) => g.id === selectedGroupId)
                                    : null;
                                  const locationMismatch =
                                    !!selectedGroup &&
                                    !!child.preferredLocationId?.trim() &&
                                    !groupServesPreferredLocation(
                                      selectedGroup,
                                      child.preferredLocationId,
                                    );
                                  if (!locationMismatch) return null;
                                  return (
                                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                      Wybrana grupa nie prowadzi zajęć w lokalizacji{' '}
                                      {child.preferredLocation ?? 'wybranej przez rodzica'}. Możesz
                                      mimo to wysłać propozycję.
                                    </p>
                                  );
                                })()}
                              </div>
                              {/*
                               * Cennik grupy + podgląd rabatów KDR — wyłączone (ceny ręczne).
                               * Poprzednio: odczyt price_* z grupy + applyDiscountPreview.
                               */}
                              <div className="flex flex-wrap gap-2">
                                {child.status === 'NEGOTIATING' && (
                                  <button
                                    type="button"
                                    disabled={
                                      submittingProposalRequestId === child.requestId ||
                                      rejectingParentResignationId === child.requestId ||
                                      submittingBatchProposals ||
                                      savingBatchProposals
                                    }
                                    className="rounded-xl bg-emerald-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={async () => {
                                      const draft = proposalDrafts[child.requestId];
                                      const groupId = draft?.groupId ?? '';
                                      if (!groupId) {
                                        pushToast('error', 'Wybierz grupę');
                                        return;
                                      }
                                      if (
                                        proposalParentIsComplimentary
                                          ? !draftHasComplimentaryRequiredPrices(draft)
                                          : !draftHasRequiredPrices(draft)
                                      ) {
                                        pushToast(
                                          'error',
                                          proposalParentIsComplimentary
                                            ? 'Podaj stawkę jednorazową i ratalną (za zajęcia opcjonalnie)'
                                            : 'Podaj wszystkie 3 stawki: jednorazową, ratalną i za pojedyncze zajęcia',
                                        );
                                        return;
                                      }
                                      setSubmittingProposalRequestId(child.requestId);
                                      try {
                                        const res = await fetch('/api/admin/enrollment', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            requestId: child.requestId,
                                            groupId,
                                            lessonUnitPrice:
                                              proposalDrafts[child.requestId]?.lessonUnitPrice?.trim() ||
                                              null,
                                            monthlyUnitPrice:
                                              proposalDrafts[child.requestId]?.monthlyUnitPrice?.trim() ||
                                              null,
                                            yearlyUnitPrice:
                                              proposalDrafts[child.requestId]?.yearlyUnitPrice?.trim() ||
                                              null,
                                            discountPercent:
                                              proposalDrafts[child.requestId]?.discountPercent?.trim() ||
                                              null,
                                          }),
                                        });
                                        const data = (await res.json().catch(() => ({}))) as {
                                          message?: string;
                                          parentId?: string;
                                        };
                                        if (!res.ok) {
                                          pushToast(
                                            'error',
                                            data?.message ?? 'Nie udało się wysłać propozycji',
                                          );
                                          return;
                                        }
                                        pushToast(
                                          'success',
                                          `Wysłano nową propozycję dla: ${child.firstName} ${child.lastName}`,
                                        );
                                        setProposalDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[child.requestId];
                                          return next;
                                        });
                                        setProposalModalParentId(null);
                                        await onRefresh();
                                      } catch (err) {
                                        pushToast(
                                          'error',
                                          err instanceof Error
                                            ? err.message
                                            : 'Błąd wysyłania propozycji',
                                        );
                                      } finally {
                                        setSubmittingProposalRequestId(null);
                                      }
                                    }}
                                  >
                                    {submittingProposalRequestId === child.requestId
                                      ? 'Wysyłanie…'
                                      : hasAcceptedSibling(child.requestId)
                                        ? 'Wyślij nową propozycję dla tego dziecka'
                                        : 'Wyślij nową propozycję'}
                                  </button>
                                )}
                                {child.status === 'NEGOTIATING' && (
                                  <button
                                    type="button"
                                    disabled={
                                      submittingProposalRequestId === child.requestId ||
                                      rejectingParentResignationId === child.requestId ||
                                      submittingBatchProposals ||
                                      savingBatchProposals
                                    }
                                    className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={async () => {
                                      const confirmed = window.confirm(
                                        `Oznaczyć rezygnację rodzica dla ${child.firstName} ${child.lastName}? Zgłoszenie zostanie odrzucone.`,
                                      );
                                      if (!confirmed) return;
                                      setRejectingParentResignationId(child.requestId);
                                      try {
                                        const res = await fetch('/api/admin/enrollment/reject', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ requestId: child.requestId }),
                                        });
                                        const data = (await res.json().catch(() => ({}))) as {
                                          message?: string;
                                        };
                                        if (!res.ok) {
                                          pushToast(
                                            'error',
                                            data?.message ??
                                              'Nie udało się oznaczyć rezygnacji rodzica',
                                          );
                                          return;
                                        }
                                        pushToast(
                                          'success',
                                          data.message ??
                                            'Zgłoszenie oznaczone jako rezygnacja rodzica.',
                                        );
                                        setProposalDrafts((prev) => {
                                          const next = { ...prev };
                                          delete next[child.requestId];
                                          return next;
                                        });
                                        await onRefresh();
                                      } catch (err) {
                                        pushToast(
                                          'error',
                                          err instanceof Error
                                            ? err.message
                                            : 'Błąd oznaczania rezygnacji rodzica',
                                        );
                                      } finally {
                                        setRejectingParentResignationId(null);
                                      }
                                    }}
                                  >
                                    {rejectingParentResignationId === child.requestId
                                      ? 'Zapisywanie…'
                                      : 'Rezygnacja po stronie rodzica'}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">Nie znaleziono szczegółów zgłoszenia.</p>
            )}
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 px-5 py-3">
              {proposalNewChildren.length >= 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      !proposalBatchSaveReady ||
                      savingBatchProposals ||
                      submittingBatchProposals ||
                      submittingProposalRequestId != null ||
                      rejectingParentResignationId != null
                    }
                    title={proposalBatchSaveTitle}
                    className="rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!confirmGroupChangesIfNeeded()) return;
                      setSavingBatchProposals(true);
                      try {
                        const proposals = buildBatchProposalsPayload({ saveOnly: true });
                        if (proposals.length === 0) {
                          pushToast(
                            'error',
                            proposalParentIsComplimentary
                              ? 'Podaj stawkę jednorazową i ratalną dla co najmniej jednego dziecka'
                              : 'Brak danych do zapisu',
                          );
                          return;
                        }
                        const res = await fetch('/api/admin/enrollment/batch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            proposals,
                            sendEmail: false,
                            allowEmptyPrices: true,
                            complimentaryMode: proposalParentIsComplimentary,
                          }),
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                          message?: string;
                          count?: number;
                        };
                        if (!res.ok) {
                          pushToast(
                            'error',
                            data?.message ?? 'Nie udało się zapisać danych propozycji',
                          );
                          return;
                        }
                        pushToast(
                          'success',
                          data.message ??
                            (proposalParentIsComplimentary
                              ? `Zapisano (${data.count ?? proposals.length}) — bez umowy`
                              : `Zapisano dane propozycji (${data.count ?? proposals.length}) — dziecko w grupie jako niepotwierdzone`),
                        );
                        setProposalModalParentId(null);
                        await onRefresh();
                      } catch (err) {
                        pushToast(
                          'error',
                          err instanceof Error ? err.message : 'Błąd zapisu propozycji',
                        );
                      } finally {
                        setSavingBatchProposals(false);
                      }
                    }}
                  >
                    {savingBatchProposals ? 'Zapisywanie…' : 'Zapisz'}
                  </button>
                  {/* Wysyłka maila (zajęcia + login/hasło) — tylko szkoły z allowlisty. */}
                  <button
                    type="button"
                    disabled={
                      !proposalEmailEnabled ||
                      !proposalBatchReady ||
                      submittingBatchProposals ||
                      savingBatchProposals ||
                      submittingProposalRequestId != null ||
                      rejectingParentResignationId != null
                    }
                    title={
                      proposalEmailEnabled
                        ? undefined
                        : 'Wysyłka maila wyłączona dla tej szkoły — na razie tylko zapis przydziału'
                    }
                    className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!confirmGroupChangesIfNeeded()) return;
                      setSubmittingBatchProposals(true);
                      try {
                        const proposals = buildBatchProposalsPayload();
                        const res = await fetch('/api/admin/enrollment/batch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            proposals,
                            complimentaryMode: proposalParentIsComplimentary,
                          }),
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                          message?: string;
                          parentCreated?: boolean;
                          parentId?: string;
                          count?: number;
                        };
                        if (!res.ok) {
                          pushToast(
                            'error',
                            data?.message ?? 'Nie udało się wysłać propozycji',
                          );
                          return;
                        }
                        const accountInfo = data?.parentCreated
                          ? ' (utworzono konto rodzica)'
                          : '';
                        const childCount = data.count ?? proposalNewChildren.length;
                        pushToast(
                          'success',
                          childCount === 1
                            ? `Wysłano propozycję z danymi do logowania${accountInfo}`
                            : `Wysłano zbiorczy mail (${childCount} dzieci) z danymi do logowania${accountInfo}`,
                        );
                        setProposalDrafts((prev) => {
                          const next = { ...prev };
                          for (const child of proposalNewChildren) {
                            delete next[child.requestId];
                          }
                          return next;
                        });
                        setProposalModalParentId(null);
                        await onRefresh();
                      } catch (err) {
                        pushToast(
                          'error',
                          err instanceof Error ? err.message : 'Błąd wysyłania propozycji',
                        );
                      } finally {
                        setSubmittingBatchProposals(false);
                      }
                    }}
                  >
                    {submittingBatchProposals
                      ? 'Wysyłanie…'
                      : proposalNewChildren.length === 1
                        ? 'Wyślij maila z danymi do logowania'
                        : `Wyślij zbiorczy mail (${proposalNewChildren.length} dzieci)`}
                  </button>
                </div>
              ) : (
                <span />
              )}
              <button
                className="rounded-xl bg-zinc-200 px-3 py-2"
                onClick={() => setProposalModalParentId(null)}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
