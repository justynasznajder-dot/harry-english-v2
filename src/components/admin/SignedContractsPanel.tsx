'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatContractAmount } from '@/lib/contract-html';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import { downloadSignedContractsXlsx } from '@/lib/signed-contracts-xlsx';

type SignedContractRow = {
  contractId: string;
  childId: string;
  childName: string;
  locationId: string | null;
  locationName: string | null;
  groupId: string | null;
  groupName: string | null;
  imageConsent: boolean | null;
  hasDiscountVoucher: boolean;
  paymentType: string | null;
  amount: string | null;
  signedAt: string | null;
  billingType: 'company' | 'private';
};

type ImageConsentFilter = '' | 'yes' | 'no' | 'unknown';
type BillingTypeFilter = '' | 'company' | 'private';

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

const selectClass =
  'rounded-full border border-emerald-100 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56] focus:ring-2';

export default function SignedContractsPanel() {
  const [rows, setRows] = useState<SignedContractRow[]>([]);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [imageConsentFilter, setImageConsentFilter] = useState<ImageConsentFilter>('');
  const [billingTypeFilter, setBillingTypeFilter] = useState<BillingTypeFilter>('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!row.locationId) continue;
      const name = row.locationName?.trim() || 'Lokalizacja';
      if (!map.has(row.locationId)) map.set(row.locationId, name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [rows]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { name: string; locationId: string | null }>();
    for (const row of rows) {
      if (!row.groupId) continue;
      if (locationFilter === '__none__') {
        if (row.locationId) continue;
      } else if (locationFilter && row.locationId !== locationFilter) {
        continue;
      }
      const name = row.groupName?.trim() || 'Grupa';
      if (!map.has(row.groupId)) {
        map.set(row.groupId, { name, locationId: row.locationId });
      }
    }
    return [...map.entries()]
      .map(([id, meta]) => ({ id, name: meta.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }, [rows, locationFilter]);

  useEffect(() => {
    if (!groupFilter) return;
    if (!groupOptions.some((g) => g.id === groupFilter)) {
      setGroupFilter('');
    }
  }, [groupFilter, groupOptions]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (locationFilter === '__none__') {
        if (row.locationId) return false;
      } else if (locationFilter && row.locationId !== locationFilter) {
        return false;
      }

      if (groupFilter === '__none__') {
        if (row.groupId) return false;
      } else if (groupFilter && row.groupId !== groupFilter) {
        return false;
      }

      if (imageConsentFilter === 'yes' && row.imageConsent !== true) return false;
      if (imageConsentFilter === 'no' && row.imageConsent !== false) return false;
      if (imageConsentFilter === 'unknown' && row.imageConsent != null) return false;

      if (billingTypeFilter && row.billingType !== billingTypeFilter) return false;

      return true;
    });
  }, [rows, locationFilter, groupFilter, imageConsentFilter, billingTypeFilter]);

  const exportXlsx = useCallback(async () => {
    if (filteredRows.length === 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
      await downloadSignedContractsXlsx({ rows: filteredRows });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować pliku Excel');
    } finally {
      setExporting(false);
    }
  }, [filteredRows, exporting]);

  const countLabel = useMemo(() => {
    const n = filteredRows.length;
    return n === 1 ? '1 podpisana umowa' : `${n} podpisanych umów`;
  }, [filteredRows.length]);

  const hasNoLocationRows = useMemo(
    () => rows.some((row) => !row.locationId),
    [rows],
  );

  const hasNoGroupRows = useMemo(() => {
    return rows.some((row) => {
      if (row.groupId) return false;
      if (locationFilter === '__none__') return !row.locationId;
      if (locationFilter) return row.locationId === locationFilter;
      return true;
    });
  }, [rows, locationFilter]);

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">Umowy podpisane</h2>
          <p className="text-sm text-zinc-600">
            Dzieci z podpisaną umową w aktywnym roku — zgody, sposób płatności i kwota z umowy.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || exporting || filteredRows.length === 0}
          onClick={() => void exportXlsx()}
          className="shrink-0 rounded-full border border-[#0f6e56] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? 'Generowanie…' : 'Pobierz Excel'}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj ucznia lub rodzica..."
          className="min-w-[220px] flex-1 rounded-full border border-emerald-100 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-[#0f6e56] placeholder:text-zinc-400 focus:ring-2"
        />
        <select
          value={locationFilter}
          onChange={(e) => {
            setLocationFilter(e.target.value);
            setGroupFilter('');
          }}
          className={selectClass}
          aria-label="Filtr lokalizacji"
        >
          <option value="">Lokalizacja: wszystkie</option>
          {locationOptions.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
          {hasNoLocationRows ? (
            <option value="__none__">Bez lokalizacji</option>
          ) : null}
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className={selectClass}
          aria-label="Filtr grupy"
        >
          <option value="">Grupa: wszystkie</option>
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          {hasNoGroupRows ? <option value="__none__">Bez grupy</option> : null}
        </select>
        <select
          value={imageConsentFilter}
          onChange={(e) => setImageConsentFilter(e.target.value as ImageConsentFilter)}
          className={selectClass}
          aria-label="Filtr zgody na wizerunek"
        >
          <option value="">Zgoda na wizerunek: wszystkie</option>
          <option value="yes">Tak</option>
          <option value="no">Nie</option>
          <option value="unknown">Brak danych</option>
        </select>
        <select
          value={billingTypeFilter}
          onChange={(e) => setBillingTypeFilter(e.target.value as BillingTypeFilter)}
          className={selectClass}
          aria-label="Filtr typu umowy"
        >
          <option value="">Typ umowy: wszystkie</option>
          <option value="company">Na firmę</option>
          <option value="private">Na os. prywatną</option>
        </select>
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
      ) : filteredRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Brak podpisanych umów.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-xs sm:text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Imię i nazwisko dziecka</th>
                <th className="px-3 py-2.5 font-semibold">Lokalizacja</th>
                <th className="px-3 py-2.5 font-semibold">Zgoda na wykorzystanie wizerunku</th>
                <th className="px-3 py-2.5 font-semibold">Kod zniżkowy</th>
                <th className="px-3 py-2.5 font-semibold">Sposób płatności</th>
                <th className="px-3 py-2.5 font-semibold text-right">Kwota na umowie</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={`${row.contractId}:${row.childId}`}
                  className="border-t border-zinc-100"
                >
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{row.childName}</td>
                  <td className="px-3 py-2.5 text-zinc-800">
                    {row.locationName?.trim() || (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <ConsentCell value={row.imageConsent} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ConsentCell value={row.hasDiscountVoucher} />
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
