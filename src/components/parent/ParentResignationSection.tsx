'use client';

import { useState } from 'react';
import type { UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';

type Flash = { kind: 'success' | 'error'; message: string };

export default function ParentResignationSection({
  userInfo,
  onUpdated,
}: {
  userInfo: UserInfo;
  onUpdated?: () => void | Promise<void>;
}) {
  const signedChildren = (userInfo.children ?? []).filter(
    (c) =>
      c.active !== false &&
      (c.accessLevel === 'SIGNED' || c.accessLevel === 'COMPLETED') &&
      c.childId
  );

  const [selectedChildId, setSelectedChildId] = useState(signedChildren[0]?.childId ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (signedChildren.length === 0) return null;

  const selectedChild = signedChildren.find((c) => c.childId === selectedChildId);

  async function submitResignation() {
    if (!selectedChildId || !reason.trim()) {
      setFlash({ kind: 'error', message: 'Podaj powód rezygnacji.' });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch('/api/children/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ childId: selectedChildId, reason: reason.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zgłosić rezygnacji' });
        return;
      }
      setFlash({
        kind: 'success',
        message: 'Rezygnacja została zgłoszona. Status: oczekuje na kontakt ze szkołą.',
      });
      setReason('');
      setConfirmOpen(false);
      await onUpdated?.();
    } catch {
      setFlash({ kind: 'error', message: 'Błąd połączenia z serwerem' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-rose-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Rezygnacja z zajęć</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Zgłoś rezygnację w trakcie roku szkolnego. Szkoła skontaktuje się w sprawie formalności.
        </p>
      </header>

      {signedChildren.map((child) =>
        child.resignationRequested ? (
          <div
            key={child.childId}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            <p className="font-semibold">
              {child.firstName} {child.lastName} — oczekuje na kontakt ze szkołą
            </p>
            {child.resignationReason ? (
              <p className="mt-1 text-amber-900">Powód: {child.resignationReason}</p>
            ) : null}
          </div>
        ) : null
      )}

      {signedChildren.some((c) => !c.resignationRequested) ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 p-4">
          {signedChildren.length > 1 ? (
            <label className="block text-sm">
              <span className="font-semibold text-zinc-800">Dziecko</span>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              >
                {signedChildren
                  .filter((c) => !c.resignationRequested)
                  .map((c) => (
                    <option key={c.childId} value={c.childId}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
              </select>
            </label>
          ) : selectedChild && !selectedChild.resignationRequested ? (
            <p className="text-sm text-zinc-700">
              Dziecko:{' '}
              <span className="font-semibold">
                {selectedChild.firstName} {selectedChild.lastName}
              </span>
            </p>
          ) : null}

          {!selectedChild?.resignationRequested ? (
            <>
              <label className="block text-sm">
                <span className="font-semibold text-zinc-800">Powód rezygnacji</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  placeholder="Np. zmiana planu dnia, przeprowadzka…"
                />
              </label>

              {!confirmOpen ? (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!reason.trim() || busy}
                  className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50"
                >
                  Zgłoś rezygnację
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm text-rose-900">
                    Czy na pewno chcesz zgłosić rezygnację? Szkoła skontaktuje się w tej sprawie.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submitResignation()}
                      className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? 'Wysyłanie…' : 'Potwierdź rezygnację'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmOpen(false)}
                      className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {flash ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            flash.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {flash.message}
        </div>
      ) : null}
    </section>
  );
}
