'use client';

import { useCallback, useMemo, useState } from 'react';
import StudentPipelinePanel from '@/src/components/admin/StudentPipelinePanel';
import {
  ENROLLMENT_LIST_FILTERS,
  ENROLLMENT_STATUS_BADGE_BASE,
  ENROLLMENT_STATUS_COLORS,
  ENROLLMENT_STATUS_LABELS,
  filterEnrollmentChildrenByStatus,
  formatEnrollmentStatusLabel,
} from '@/lib/enrollment-status';
import { applyDiscountsToAmount, DISCOUNT_KEYS, hasIndividualPriceOverride } from '@/lib/discount-math';
import { isParentInComplimentaryList } from '@/lib/complimentary-parent-list';
import { paymentPlanLabel, paymentRateLabel } from '@/lib/payment-labels';
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

function formatPlnFromDb(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
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

function applyDiscountPreview(
  base: number | null,
  discountLargeFamily: boolean,
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number },
  hasIndividualPricing: boolean,
): number | null {
  if (base == null || !Number.isFinite(base) || base <= 0) return base;
  if (hasIndividualPricing) return base;
  const keys = discountLargeFamily ? [DISCOUNT_KEYS.LARGE_FAMILY_CARD] : [];
  return applyDiscountsToAmount(base, keys, discountSettings);
}

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
  discountSettings,
  onRefresh,
  onComplimentaryParentsChange,
}: EnrollmentAdminPanelProps) {
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useState('');
  const [proposalModalParentId, setProposalModalParentId] = useState<string | null>(null);
  const [submittingProposalRequestId, setSubmittingProposalRequestId] = useState<string | null>(null);
  const [rejectingParentResignationId, setRejectingParentResignationId] = useState<string | null>(
    null,
  );
  const [submittingBatchProposals, setSubmittingBatchProposals] = useState(false);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  const [savingParentDiscountId, setSavingParentDiscountId] = useState<string | null>(null);
  const [savingComplimentaryKey, setSavingComplimentaryKey] = useState<string | null>(null);

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
          const em = (parent.email ?? '').trim().toLowerCase();
          if (em.length > 0 && pid.includes('@') && em === pid.toLowerCase()) return true;
          return false;
        }) ?? null;
  const proposalNewChildren =
    proposalParent?.children.filter((c) => c.status === 'NEW') ?? [];
  const proposalBatchReady =
    proposalNewChildren.length >= 1 &&
    proposalNewChildren.every((c) =>
      Boolean((proposalDrafts[c.requestId]?.groupId ?? '').trim()),
    );
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
    const enrollmentRows = parents.filter((parent) => parent.children.length > 0);
    const filteredEnrollmentRows = enrollmentRows
      .map((parent) => ({
        ...parent,
        children: filterEnrollmentChildrenByStatus(parent.children, enrollmentStatusFilter),
      }))
      .filter((parent) => parent.children.length > 0);

    return (
      <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Zgłoszenia</h2>

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
            Brak zgłoszeń
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
            const parentAccountReady = Boolean((parent.parentUserId ?? '').trim());
            const parentDiscountSaving =
              savingParentDiscountId === (parent.parentUserId ?? parent.id);
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
                  {!parentIsComplimentary && (
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={Boolean(parent.discountLargeFamily)}
                        disabled={!parentAccountReady || parentDiscountSaving}
                        title={
                          parentAccountReady
                            ? undefined
                            : 'Dostępne po utworzeniu konta rodzica (np. po pierwszej propozycji)'
                        }
                        onChange={(e) => {
                          void saveParentLargeFamilyCard(parent, e.target.checked);
                        }}
                      />
                      Karta Dużej Rodziny ({discountSettings.LARGE_FAMILY_CARD}%)
                    </label>
                  )}
                  {!parentIsComplimentary && !parentAccountReady && (
                    <p className="mt-1 text-xs text-zinc-500">
                      KDR: dostępne po utworzeniu konta rodzica.
                    </p>
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
                    {!proposalParentIsComplimentary && (
                      <>
                        <label className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-800">
                          <input
                            type="checkbox"
                            checked={Boolean(proposalParent.discountLargeFamily)}
                            disabled={
                              !Boolean((proposalParent.parentUserId ?? '').trim()) ||
                              savingParentDiscountId ===
                                (proposalParent.parentUserId ?? proposalParent.id)
                            }
                            title={
                              (proposalParent.parentUserId ?? '').trim()
                                ? undefined
                                : 'Dostępne po utworzeniu konta rodzica (np. po pierwszej propozycji)'
                            }
                            onChange={(e) => {
                              void saveParentLargeFamilyCard(proposalParent, e.target.checked);
                            }}
                          />
                          Karta Dużej Rodziny ({discountSettings.LARGE_FAMILY_CARD}%)
                        </label>
                        {!(proposalParent.parentUserId ?? '').trim() && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Oznaczenie KDR będzie możliwe po utworzeniu konta rodzica.
                          </p>
                        )}
                      </>
                    )}
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
                              <p className="font-semibold text-emerald-900">Propozycja zaakceptowana</p>
                              {proposedGroup ? (
                                <p className="mt-1 text-emerald-900">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : null}
                              <p className="mt-2 text-xs text-emerald-800">
                                Rodzic przechodzi do uzupełnienia danych do umowy.
                              </p>
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
                                if (!selectedGroup) return null;
                                return (
                                  <>
                                    {locationMismatch && (
                                      <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                        Wybrana grupa nie prowadzi zajęć w lokalizacji{' '}
                                        {child.preferredLocation ?? 'wybranej przez rodzica'}. Możesz
                                        mimo to wysłać propozycję.
                                      </p>
                                    )}
                                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                        Cennik grupy
                                      </p>
                                      <div className="mt-2 space-y-1">
                                        <p className="text-zinc-800">
                                          <span className="font-medium">{paymentPlanLabel('monthly')}:</span>{' '}
                                          {formatPlnFromDb(selectedGroup.price_monthly)}
                                        </p>
                                        <p className="text-zinc-800">
                                          <span className="font-medium">{paymentPlanLabel('yearly')}:</span>{' '}
                                          {formatPlnFromDb(selectedGroup.price_yearly)}
                                        </p>
                                        <p className="text-zinc-800">
                                          <span className="font-medium">{paymentPlanLabel('per_lesson')}:</span>{' '}
                                          {formatPlnFromDb(selectedGroup.price_per_lesson)}
                                        </p>
                                      </div>
                                      {proposalParentIsComplimentary ? (
                                        <p className="mt-3 text-xs text-sky-800">
                                          Tryb bez opłat — indywidualne stawki nie są używane.
                                        </p>
                                      ) : (
                                      <>
                                      <label className="mt-3 block text-xs font-medium text-zinc-600">
                                        {paymentRateLabel('monthly', { individualOptional: true })}
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder={
                                            selectedGroup.price_monthly != null
                                              ? `Domyślnie ${formatPlnFromDb(selectedGroup.price_monthly)}`
                                              : 'np. 140,00'
                                          }
                                          className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                          disabled={!proposalAllowed}
                                          value={proposalDrafts[child.requestId]?.monthlyUnitPrice ?? ''}
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
                                      <label className="mt-2 block text-xs font-medium text-zinc-600">
                                        {paymentRateLabel('yearly', { individualOptional: true })}
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder={
                                            selectedGroup.price_yearly != null
                                              ? `Domyślnie ${formatPlnFromDb(selectedGroup.price_yearly)}`
                                              : 'np. 1400,00'
                                          }
                                          className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                          disabled={!proposalAllowed}
                                          value={proposalDrafts[child.requestId]?.yearlyUnitPrice ?? ''}
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
                                      <label className="mt-2 block text-xs font-medium text-zinc-600">
                                        {paymentRateLabel('per_lesson', { individualOptional: true })}
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder={
                                            selectedGroup.price_per_lesson != null
                                              ? `Domyślnie ${formatPlnFromDb(selectedGroup.price_per_lesson)}`
                                              : 'np. 45,00'
                                          }
                                          className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2 text-sm"
                                          disabled={!proposalAllowed}
                                          value={proposalDrafts[child.requestId]?.lessonUnitPrice ?? ''}
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
                                      </>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                              {(() => {
                                const draft = proposalDrafts[child.requestId];
                                const selectedGroupId = draft?.groupId ?? '';
                                const selectedGroup = selectedGroupId
                                  ? groups.find((g) => g.id === selectedGroupId)
                                  : null;
                                if (!selectedGroup || proposalParentIsComplimentary) return null;
                                const monthlyBaseRaw = draft?.monthlyUnitPrice?.trim();
                                const yearlyBaseRaw = draft?.yearlyUnitPrice?.trim();
                                const lessonBaseRaw = draft?.lessonUnitPrice?.trim();
                                const hasIndividualPricing = hasIndividualPriceOverride({
                                  lesson_unit_price: lessonBaseRaw || null,
                                  monthly_unit_price: monthlyBaseRaw || null,
                                  yearly_unit_price: yearlyBaseRaw || null,
                                });
                                const monthlyBase =
                                  monthlyBaseRaw && Number.isFinite(Number(monthlyBaseRaw.replace(',', '.')))
                                    ? Number(monthlyBaseRaw.replace(',', '.'))
                                    : selectedGroup.price_monthly != null
                                      ? Number(selectedGroup.price_monthly)
                                      : null;
                                const yearlyBase =
                                  yearlyBaseRaw && Number.isFinite(Number(yearlyBaseRaw.replace(',', '.')))
                                    ? Number(yearlyBaseRaw.replace(',', '.'))
                                    : selectedGroup.price_yearly != null
                                      ? Number(selectedGroup.price_yearly)
                                      : null;
                                const monthlyAfter = applyDiscountPreview(
                                  monthlyBase,
                                  Boolean(proposalParent?.discountLargeFamily),
                                  discountSettings,
                                  hasIndividualPricing,
                                );
                                const yearlyAfter = applyDiscountPreview(
                                  yearlyBase,
                                  Boolean(proposalParent?.discountLargeFamily),
                                  discountSettings,
                                  hasIndividualPricing,
                                );
                                if (hasIndividualPricing) {
                                  return (
                                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                      Cena indywidualna — zniżki procentowe (KDR / rodzeństwo) nie
                                      obowiązują.
                                    </p>
                                  );
                                }
                                if (
                                  proposalParent?.discountLargeFamily &&
                                  (monthlyAfter != null || yearlyAfter != null)
                                ) {
                                  return (
                                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                      Kwota po zniżce KDR:{' '}
                                      {monthlyAfter != null
                                        ? `ratalnie ${formatPlnFromDb(monthlyAfter)}`
                                        : ''}
                                      {monthlyAfter != null && yearlyAfter != null ? ' · ' : ''}
                                      {yearlyAfter != null
                                        ? `jednorazowo ${formatPlnFromDb(yearlyAfter)}`
                                        : ''}
                                    </p>
                                  );
                                }
                                return null;
                              })()}
                              <div className="flex flex-wrap gap-2">
                                {child.status === 'NEGOTIATING' && (
                                  <button
                                    type="button"
                                    disabled={
                                      submittingProposalRequestId === child.requestId ||
                                      rejectingParentResignationId === child.requestId ||
                                      submittingBatchProposals
                                    }
                                    className="rounded-xl bg-emerald-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={async () => {
                                      const draft = proposalDrafts[child.requestId];
                                      const groupId = draft?.groupId ?? '';
                                      if (!groupId) {
                                        pushToast('error', 'Wybierz grupę');
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
                                        if (
                                          typeof data.parentId === 'string' &&
                                          data.parentId.trim().length > 0
                                        ) {
                                          setProposalModalParentId(data.parentId.trim());
                                        }
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
                                      submittingBatchProposals
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
                <button
                  type="button"
                  disabled={
                    !proposalBatchReady ||
                    submittingBatchProposals ||
                    submittingProposalRequestId != null ||
                    rejectingParentResignationId != null
                  }
                  title={
                    proposalBatchReady
                      ? undefined
                      : 'Wybierz grupę dla każdego dziecka ze statusem „Nowe”'
                  }
                  className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={async () => {
                    setSubmittingBatchProposals(true);
                    try {
                      const proposals = proposalNewChildren.map((child) => {
                        const draft = proposalDrafts[child.requestId];
                        const groupId = draft?.groupId ?? '';
                        return {
                          requestId: child.requestId,
                          groupId,
                          lessonUnitPrice: draft?.lessonUnitPrice?.trim() || null,
                          monthlyUnitPrice: draft?.monthlyUnitPrice?.trim() || null,
                          yearlyUnitPrice: draft?.yearlyUnitPrice?.trim() || null,
                        };
                      });
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
                      if (
                        typeof data.parentId === 'string' &&
                        data.parentId.trim().length > 0
                      ) {
                        setProposalModalParentId(data.parentId.trim());
                      }
                      setProposalDrafts((prev) => {
                        const next = { ...prev };
                        for (const child of proposalNewChildren) {
                          delete next[child.requestId];
                        }
                        return next;
                      });
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
                      ? 'Wyślij propozycję z danymi do logowania'
                      : `Wyślij zbiorczy mail (${proposalNewChildren.length} dzieci)`}
                </button>
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
