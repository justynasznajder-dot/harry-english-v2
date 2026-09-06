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
  formatEnrollmentStatusLabel,
} from '@/lib/enrollment-status';
import { parsePriceDecimal } from '@/lib/lesson-pricing';
import { isParentInComplimentaryList } from '@/lib/complimentary-parent-list';
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
};

function emptyProposalDraft(groupId = ''): ProposalDraft {
  return { groupId, lessonUnitPrice: '', monthlyUnitPrice: '', yearlyUnitPrice: '' };
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

/** Wszystkie 3 stawki ręczne muszą być podane (sezon bez cennika grupy / rabatów). */
function draftHasRequiredPrices(draft?: ProposalDraft): boolean {
  if (!draft) return false;
  return (
    parsePriceDecimal(draft.yearlyUnitPrice) != null &&
    parsePriceDecimal(draft.monthlyUnitPrice) != null &&
    parsePriceDecimal(draft.lessonUnitPrice) != null
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

function draftIsSaveable(draft?: ProposalDraft): boolean {
  return Boolean((draft?.groupId ?? '').trim()) || draftHasRequiredPrices(draft);
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
  const [proposalModalParentId, setProposalModalParentId] = useState<string | null>(null);
  const [submittingProposalRequestId, setSubmittingProposalRequestId] = useState<string | null>(null);
  const [rejectingParentResignationId, setRejectingParentResignationId] = useState<string | null>(
    null,
  );
  const [submittingBatchProposals, setSubmittingBatchProposals] = useState(false);
  const [savingBatchProposals, setSavingBatchProposals] = useState(false);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  // const [savingParentDiscountId, setSavingParentDiscountId] = useState<string | null>(null);
  const [savingComplimentaryKey, setSavingComplimentaryKey] = useState<string | null>(null);
  void _discountSettings; // zniżki % wyłączone — prop zostaje dla kompatybilności AdminPortal

  /*
  const saveParentLargeFamilyCard = useCallback(
    async (
      parent: {
        id: string;
        parentUserId?: string | null;
        email: string;
      },
      checked: boolean,
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
            discountLargeFamily: checked,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          parentUserId?: string;
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
  */

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
        pushToast('error', 'Brak e-maila rodzica — nie można oznaczyć trybu bez opłat');
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
            pushToast('error', data.message ?? 'Nie udało się włączyć trybu bez opłat');
            return;
          }
          if (Array.isArray(data.complimentaryParents)) {
            onComplimentaryParentsChange?.(data.complimentaryParents);
          }
          pushToast('success', 'Włączono tryb bez opłat');
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
            pushToast('error', data.message ?? 'Nie udało się wyłączyć trybu bez opłat');
            return;
          }
          if (Array.isArray(data.complimentaryParents)) {
            onComplimentaryParentsChange?.(data.complimentaryParents);
          }
          pushToast('success', 'Wyłączono tryb bez opłat');
        }
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Błąd zapisu trybu bez opłat',
        );
      } finally {
        setSavingComplimentaryKey(null);
      }
    },
    [complimentaryParents, onComplimentaryParentsChange, pushToast],
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
  const proposalNewChildren =
    proposalParent?.children.filter((c) => c.status === 'NEW') ?? [];
  const hasAcceptedSibling = (requestId: string) =>
    proposalParent?.children.some(
      (c) => c.requestId !== requestId && c.status === 'ACCEPTED',
    ) ?? false;
  const proposalParentIsComplimentary = useMemo(
    () =>
      proposalParent
        ? isParentInComplimentaryList(proposalParent, complimentaryParents)
        : false,
    [proposalParent, complimentaryParents],
  );
  const proposalBatchReady =
    proposalNewChildren.length >= 1 &&
    proposalNewChildren.every((c) => {
      const draft = proposalDrafts[c.requestId];
      if (!(draft?.groupId ?? '').trim()) return false;
      if (proposalParentIsComplimentary) return true;
      return draftHasRequiredPrices(draft);
    });
  /**
   * Zapisz: wystarczy pełne dane u jednego dziecka; pozostałe mogą być puste.
   * Częściowe stawki (1–2 z 3) u któregokolwiek dziecka blokują zapis.
   */
  const proposalBatchSaveReady =
    proposalNewChildren.length >= 1 &&
    proposalNewChildren.every((c) => !draftHasPartialPrices(proposalDrafts[c.requestId])) &&
    proposalNewChildren.some((c) => draftIsSaveable(proposalDrafts[c.requestId]));
  const proposalBatchSaveTitle = (() => {
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
    const children = parents.flatMap((parent) => parent.children);
    const counts: Record<string, number> = { '': children.length };
    for (const filter of ENROLLMENT_LIST_FILTERS) {
      if (!filter.value) continue;
      counts[filter.value] = filterEnrollmentChildrenByStatus(children, filter.value).length;
    }
    return counts;
  }, [parents]);

  const renderList = () => {
    const isPipeline = enrollmentStatusFilter === 'pipeline';
    const studentQuery = studentNameSearch.trim().toLowerCase();
    const enrollmentRows = parents.filter((parent) => parent.children.length > 0);
    const filteredEnrollmentRows = enrollmentRows
      .map((parent) => {
        let children = filterEnrollmentChildrenByStatus(parent.children, enrollmentStatusFilter);
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

        <div className="flex flex-wrap gap-2">
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
            Pipeline ucznia
          </button>
        </div>

        {isPipeline ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Zgłoszenie → propozycja → umowa → grupa → płatności → odnowienie
            </p>
            <StudentPipelinePanel embedded />
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
                    <p className="mt-1 text-xs font-medium text-sky-800">Tryb bez opłat</p>
                  )}
                </div>
                <button
                  className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm text-white"
                  onClick={() => {
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
                        next[child.requestId] = draft;
                      }
                      return next;
                    });
                  }}
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
                    const childStatus = child.status ?? 'NEW';
                    return (
                      <li
                        key={child.requestId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                      >
                        <span className="font-medium text-zinc-900">
                          {child.firstName} {child.lastName}
                        </span>
                        <span
                          className={`${ENROLLMENT_STATUS_BADGE_BASE} ${
                            ENROLLMENT_STATUS_COLORS[childStatus] ?? 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {formatEnrollmentStatusLabel(childStatus)}
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
                          void saveParentComplimentary(proposalParent, e.target.checked);
                        }}
                      />
                      Tryb bez opłat
                    </label>
                    <p className="mt-1 text-xs text-zinc-500">
                      Po akceptacji grupy zapis kończy się bez umowy, faktur i płatności. Działa
                      też przed utworzeniem konta (po e-mailu zgłoszenia).
                    </p>
                    {/*
                     * KDR / zniżki procentowe — wyłączone (sezon cen ręcznych).
                    {!proposalParentIsComplimentary && (
                      <>
                        <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-800">
                          ... Karta Dużej Rodziny ...
                        </label>
                      </>
                    )}
                    */}
                  </div>
                  {proposalParentIsComplimentary && (
                    <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      Rodzic jest w trybie bez opłat — wyślij propozycję grupy; rodzic tylko
                      zatwierdzi grupę po zalogowaniu (bez umowy).
                    </p>
                  )}
                </div>
                <div className="mt-4 space-y-3">
                  {proposalParent.children.map((child) => {
                    const proposalAllowed =
                      child.status === 'NEW' || child.status === 'NEGOTIATING';
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
                              className={`${ENROLLMENT_STATUS_BADGE_BASE} ${ENROLLMENT_STATUS_COLORS[child.status] ?? 'bg-zinc-100 text-zinc-700'}`}
                            >
                              Zgłoszenie: {ENROLLMENT_STATUS_LABELS[child.status] ?? child.status}
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
                          {child.status === 'ACCEPTED' && (
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
                                {ENROLLMENT_REQUIRE_PROPOSAL_ACCEPTANCE
                                  ? 'Rodzic uzupełnia dane do umowy.'
                                  : 'Czekamy na podpisanie umowy przez nauczyciela.'}
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
                                <select
                                  className="w-full max-w-full rounded-xl border border-emerald-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={!proposalAllowed}
                                  value={proposalDrafts[child.requestId]?.groupId ?? ''}
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
                                  {groups.map((group) => {
                                    const label = `${group.name} · ${group.location_name} · ${group.schedule}`;
                                    return (
                                      <option key={group.id} value={group.id} title={label}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                                {!proposalParentIsComplimentary && (
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-end">
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
                                        required
                                        className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                        disabled={!proposalAllowed}
                                        placeholder="np. 50"
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
                                  </div>
                                )}
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
                                        !proposalParentIsComplimentary &&
                                        !draftHasRequiredPrices(draft)
                                      ) {
                                        pushToast(
                                          'error',
                                          'Podaj wszystkie 3 stawki: jednorazową, ratalną i za pojedyncze zajęcia',
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
                          pushToast('error', 'Brak danych do zapisu');
                          return;
                        }
                        const res = await fetch('/api/admin/enrollment/batch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            proposals,
                            sendEmail: false,
                            allowEmptyPrices: true,
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
                            `Zapisano dane propozycji (${data.count ?? proposals.length}) — dziecko w grupie jako niepotwierdzone`,
                        );
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
                  {/* TEMP: wyłączone, żeby przypadkiem nie wysłać maili — na razie tylko Zapisz.
                      Przywróć: usuń `true ||` z disabled oraz stały title poniżej. */}
                  <button
                    type="button"
                    disabled={
                      true ||
                      !proposalBatchReady ||
                      submittingBatchProposals ||
                      savingBatchProposals ||
                      submittingProposalRequestId != null ||
                      rejectingParentResignationId != null
                    }
                    title="Tymczasowo wyłączone — na razie tylko zapisujemy przydziały (bez wysyłki maila)"
                    className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={async () => {
                      if (!confirmGroupChangesIfNeeded()) return;
                      setSubmittingBatchProposals(true);
                      try {
                        const proposals = buildBatchProposalsPayload();
                        const res = await fetch('/api/admin/enrollment/batch', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ proposals }),
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
