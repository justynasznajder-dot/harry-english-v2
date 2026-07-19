'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RENEWAL_STATUS_COLORS,
  type RenewalStatus,
} from '@/lib/renewal-status';

type PlannedYear = { id: string; name: string; date_from: string; date_to: string };

type SendSummary = {
  total: number;
  canSend: number;
  alreadySent: number;
  resigned: number;
};

type GroupRow = {
  id: string;
  name: string;
  locationName: string;
  schedule: string;
  studentCount: number;
  canSendCount: number;
  alreadySentCount: number;
};

type StudentRow = {
  childId: string;
  firstName: string;
  lastName: string;
  parentName: string;
  parentEmail: string;
  groupId: string | null;
  groupName: string | null;
  renewalStatus: string | null;
  renewalStatusLabel: string | null;
  alreadySent: boolean;
  sentAt: string | null;
  canSend: boolean;
  blockReason: string | null;
};

type StudentFilter = 'all' | 'pending' | 'sent';

function formatSentAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadgeClass(status: string | null): string {
  const key = String(status ?? '')
    .trim()
    .toUpperCase();
  if (key in RENEWAL_STATUS_COLORS) {
    return RENEWAL_STATUS_COLORS[key as RenewalStatus];
  }
  return 'bg-zinc-100 text-zinc-700';
}

