'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RenewalStatus } from '@/lib/renewal-status';
import {
  RENEWAL_STATUS_COLORS,
  RENEWAL_STATUS_LABELS,
} from '@/lib/renewal-status';
import RenewalPipelinePanel from '@/src/components/admin/RenewalPipelinePanel';

type RenewalRow = {
  id: string;
  childId: string;
  season: string;
  status: RenewalStatus;
  initiatedAt: string;
  confirmedAt: string | null;
  proposedGroupName: string | null;
  proposedLocationName: string | null;
  proposedSchedule: string | null;
  currentGroupId: string | null;
  currentGroupName: string | null;
  childFirstName: string;
  childLastName: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  proposalCount: number;
  hasPendingProposal: boolean;
};

type ProposalHistoryRow = {
  id: string;
  proposed_at: string;
  responded_at: string | null;
  status: string;
  rejection_comment: string | null;
  group_name: string;
  location_name: string;
  schedule: string;
  proposed_by_first_name: string;
  proposed_by_last_name: string;
};

type GroupOption = { id: string; name: string; location_name: string; schedule: string };

type PlannedYear = { id: string; name: string; date_from: string; date_to: string };

const VIEW_TABS = [
  { value: 'list', label: 'Lista' },
  { value: 'pipeline', label: 'Pipeline ucznia' },
] as const;

type ViewMode = (typeof VIEW_TABS)[number]['value'];

const FILTERS = [
  { value: '', label: 'Wszystkie' },
  { value: 'DRAFT', label: 'Szkice' },
  { value: 'PENDING_CONFIRMATION', label: 'Oczekujące u rodzica' },
  { value: 'CONFIRMED', label: 'Potwierdzone' },
  { value: 'PROPOSED', label: 'Zaproponowane' },
  { value: 'SIGNED', label: 'Podpisane' },
] as const;

