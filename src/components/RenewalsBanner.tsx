'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RenewalStatus } from '@/lib/renewal-status';

type RenewalItem = {
  id: string;
  childId: string;
  season: string;
  status: RenewalStatus;
  childFirstName: string;
  childLastName: string;
  groupName: string | null;
  locationName: string;
  schedule: string;
  hasPendingProposal: boolean;
};

type Flash = { kind: 'success' | 'error' | 'info'; message: string };

export default function RenewalsBanner({
  onFlash,
  onUpdated,
}: {
  onFlash: (flash: Flash) => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<Record<string, boolean>>({});
  const [rejectComments, setRejectComments] = useState<Record<string, string>>({});
  const [declineOpen, setDeclineOpen] = useState<Record<string, boolean>>({});
  const [dataConfirmed, setDataConfirmed] = useState<Record<string, boolean>>({});
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/renewals/status', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) {
        setItems([]);
        return;
      }
      const data = (await r.json()) as {
        showBanner?: boolean;
        renewals?: RenewalItem[];
      };
      setItems(data.renewals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return null;
  if (items.length === 0) return null;

  async function runAction(id: string, fn: () => Promise<boolean>) {
    if (busyRef.current) {
      onFlash({ kind: 'info', message: 'Trwa inna akcja — poczekaj chwilę.' });
      return;
    }
    busyRef.current = true;
    setBusyId(id);
    try {
      const ok = await fn();
      if (ok) {
        await load();
        await onUpdated?.();
      }
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 md:p-5">
      <header>
        <h2 className="text-lg font-bold text-amber-950">Odnowienie na kolejny rok szkolny</h2>
        <p className="text-sm text-amber-900">
          Szkoła pyta o kontynuację zajęć — potwierdź, czy {items.length === 1 ? 'Twoje dziecko' : 'Twoje dzieci'}{' '}
          będzie uczyć się w kolejnym roku.
        </p>
      </header>
      <div className="space-y-3">
        {items.map((r) => (
          <article
            key={r.id}
            className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
          >
            <p className="font-semibold text-zinc-900">
              {r.childFirstName} {r.childLastName}
            </p>

            {r.status === 'PENDING_CONFIRMATION' && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-zinc-700">
                  Szkoła pyta, czy {r.childFirstName} będzie kontynuować zajęcia w roku szkolnym{' '}
                  {r.season}. Po potwierdzeniu otrzymasz propozycję grupy i terminu.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() =>
                      void runAction(r.id, async () => {
                        const res = await fetch(
                          `/api/renewals/${encodeURIComponent(r.id)}/confirm`,
                          { method: 'PUT', credentials: 'include' },
                        );
                        const data = (await res.json().catch(() => ({}))) as { message?: string };
                        if (!res.ok) {
                          onFlash({
                            kind: 'error',
                            message: data.message ?? 'Nie udało się potwierdzić',
                          });
                          return false;
                        }
                        onFlash({
                          kind: 'success',
                          message: 'Dziękujemy! Szkoła przygotuje propozycję grupy na nowy rok.',
                        });
                        return true;
                      })
                    }
                  >
                    Tak, chcę kontynuować
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
                    onClick={() => setDeclineOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  >
                    Nie kontynuujemy
                  </button>
                </div>
                {declineOpen[r.id] && (
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <textarea
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Powód rezygnacji (opcjonalnie)"
                      value={rejectComments[r.id] ?? ''}
                      onChange={(e) =>
                        setRejectComments((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
                      onClick={() =>
                        void runAction(r.id, async () => {
                          const res = await fetch(
                            `/api/renewals/${encodeURIComponent(r.id)}/decline`,
                            {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                reason: (rejectComments[r.id] ?? '').trim() || undefined,
                              }),
                              credentials: 'include',
                            },
                          );
                          const data = (await res.json().catch(() => ({}))) as { message?: string };
                          if (!res.ok) {
                            onFlash({
                              kind: 'error',
                              message: data.message ?? 'Nie udało się zgłosić rezygnacji',
                            });
                            return false;
                          }
                          onFlash({
                            kind: 'success',
                            message: 'Zgłosiliśmy rezygnację z odnowienia. Szkoła się z Tobą skontaktuje.',
                          });
                          setDeclineOpen((p) => ({ ...p, [r.id]: false }));
                          return true;
                        })
                      }
                    >
                      Potwierdź rezygnację
                    </button>
                  </div>
                )}
              </div>
            )}

            {r.status === 'CONFIRMED' && (
              <p className="mt-2 text-sm text-sky-900">
                Dziękujemy za potwierdzenie! Szkoła przygotuje propozycję grupy na nowy rok.
              </p>
            )}

            {r.status === 'PROPOSED' && r.hasPendingProposal && (
              <div className="mt-2 space-y-2">
                <p className="text-sm font-medium text-emerald-900">Propozycja grupy na nowy rok</p>
                <p className="text-sm text-zinc-700">
                  {r.groupName ?? 'Grupa'} · {r.locationName} · {r.schedule}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() =>
                      void runAction(r.id, async () => {
                        const res = await fetch(`/api/renewals/${encodeURIComponent(r.id)}/accept`, {
                          method: 'PUT',
                          credentials: 'include',
                        });
                        const data = (await res.json().catch(() => ({}))) as { message?: string };
                        if (!res.ok) {
                          onFlash({
                            kind: 'error',
                            message: data.message ?? 'Nie udało się zaakceptować',
                          });
                          return false;
                        }
                        onFlash({ kind: 'success', message: 'Propozycja zaakceptowana.' });
                        return true;
                      })
                    }
                  >
                    Akceptuję propozycję
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
                    onClick={() => setRejectOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  >
                    Proponuję inny termin
                  </button>
                </div>
                {rejectOpen[r.id] && (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Napisz, jaki termin Ci odpowiada (opcjonalnie)"
                      value={rejectComments[r.id] ?? ''}
                      onChange={(e) =>
                        setRejectComments((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white"
                      onClick={() =>
                        void runAction(r.id, async () => {
                          const res = await fetch(`/api/renewals/${encodeURIComponent(r.id)}/reject`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              rejectionComment: (rejectComments[r.id] ?? '').trim() || undefined,
                            }),
                            credentials: 'include',
                          });
                          const data = (await res.json().catch(() => ({}))) as { message?: string };
                          if (!res.ok) {
                            onFlash({
                              kind: 'error',
                              message: data.message ?? 'Nie udało się wysłać uwag',
                            });
                            return false;
                          }
                          onFlash({
                            kind: 'success',
                            message: 'Przekazaliśmy szkole Twoją prośbę o inny termin.',
                          });
                          setRejectOpen((p) => ({ ...p, [r.id]: false }));
                          return true;
                        })
                      }
                    >
                      Wyślij uwagi
                    </button>
                  </div>
                )}
              </div>
            )}

            {r.status === 'NEGOTIATING' && (
              <p className="mt-2 text-sm text-amber-900">
                Szkoła przygotuje nową propozycję grupy lub terminu.
              </p>
            )}

            {r.status === 'ACCEPTED' && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-emerald-800">
                  Propozycja zaakceptowana. Potwierdź i zapisz dane do umowy — szkoła wygeneruje
                  dokument.
                </p>
                <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#0f6e56]"
                    checked={Boolean(dataConfirmed[r.id])}
                    onChange={(e) =>
                      setDataConfirmed((p) => ({ ...p, [r.id]: e.target.checked }))
                    }
                  />
                  <span>
                    Potwierdzam, że dane do umowy i faktury są{' '}
                    <strong>aktualne i poprawne</strong>. Po zapisaniu poczekam na wygenerowanie
                    umowy przez szkołę.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busyId === r.id || !dataConfirmed[r.id]}
                  className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={() =>
                    void runAction(r.id, async () => {
                      if (!dataConfirmed[r.id]) {
                        onFlash({
                          kind: 'error',
                          message: 'Potwierdź, że dane do umowy i faktury są aktualne.',
                        });
                        return false;
                      }
                      const res = await fetch('/api/renewals/contract-data/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ renewalId: r.id }),
                        credentials: 'include',
                      });
                      const data = (await res.json().catch(() => ({}))) as { message?: string };
                      if (!res.ok) {
                        onFlash({
                          kind: 'error',
                          message: data.message ?? 'Nie udało się zapisać danych',
                        });
                        return false;
                      }
                      onFlash({
                        kind: 'success',
                        message:
                          data.message ??
                          'Dane zapisane. Poczekaj na wygenerowanie umowy przez szkołę.',
                      });
                      return true;
                    })
                  }
                >
                  Zapisz dane do umowy
                </button>
              </div>
            )}

            {r.status === 'AWAITING_CONTRACT' && (
              <p className="mt-2 text-sm text-violet-900">
                Dane zapisane. Poczekaj na wygenerowanie umowy na rok {r.season}.
              </p>
            )}

            {r.status === 'CONTRACT_READY' && (
              <p className="mt-2 text-sm text-indigo-900">
                Umowa gotowa — podpisz ją w zakładce zapisu / odnowienia.
              </p>
            )}

            {r.status === 'SIGNED' && (
              <p className="mt-2 text-sm text-emerald-800">
                Umowa podpisana — do zobaczenia w nowym roku szkolnym!
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