export default function SendRenewalInquiryPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  const [plannedNextYear, setPlannedNextYear] = useState<PlannedYear | null>(null);
  const [activeSchoolYear, setActiveSchoolYear] = useState<PlannedYear | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [mode, setMode] = useState<'all' | 'groups'>('all');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/renewals/send', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        season?: string;
        groups?: GroupRow[];
        students?: StudentRow[];
        summary?: SendSummary;
        plannedNextYear?: PlannedYear | null;
        activeSchoolYear?: PlannedYear | null;
      };
      if (!res.ok) {
        setError(data.message ?? 'Nie udało się pobrać listy uczniów');
        setStudents([]);
        return;
      }
      setSeason(data.season ?? null);
      setPlannedNextYear(data.plannedNextYear ?? null);
      setActiveSchoolYear(data.activeSchoolYear ?? null);
      setGroups(data.groups ?? []);
      const list = data.students ?? [];
      setStudents(list);
      setSummary(data.summary ?? null);
      setIncluded(new Set(list.filter((s) => s.canSend).map((s) => s.childId)));
    } catch {
      setError('Błąd pobierania listy uczniów');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredByGroups = useMemo(() => {
    if (mode === 'all') return students;
    if (selectedGroupIds.size === 0) return [];
    return students.filter((s) => s.groupId && selectedGroupIds.has(s.groupId));
  }, [students, mode, selectedGroupIds]);

  const filteredByStatus = useMemo(() => {
    if (studentFilter === 'pending') {
      return filteredByGroups.filter((s) => s.canSend);
    }
    if (studentFilter === 'sent') {
      return filteredByGroups.filter((s) => s.alreadySent);
    }
    return filteredByGroups;
  }, [filteredByGroups, studentFilter]);

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByStatus;
    return filteredByStatus.filter((s) => {
      const hay = [
        s.firstName,
        s.lastName,
        s.parentName,
        s.parentEmail,
        s.groupName ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filteredByStatus, search]);

  const scopeSummary = useMemo(() => {
    const canSend = filteredByGroups.filter((s) => s.canSend).length;
    const alreadySent = filteredByGroups.filter((s) => s.alreadySent).length;
    return { total: filteredByGroups.length, canSend, alreadySent };
  }, [filteredByGroups]);

  const toSendCount = useMemo(
    () => visibleStudents.filter((s) => s.canSend && included.has(s.childId)).length,
    [visibleStudents, included],
  );

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleStudent(childId: string, canSend: boolean) {
    if (!canSend) return;
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  }

  function selectAllVisible() {
    setIncluded((prev) => {
      const next = new Set(prev);
      for (const s of visibleStudents) {
        if (s.canSend) next.add(s.childId);
      }
      return next;
    });
  }

  function deselectAllVisible() {
    setIncluded((prev) => {
      const next = new Set(prev);
      for (const s of visibleStudents) {
        next.delete(s.childId);
      }
      return next;
    });
  }

  async function handleSend() {
    if (mode === 'groups' && selectedGroupIds.size === 0) {
      setError('Wybierz co najmniej jedną grupę');
      return;
    }
    if (toSendCount === 0) {
      setError('Zaznacz co najmniej jednego ucznia do wysłania zapytania');
      return;
    }

    setSending(true);
    setError(null);
    setResultMessage(null);
    try {
      const excludedChildIds = students
        .filter((s) => {
          if (mode === 'groups' && (!s.groupId || !selectedGroupIds.has(s.groupId))) return false;
          if (!s.canSend) return false;
          return !included.has(s.childId);
        })
        .map((s) => s.childId);

      const res = await fetch('/api/admin/renewals/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          groupIds: mode === 'groups' ? [...selectedGroupIds] : [],
          excludedChildIds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        sent?: number;
        skipped?: number;
        errors?: string[];
      };
      if (!res.ok) {
        setError(data.message ?? 'Nie udało się wysłać zapytań');
        return;
      }
      setResultMessage(
        `Wysłano ${data.sent ?? 0} zapytań do rodziców` +
          (data.skipped ? ` (pominięto: ${data.skipped})` : '') +
          '.',
      );
      await load();
    } catch {
      setError('Błąd wysyłania zapytań');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#0f6e56]">Wyślij zapytanie o kontynuację</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Wybierz grupy lub wszystkich obecnych uczniów. Odznacz uczniów, których chcesz
              wyłączyć z wysyłki. Uczniowie z już wysłanym zapytaniem są zablokowani.
            </p>
          </div>
          <Link
            href="/portal"
            className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            ← Powrót do odnowień
          </Link>
        </div>

        {activeSchoolYear && (
          <p className="mt-3 text-sm text-zinc-600">
            Obecni uczniowie (rok {activeSchoolYear.name}) → odnowienie na{' '}
            <strong>{plannedNextYear?.name ?? season ?? '—'}</strong>
          </p>
        )}

        {!plannedNextYear && !loading && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Dodaj planowany kolejny rok w Organizacja → Rok szkolny.
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {resultMessage && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {resultMessage}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Ładowanie…</p>
      ) : (
        <>
          {summary && summary.total > 0 && (
            <section className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Do wysłania
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-950">{summary.canSend}</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                  Już wysłane
                </p>
                <p className="mt-1 text-2xl font-bold text-sky-950">{summary.alreadySent}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  Razem uczniów
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{summary.total}</p>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-emerald-100 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Zakres wysyłki</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode('all')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  mode === 'all'
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                    : 'border-emerald-200 bg-white text-zinc-700'
                }`}
              >
                Wszyscy obecni uczniowie ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('groups')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  mode === 'groups'
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                    : 'border-emerald-200 bg-white text-zinc-700'
                }`}
              >
                Wybrane grupy
              </button>
            </div>

            {mode !== 'groups' && summary && summary.alreadySent > 0 && (
              <p className="mt-3 text-xs text-sky-800">
                {summary.alreadySent} uczniów ma już wysłane zapytanie — nie można wysłać ponownie.
              </p>
            )}

            {mode === 'groups' && selectedGroupIds.size > 0 && (
              <p className="mt-3 text-xs text-zinc-600">
                W wybranych grupach: {scopeSummary.canSend} do wysłania, {scopeSummary.alreadySent}{' '}
                już wysłanych.
              </p>
            )}

            {mode === 'groups' && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {groups.map((g) => (
                  <label
                    key={g.id}
                    className={`flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-sm ${
                      selectedGroupIds.has(g.id)
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-zinc-200 bg-zinc-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                    />
                    <span>
                      <strong>{g.name}</strong> · {g.studentCount} uczniów
                      {g.alreadySentCount > 0 && (
                        <span className="text-sky-700">
                          {' '}
                          · {g.alreadySentCount} wysłano
                        </span>
                      )}
                      {g.canSendCount > 0 && (
                        <span className="text-emerald-700"> · {g.canSendCount} do wysłania</span>
                      )}
                      <br />
                      <span className="text-xs text-zinc-500">
                        {g.locationName} · {g.schedule}
                      </span>
                    </span>
                  </label>
                ))}
                {groups.length === 0 && (
                  <p className="text-sm text-zinc-500">Brak aktywnych grup z uczniami.</p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-emerald-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Uczniowie ({visibleStudents.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#0f6e56] underline disabled:opacity-40"
                  onClick={selectAllVisible}
                  disabled={studentFilter === 'sent'}
                >
                  Zaznacz wszystkich
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-zinc-600 underline disabled:opacity-40"
                  onClick={deselectAllVisible}
                  disabled={studentFilter === 'sent'}
                >
                  Odznacz wszystkich
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  { value: 'all' as const, label: `Wszyscy (${filteredByGroups.length})` },
                  { value: 'pending' as const, label: `Do wysłania (${scopeSummary.canSend})` },
                  { value: 'sent' as const, label: `Już wysłane (${scopeSummary.alreadySent})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStudentFilter(tab.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    studentFilter === tab.value
                      ? tab.value === 'sent'
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : 'border-[#0f6e56] bg-[#0f6e56] text-white'
                      : 'border-zinc-200 bg-white text-zinc-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              className="mt-3 w-full max-w-md rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Szukaj ucznia, rodzica, grupy…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              {visibleStudents.map((s) => {
                const sentLabel = formatSentAt(s.sentAt);
                return (
                <li
                  key={s.childId}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    s.alreadySent
                      ? 'border-sky-200 bg-sky-50/60'
                      : s.canSend
                        ? 'border-zinc-200 bg-zinc-50'
                        : 'border-zinc-100 bg-zinc-100/80 opacity-75'
                  }`}
                >
                  <label
                    className={`flex items-start gap-2 ${s.canSend ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!s.canSend}
                      checked={s.canSend && included.has(s.childId)}
                      onChange={() => toggleStudent(s.childId, s.canSend)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong>
                          {s.firstName} {s.lastName}
                        </strong>
                        {s.groupName ? (
                          <span className="text-zinc-600">· {s.groupName}</span>
                        ) : null}
                        {s.alreadySent && s.renewalStatus && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(s.renewalStatus)}`}
                          >
                            Wysłano · {s.renewalStatusLabel ?? s.renewalStatus}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {s.parentName} · {s.parentEmail}
                      </span>
                      {sentLabel && (
                        <span className="mt-0.5 block text-xs text-sky-800">
                          Data wysyłki: {sentLabel}
                        </span>
                      )}
                      {!s.canSend && s.blockReason && !s.alreadySent && (
                        <span className="mt-1 block text-xs text-amber-800">{s.blockReason}</span>
                      )}
                      {s.alreadySent && (
                        <span className="mt-1 block text-xs text-sky-700">
                          Ponowna wysyłka zablokowana
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
              })}
              {visibleStudents.length === 0 && (
                <li className="py-6 text-center text-sm text-zinc-500">
                  {mode === 'groups' && selectedGroupIds.size === 0
                    ? 'Wybierz grupy powyżej'
                    : 'Brak uczniów w wybranym zakresie'}
                </li>
              )}
            </ul>
          </section>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-sm text-zinc-600">
              Do wysłania: <strong>{toSendCount}</strong> zapytań
              {scopeSummary.alreadySent > 0 && (
                <span className="text-sky-700">
                  {' '}
                  · {scopeSummary.alreadySent} już wysłanych (pominięte)
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={sending || !plannedNextYear || toSendCount === 0}
              className="rounded-xl bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void handleSend()}
            >
              {sending ? 'Wysyłanie…' : 'Wyślij zapytania do rodziców'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
