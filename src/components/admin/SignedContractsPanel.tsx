'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatContractAmount } from '@/lib/contract-html';
import { paymentTypeShortLabel } from '@/lib/payment-labels';

type SignedContractRow = {
  contractId: string;
  childId: string;
  childName: string;
  imageConsent: boolean | null;
  pickupConsent: boolean | null;
  paymentType: string | null;
  amount: string | null;
  signedAt: string | null;
};

function consentLabel(value: boolean | null): string {
  if (value === true) return 'Tak';
  if (value === false) return 'Nie';
  return '—';
}

function ConsentCell({ value }: { value: boolean | null }) {
  const label = consentLabel(value);
  if (label === '—') {
    return <span className="text-zinc-400">—</span>;
  }
  const cls =
    value === true
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-zinc-100 text-zinc-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatAmountPln(amount: string | null): string {
  const formatted = formatContractAmount(amount);
  if (!formatted) return '—';
  return `${formatted} zł`;
}

export default function SignedContractsPanel() {
  const [rows, setRows] = useState<SignedContractRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
      const r = await fetch(`/api/admin/signed-contracts${q}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await r.json().catch(() => ({}))) as {
        rows?: SignedContractRow[];
        message?: string;
      };
      if (!r.ok) throw new Error(data.message ?? 'Błąd pobierania listy');
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania listy');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const countLabel = useMemo(() => {
    const n = rows.length;
    return n === 1 ? '1 podpisana umowa' : `${n} podpisanych umów`;
  }, [rows.length]);

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">Podpisane faktury</h2>
        <p className="text-sm text-zinc-600">
          Dzieci z podpisaną umową w aktywnym roku — zgody, sposób płatności i kwota z umowy.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj ucznia lub rodzica..."
          className="min-w-[220px] flex-1 rounded-full border border-emerald-100 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56] placeholder:text-zinc-400 focus:ring-2"
        />
        <button
          type="button"
          onClick={() => void load(search)}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-[#0f6e56]"
        >
          Odśwież
        </button>
      </div>

      <p className="text-sm text-zinc-600">Razem {countLabel}</p>

      {loading ? (
        <div className="space-y-2 py-4">
          <div className="h-10 animate-pulse rounded-xl bg-emerald-50" />
          <div className="h-10 animate-pulse rounded-xl bg-emerald-50/80" />
          <div className="h-10 animate-pulse rounded-xl bg-emerald-50/60" />
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-rose-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Brak podpisanych umów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Imię i nazwisko dziecka</th>
                <th className="px-3 py-2.5 font-semibold">Zgoda na wykorzystanie wizerunku</th>
                <th className="px-3 py-2.5 font-semibold">Upoważnienie do odbioru</th>
                <th className="px-3 py-2.5 font-semibold">Sposób płatności</th>
                <th className="px-3 py-2.5 font-semibold text-right">Kwota na umowie</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.contractId}:${row.childId}`}
                  className="border-t border-zinc-100"
                >
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{row.childName}</td>
                  <td className="px-3 py-2.5">
                    <ConsentCell value={row.imageConsent} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ConsentCell value={row.pickupConsent} />
                  </td>
                  <td className="px-3 py-2.5 text-zinc-800">
                    {row.paymentType ? paymentTypeShortLabel(row.paymentType) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-900">
                    {formatAmountPln(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
