'use client';

import { useCallback, useEffect, useState } from 'react';

type ResignationRow = {
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  reason: string | null;
  requestedAt: string | null;
  groupName: string | null;
  accessLevel: string | null;
};

type Props = {
  pushToast: (kind: 'success' | 'error', message: string) => void;
  onChange?: () => void | Promise<void>;
};

function formatRequestedAt(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ConfirmAction = {
  childId: string;
  childName: string;
  action: 'acknowledge' | 'process';
};

export default function ResignationsPanel({ pushToast, onChange }: Props) {
  const [rows, setRows] = useState<ResignationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/resignations', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await r.json().catch(() => ({}))) as {
        resignations?: ResignationRow[];
        message?: string;
      };
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania rezygnacji');
      setRows(Array.isArray(data.resignations) ? data.resignations : []);
      await onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania rezygnacji');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(pending: ConfirmAction) {
    const { childId, action } = pending;
    setBusyId(childId);
    try {
      const r = await fetch('/api/admin/resignations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ childId, action }),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        pushToast('error', data.message ?? 'Operacja nieudana');
        return;
      }
      pushToast('success', data.message ?? 'Zapisano');
      setConfirmAction(null);
      await load();
    } catch {
      pushToast('error', 'Błąd połączenia z serwerem');
    } finally {
      setBusyId(null);
    }
  }

  const confirmBusy = confirmAction != null && busyId === confirmAction.childId;

  return (
    <section className="space-y-4 rounded-3xl border border-rose-100 bg-white p-5 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Rezygnacje</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Zgłoszenia rezygnacji od rodziców w trakcie roku. Po kontakcie oznacz jako obsłużone albo
            wypisz dziecko z grupy — anulujemy jego umowy i przeliczymy rabat rodzeństwa na
            pozostałych.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-[#0f6e56]"
        >
          Odśwież
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}{' '}
          <button type="button" className="underline" onClick={() => void load()}>
            Spróbuj ponownie
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
          Brak otwartych zgłoszeń rezygnacji.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.childId}
              className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="text-base font-semibold text-zinc-900">{row.childName}</p>
                  <p className="text-zinc-700">
                    Rodzic: <span className="font-medium">{row.parentName}</span> ·{' '}
                    <a href={`mailto:${row.parentEmail}`} className="text-[#0f6e56] underline">
                      {row.parentEmail}
                    </a>
                  </p>
                  <p className="text-zinc-600">
                    Grupa: {row.groupName ?? '—'} · Zgłoszono: {formatRequestedAt(row.requestedAt)}
                  </p>
                  {row.reason ? (
                    <p className="mt-1 text-zinc-800">
                      <span className="font-semibold">Powód:</span> {row.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <button
                    type="button"
                    disabled={busyId === row.childId}
                    onClick={() =>
                      setConfirmAction({
                        childId: row.childId,
                        childName: row.childName,
                        action: 'acknowledge',
                      })
                    }
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                  >
                    Oznacz jako obsłużone
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.childId}
                    onClick={() =>
                      setConfirmAction({
                        childId: row.childId,
                        childName: row.childName,
                        action: 'process',
                      })
                    }
                    className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Wypisz i dezaktywuj
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resignation-confirm-title"
          >
            <h3 id="resignation-confirm-title" className="text-lg font-semibold text-zinc-900">
              {confirmAction.action === 'acknowledge'
                ? 'Oznacz jako obsłużone'
                : 'Wypisz i dezaktywuj'}
            </h3>
            <p className="mt-3 text-sm text-zinc-600">
              {confirmAction.action === 'acknowledge' ? (
                <>
                  Oznaczyć rezygnację dla <strong>{confirmAction.childName}</strong> jako obsłużoną?
                  Dziecko zostanie w grupie.
                </>
              ) : (
                <>
                  Wypisać <strong>{confirmAction.childName}</strong> z grupy i dezaktywować? Umowy
                  tego dziecka zostaną anulowane, a na umowach rodzeństwa przeliczony zostanie
                  rabat.
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold"
                disabled={confirmBusy}
                onClick={() => setConfirmAction(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                className={
                  confirmAction.action === 'acknowledge'
                    ? 'rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
                    : 'rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
                }
                onClick={() => void runAction(confirmAction)}
              >
                {confirmBusy
                  ? 'Zapisywanie…'
                  : confirmAction.action === 'acknowledge'
                    ? 'Oznacz jako obsłużone'
                    : 'Wypisz i dezaktywuj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
