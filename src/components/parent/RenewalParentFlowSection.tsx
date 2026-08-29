'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ContractPortal from '@/src/components/ContractPortal';
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

type ParentContractDocument = {
  id: string;
  status: string;
  content_html: string | null;
  child_attachments: Array<{
    child_id: string;
    first_name: string;
    last_name: string;
    attachment_1_html: string | null;
    attachment_2_html: string | null;
  }>;
  signed_at?: string | null;
};

type Flash = { kind: 'success' | 'error' | 'info'; message: string };

const renewalSteps = [
  { key: 'confirm', label: 'Potwierdzenie' },
  { key: 'proposal', label: 'Propozycja' },
  { key: 'contract', label: 'Umowa' },
  { key: 'done', label: 'Potwierdzenie' },
] as const;

function renewalStepIndex(status: RenewalStatus, hasPendingProposal: boolean): number {
  if (status === 'SIGNED') return 3;
  if (status === 'ACCEPTED' || status === 'AWAITING_CONTRACT' || status === 'CONTRACT_READY') return 2;
  if (status === 'PROPOSED' && hasPendingProposal) return 1;
  if (status === 'NEGOTIATING') return 1;
  if (status === 'CONFIRMED') return 1;
  if (status === 'PENDING_CONFIRMATION') return 0;
  return 0;
}

export default function RenewalParentFlowSection({
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
  const [contractPreview, setContractPreview] = useState<ParentContractDocument | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [renewalsRes, statusRes] = await Promise.all([
        fetch('/api/renewals/status', { cache: 'no-store', credentials: 'include' }),
        fetch('/api/enrollment/status', { cache: 'no-store', credentials: 'include' }),
      ]);
      if (renewalsRes.ok) {
        const data = (await renewalsRes.json()) as { renewals?: RenewalItem[] };
        setItems(data.renewals ?? []);
      } else {
        setItems([]);
      }
      if (statusRes.ok) {
        const data = (await statusRes.json()) as { parentContract?: ParentContractDocument | null };
        setContractPreview(data.parentContract ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxStepIndex = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((r) => renewalStepIndex(r.status, r.hasPendingProposal)));
  }, [items]);

  if (loading || items.length === 0) return null;

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

  const isContractSigned = contractPreview?.status === 'SIGNED';

  return (
    <section className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/50 p-4 md:p-5">
      <header>
        <h2 className="text-lg font-bold text-amber-950 md:text-xl">Odnowienie na kolejny rok szkolny</h2>
        <p className="mt-1 text-sm text-amber-900">
          Ten sam proces co przy zapisie: potwierdzenie → propozycja grupy → umowa → potwierdzenie.
        </p>
      </header>

      <div className="no-scrollbar overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {renewalSteps.map((step, index) => {
            const isSelected = index === maxStepIndex;
            const isReachable = index <= maxStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-4 py-2 text-xs font-semibold sm:text-sm ${
                    isSelected
                      ? 'border-[#ffc94a] bg-[#fff6dd] text-[#3b2a10]'
                      : isReachable
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {step.label}
                </span>
                {index < renewalSteps.length - 1 && <span className="text-zinc-300">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {items.map((r) => (
          <article
            key={r.id}
            className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
          >
            <p className="font-semibold text-zinc-900">
              {r.childFirstName} {r.childLastName} · rok {r.season}
            </p>

            {r.status === 'PENDING_CONFIRMATION' && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-zinc-700">
                  Czy {r.childFirstName} będzie kontynuować zajęcia w roku {r.season}?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
                        onFlash({
                          kind: 'success',
                          message: 'Dziękujemy! Szkoła przygotuje propozycję grupy.',
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
                          const res = await fetch(`/api/renewals/${encodeURIComponent(r.id)}/decline`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              reason: (rejectComments[r.id] ?? '').trim() || undefined,
                            }),
                            credentials: 'include',
                          });
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
                            message: 'Zgłosiliśmy rezygnację z odnowienia.',
                          });
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
                Dziękujemy za potwierdzenie! Szkoła przygotuje propozycję grupy.
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
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
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
                      placeholder="Napisz, jaki termin Ci odpowiada"
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
              <div className="mt-3 space-y-3">
                <p className="text-sm text-emerald-800">
                  Propozycja zaakceptowana. Potwierdź dane do umowy — szkoła wygeneruje dokument po
                  ostatecznym zatwierdzeniu grupy.
                </p>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  className="rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={() =>
                    void runAction(r.id, async () => {
                      const res = await fetch('/api/renewals/contract-data/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ renewalId: r.id }),
                      });
                      const data = (await res.json().catch(() => ({}))) as { message?: string };
                      if (!res.ok) {
                        onFlash({
                          kind: 'error',
                          message: data.message ?? 'Nie udało się potwierdzić danych',
                        });
                        return false;
                      }
                      onFlash({
                        kind: 'success',
                        message:
                          data.message ??
                          'Dane potwierdzone. Poczekaj na wygenerowanie umowy przez szkołę.',
                      });
                      return true;
                    })
                  }
                >
                  Potwierdzam dane — czekam na umowę
                </button>
              </div>
            )}

            {r.status === 'AWAITING_CONTRACT' && (
              <p className="mt-2 text-sm text-violet-900">
                Dane do umowy zostały przekazane. Poczekaj na ostateczne zatwierdzenie grupy — szkoła
                wygeneruje umowę na rok {r.season}.
              </p>
            )}

            {r.status === 'CONTRACT_READY' && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-indigo-900">
                  Umowa na rok {r.season} jest gotowa — podpisz poniżej.
                </p>
                {contractPreview && !isContractSigned ? (
                  <ContractPortal
                    contract={{
                      id: contractPreview.id,
                      status: contractPreview.status,
                      content_html: contractPreview.content_html ?? '',
                      child_attachments: contractPreview.child_attachments,
                    }}
                    onSigned={async () => {
                      onFlash({
                        kind: 'success',
                        message: 'Umowa podpisana — dziecko zapisane na kolejny rok!',
                      });
                      await load();
                      await onUpdated?.();
                    }}
                  />
                ) : null}
              </div>
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