export default function RenewalsPanel({
  pushToast,
}: {
  pushToast: (kind: 'success' | 'error', message: string) => void;
}) {
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [plannedNextYear, setPlannedNextYear] = useState<PlannedYear | null>(null);
  const [activeSchoolYear, setActiveSchoolYear] = useState<PlannedYear | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [proposeId, setProposeId] = useState<string | null>(null);
  const [proposeGroupId, setProposeGroupId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyById, setHistoryById] = useState<Record<string, ProposalHistoryRow[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/admin/renewals${qs}`, { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        renewals?: RenewalRow[];
        groups?: GroupOption[];
        plannedNextYear?: PlannedYear | null;
        activeSchoolYear?: PlannedYear | null;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać odnowień');
        return;
      }
      setPlannedNextYear(data.plannedNextYear ?? null);
      setActiveSchoolYear(data.activeSchoolYear ?? null);
      setRows(data.renewals ?? []);
      setGroups(data.groups ?? []);
    } catch {
      pushToast('error', 'Błąd pobierania odnowień');
    } finally {
      setLoading(false);
    }
  }, [pushToast, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (rows.length === 0) {
      setHistoryById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        rows.map(async (row) => {
          const r = await fetch(`/api/admin/renewals/${encodeURIComponent(row.id)}/proposals`, {
            credentials: 'include',
          });
          if (!r.ok) return [row.id, []] as const;
          const d = (await r.json()) as { proposals?: ProposalHistoryRow[] };
          return [row.id, d.proposals ?? []] as const;
        }),
      );
      if (!cancelled) setHistoryById(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const visible = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;
  const proposeRow = proposeId ? rows.find((r) => r.id === proposeId) : null;

  async function activateRenewal(row: RenewalRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/renewals/${encodeURIComponent(row.id)}/activate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się wysłać zapytania');
        return;
      }
      pushToast(
        'success',
        `Zapytanie o odnowienie wysłane do rodzica (${row.childFirstName} ${row.childLastName})`,
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function sendProposal() {
    if (!proposeId || !proposeGroupId) return;
    setBusyId(proposeId);
    try {
      const res = await fetch(`/api/admin/renewals/${encodeURIComponent(proposeId)}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: proposeGroupId }),
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się wysłać propozycji');
        return;
      }
      pushToast('success', 'Propozycja grupy została wysłana');
      setProposeId(null);
      setProposeGroupId('');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Odnowienia na kolejny rok</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Proces jak przy zapisie: potwierdzenie → propozycja grupy → umowa → przypisanie do grupy
              w planowanym roku szkolnym.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plannedNextYear ? (
              <Link
                href="/portal/renewals/send"
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0c5a47]"
              >
                Wyślij zapytanie o kontynuację
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white opacity-50"
              >
                Wyślij zapytanie o kontynuację
              </button>
            )}
          </div>
        </div>

        {activeSchoolYear && (
          <p className="text-sm text-zinc-600">
            Aktywny rok: <strong>{activeSchoolYear.name}</strong>
          </p>
        )}

        {plannedNextYear ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-950">
            Odnowienia dotyczą planowanego roku{' '}
            <strong>
              {plannedNextYear.name} ({plannedNextYear.date_from} — {plannedNextYear.date_to})
            </strong>
            . W propozycji domyślnie wybrana jest aktualna grupa dziecka — możesz ją zmienić.
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Dodaj kolejny rok szkolny w <strong>Organizacja → Rok szkolny</strong>, aby rozpocząć
            odnowienia.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setViewMode(tab.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                viewMode === tab.value
                  ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                  : 'border-emerald-200 bg-white text-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {viewMode === 'pipeline' ? (
          <RenewalPipelinePanel />
        ) : (
          <>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                statusFilter === f.value
                  ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                  : 'border-emerald-200 bg-white text-zinc-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Ładowanie…</p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            Brak odnowień — użyj „Wyślij zapytanie o kontynuację”, aby rozpocząć proces.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((row) => {
              const history = historyById[row.id] ?? [];
              const confirmedLabel = row.confirmedAt
                ? new Date(row.confirmedAt).toLocaleString('pl-PL', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '—';
              const sentLabel = row.initiatedAt
                ? new Date(row.initiatedAt).toLocaleString('pl-PL', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '—';
              const canPropose = row.status === 'CONFIRMED' || row.status === 'NEGOTIATING';
              const statusKey = row.status in RENEWAL_STATUS_LABELS ? row.status : 'DRAFT';

              return (
                <article key={row.id} className="rounded-xl border border-emerald-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {row.childFirstName} {row.childLastName}
                      </p>
                      <p className="text-sm text-zinc-600">
                        Rok docelowy: <strong>{row.season}</strong>
                      </p>
                      <p className="text-sm text-zinc-600">
                        {row.parentFirstName} {row.parentLastName} · {row.parentEmail}
                      </p>
                      {row.status !== 'DRAFT' && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Wysłano do rodzica: {sentLabel}
                        </p>
                      )}
                      {row.confirmedAt && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Potwierdzenie rodzica: {confirmedLabel}
                        </p>
                      )}
                      {row.proposedGroupName && (
                        <p className="mt-1 text-sm text-zinc-700">
                          {row.proposedGroupName} · {row.proposedLocationName} ·{' '}
                          {row.proposedSchedule}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RENEWAL_STATUS_COLORS[statusKey]}`}
                    >
                      {RENEWAL_STATUS_LABELS[statusKey]}
                    </span>
                  </div>

                  {row.status === 'DRAFT' && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="mt-3 rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={() => void activateRenewal(row)}
                    >
                      {busyId === row.id ? 'Wysyłanie…' : 'Wyślij zapytanie do rodzica'}
                    </button>
                  )}

                  {row.status === 'PENDING_CONFIRMATION' && (
                    <p className="mt-3 text-sm text-amber-900">
                      Czekamy na potwierdzenie chęci kontynuacji w panelu rodzica.
                    </p>
                  )}

                  {canPropose && (
                    <button
                      type="button"
                      className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        setProposeId(row.id);
                        const suggested =
                          row.currentGroupId && groups.some((g) => g.id === row.currentGroupId)
                            ? row.currentGroupId
                            : '';
                        setProposeGroupId(suggested);
                      }}
                    >
                      Wyślij propozycję grupy
                    </button>
                  )}

                  {row.status === 'PROPOSED' && (
                    <p className="mt-3 text-sm text-indigo-800">Czeka na odpowiedź rodzica</p>
                  )}

                  {history.length > 0 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-semibold text-zinc-700">
                        Historia propozycji ({history.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {history.map((h) => (
                          <li key={h.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                            <p className="font-medium">
                              {h.group_name} · {h.location_name}
                            </p>
                            <p className="text-xs text-zinc-600">{h.schedule}</p>
                            <p className="text-xs text-zinc-500">{h.status}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
          </>
        )}
      </section>

      {proposeRow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              Propozycja dla {proposeRow.childFirstName} {proposeRow.childLastName}
            </h3>
            <p className="mt-1 text-sm text-zinc-600">Sezon {proposeRow.season}</p>
            {proposeRow.currentGroupName ? (
              <p className="mt-2 text-sm text-zinc-600">
                Aktualna grupa: <strong>{proposeRow.currentGroupName}</strong>
                {proposeGroupId && proposeGroupId === proposeRow.currentGroupId
                  ? ' (sugerowana)'
                  : ''}
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-800">Brak aktywnej grupy w bieżącym roku.</p>
            )}
            <select
              className="mt-4 w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={proposeGroupId}
              onChange={(e) => setProposeGroupId(e.target.value)}
            >
              <option value="">Wybierz grupę</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} — {g.location_name} — {g.schedule}
                  {proposeRow.currentGroupId === g.id ? ' (obecna)' : ''}
                </option>
              ))}
            </select>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold"
                onClick={() => {
                  setProposeId(null);
                  setProposeGroupId('');
                }}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={!proposeGroupId || busyId === proposeRow.id}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void sendProposal()}
              >
                Wyślij propozycję
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
