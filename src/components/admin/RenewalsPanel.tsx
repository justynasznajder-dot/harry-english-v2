'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RenewalStatus } from '@/lib/renewal-status';

type RenewalRow = {
  id: string;
  season: string;
  status: RenewalStatus;
  confirmedAt: string | null;
  proposedGroupName: string | null;
  proposedLocationName: string | null;
  proposedSchedule: string | null;
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

const STATUS_LABELS: Record<RenewalStatus, string> = {
  PENDING_CONFIRMATION: 'Oczekuje potwierdzenia',
  CONFIRMED: 'Potwierdzone',
  PROPOSED: 'Propozycja wysłana',
  NEGOTIATING: 'Negocjacje',
  ACCEPTED: 'Zaakceptowane',
  SIGNED: 'Podpisane',
  RESIGNED: 'Rezygnacja',
};

const STATUS_COLORS: Record<RenewalStatus, string> = {
  PENDING_CONFIRMATION: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-sky-100 text-sky-900',
  PROPOSED: 'bg-indigo-100 text-indigo-900',
  NEGOTIATING: 'bg-amber-100 text-amber-950',
  ACCEPTED: 'bg-emerald-100 text-emerald-900',
  SIGNED: 'bg-emerald-200 text-emerald-950',
  RESIGNED: 'bg-zinc-200 text-zinc-700',
};

const FILTERS = [
  { value: '', label: 'Wszystkie' },
  { value: 'CONFIRMED', label: 'Potwierdzone' },
  { value: 'PENDING_CONFIRMATION', label: 'Oczekujące' },
  { value: 'PROPOSED', label: 'Zaproponowane' },
  { value: 'SIGNED', label: 'Podpisane' },
] as const;

export default function RenewalsPanel({
  pushToast,
}: {
  pushToast: (kind: 'success' | 'error', message: string) => void;
}) {
  const [renewalsOpen, setRenewalsOpen] = useState(false);
  const [renewalsSeason, setRenewalsSeason] = useState<string | null>(null);
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [seasonInput, setSeasonInput] = useState('');
  const [proposeId, setProposeId] = useState<string | null>(null);
  const [proposeGroupId, setProposeGroupId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [historyById, setHistoryById] = useState<Record<string, ProposalHistoryRow[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/admin/renewals${qs}`, { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        renewalsOpen?: boolean;
        renewalsSeason?: string | null;
        renewals?: RenewalRow[];
        groups?: GroupOption[];
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać odnowień');
        return;
      }
      setRenewalsOpen(data.renewalsOpen ?? false);
      setRenewalsSeason(data.renewalsSeason ?? null);
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

  async function closeRenewals() {
    const res = await fetch('/api/admin/renewals/close', { method: 'POST', credentials: 'include' });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      pushToast('error', data.message ?? 'Nie udało się zamknąć zapisów');
      return;
    }
    pushToast('success', 'Zapisy na nowy rok zostały zamknięte');
    await load();
  }

  async function openRenewals() {
    setOpening(true);
    try {
      const res = await fetch('/api/admin/renewals/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: seasonInput.trim() }),
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; created?: number };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się otworzyć zapisów');
        return;
      }
      const n = data.created ?? 0;
      pushToast('success', `Otwarto zapisy dla ${n} ${n === 1 ? 'dziecka' : 'dzieci'}`);
      setOpenModal(false);
      await load();
    } finally {
      setOpening(false);
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
      pushToast('success', 'Propozycja została wysłana');
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
          <h2 className="text-lg font-semibold text-zinc-900">Odnowienia na nowy rok</h2>
          {!renewalsOpen && (
            <button
              type="button"
              className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setSeasonInput(renewalsSeason ?? '');
                setOpenModal(true);
              }}
            >
              Otwórz zapisy na nowy rok
            </button>
          )}
        </div>

        {renewalsOpen && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm">
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              Sezon: {renewalsSeason ?? '—'}
            </span>
            <button
              type="button"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900"
              onClick={() => void closeRenewals()}
            >
              Zamknij zapisy
            </button>
          </div>
        )}

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
            Brak odnowień
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
              const canPropose =
                row.status === 'CONFIRMED' || row.status === 'NEGOTIATING';
              return (
                <article key={row.id} className="rounded-xl border border-emerald-100 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                      <p className="font-semibold text-zinc-900">
                        {row.childFirstName} {row.childLastName}
                      </p>
                      <p className="text-sm text-zinc-600">
                        {row.parentFirstName} {row.parentLastName} · {row.parentEmail}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">Potwierdzenie: {confirmedLabel}</p>
                      {row.proposedGroupName && (
                        <p className="mt-1 text-sm text-zinc-700">
                          {row.proposedGroupName} · {row.proposedLocationName} · {row.proposedSchedule}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status]}`}
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  {(row.status === 'CONFIRMED' || row.status === 'NEGOTIATING') && (
                    <button
                      type="button"
                      className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        setProposeId(row.id);
                        setProposeGroupId('');
                      }}
                    >
                      Wyślij propozycję
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
                            <p className="font-medium">{h.group_name} · {h.location_name}</p>
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
      </section>

      {openModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Otwórz zapisy na nowy rok</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Etykieta sezonu, np. 2025/2026. Utworzone zostaną odnowienia dla aktywnych dzieci ze
              statusem SIGNED.
            </p>
            <input
              className="mt-4 w-full rounded-xl border border-emerald-200 px-3 py-2"
              placeholder="2025/2026"
              value={seasonInput}
              onChange={(e) => setSeasonInput(e.target.value)}
            />
                        <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold" onClick={() => setOpenModal(false)} disabled={opening}>
                Anuluj
              </button>
              <button type="button" disabled={opening} className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void openRenewals()}>
                Otwórz zapisy
              </button>
            </div>
          </div>
        </div>
      )}

      {proposeRow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              Propozycja dla {proposeRow.childFirstName} {proposeRow.childLastName}
            </h3>
            <select
              className="mt-4 w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={proposeGroupId}
              onChange={(e) => setProposeGroupId(e.target.value)}
            >
              <option value="">Wybierz grupę</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} — {g.location_name} — {g.schedule}
                </option>
              ))}
            </select>
                        
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold" onClick={() => { setProposeId(null); setProposeGroupId(''); }}>
                Anuluj
              </button>
              <button type="button" disabled={!proposeGroupId || busyId === proposeRow.id} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void sendProposal()}>
                Wyślij propozycję
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
