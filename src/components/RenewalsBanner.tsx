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
  const [renewalsOpen, setRenewalsOpen] = useState(false);
  const [season, setSeason] = useState<string | null>(null);
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<Record<string, boolean>>({});
  const [rejectComments, setRejectComments] = useState<Record<string, string>>({});
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
        renewalsOpen?: boolean;
        renewalsSeason?: string | null;
        showBanner?: boolean;
        renewals?: RenewalItem[];
      };
      setRenewalsOpen(data.renewalsOpen ?? false);
      setSeason(data.renewalsSeason ?? null);
      setItems(data.renewals ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = items.filter((r) =>
    ['PENDING_CONFIRMATION', 'CONFIRMED', 'PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED'].includes(
      r.status,
    ),
  );

  if (loading) return null;

  const showSection =
    visible.length > 0 &&
    (renewalsOpen ||
      visible.some((r) =>
        ['PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SIGNED'].includes(r.status),
      ));

  if (!showSection) return null;

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
        <h2 className="text-lg font-bold text-amber-950">Nowy rok szkolny</h2>
        {season && <p className="text-sm text-amber-900">Sezon {season}</p>}
      </header>
      <div className="space-y-3">
        {visible.map((r) => (
          <article
            key={r.id}
            className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
          >
            <p className="font-semibold text-zinc-900">
              {r.childFirstName} {r.childLastName}
            </p>
            {r.status === 'PENDING_CONFIRMATION' && renewalsOpen && (
              <>
                <p className="mt-1 text-sm text-zinc-700">
                  Zapisz {r.childFirstName} na nowy rok {season ?? ''}
                </p>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="mt-3 rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={() =>
                    void runAction(r.id, async () => {
                      const res = await fetch(`/api/renewals/${encodeURIComponent(r.id)}/confirm`, {
                        method: 'PUT',
                        credentials: 'include',
                      });
                      const data = (await res.json().catch(() => ({}))) as { message?: string };
                      if (!res.ok) {
                        onFlash({ kind: 'error', message: data.message ?? 'Nie udało się potwierdzić' });
                        return false;
                      }
                      onFlash({ kind: 'success', message: 'Dziękujemy! Czekamy na propozycję terminu zajęć.' });
                      return true;
                    })
                  }
                >
                  Chcę kontynuować
                </button>
              </>
            )}
            {r.status === 'CONFIRMED' && (
              <p className="mt-2 text-sm text-sky-900">
                Dziękujemy! Czekamy na propozycję terminu zajęć.
              </p>
            )}
            {r.status === 'PROPOSED' && r.hasPendingProposal && (
              <div className="mt-2 space-y-2">
                <p className="text-sm font-medium text-emerald-900">Propozycja grupy</p>
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
                          onFlash({ kind: 'error', message: data.message ?? 'Nie udało się zaakceptować' });
                          return false;
                        }
                        onFlash({ kind: 'success', message: 'Propozycja zaakceptowana.' });
                        return true;
                      })
                    }
                  >
                    Akceptuję
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
                    onClick={() => setRejectOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  >
                    Odrzucam
                  </button>
                </div>
                {rejectOpen[r.id] && (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Komentarz (opcjonalnie)"
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
                            onFlash({ kind: 'error', message: data.message ?? 'Nie udało się odrzucić' });
                            return false;
                          }
                          onFlash({ kind: 'success', message: 'Propozycja odrzucona.' });
                          setRejectOpen((p) => ({ ...p, [r.id]: false }));
                          return true;
                        })
                      }
                    >
                      Potwierdź odrzucenie
                    </button>
                  </div>
                )}
              </div>
            )}
            {r.status === 'NEGOTIATING' && (
              <p className="mt-2 text-sm text-amber-900">Szkoła przygotuje nową propozycję.</p>
            )}
            {r.status === 'ACCEPTED' && (
              <p className="mt-2 text-sm text-emerald-800">Zaakceptowano. Czeka na podpisanie umowy.</p>
            )}
            {r.status === 'SIGNED' && (
              <p className="mt-2 text-sm text-emerald-800">
                Umowa podpisana. Do zobaczenia w nowym roku!
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
