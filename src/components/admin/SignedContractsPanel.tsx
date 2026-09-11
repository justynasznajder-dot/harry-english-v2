'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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

type ImageConsentFilter = '' | 'yes' | 'no';
type BillingTypeFilter = '' | 'company' | 'private';
type VoucherFilter = '' | 'yes' | 'no';
type PaymentTypeFilter = '' | 'MONTHLY' | 'YEARLY' | 'PER_LESSON';

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

function HeaderFilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const active = value !== '';
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`w-full max-w-[11rem] cursor-pointer rounded-lg border bg-white px-2 py-1.5 text-left text-xs font-semibold text-zinc-800 outline-none ring-[#0f6e56] focus:ring-2 ${
        active ? 'border-[#0f6e56] text-[#0f6e56]' : 'border-emerald-100'
      } ${className}`}
    >
      {children}
    </select>
  );
}

export default function SignedContractsPanel() {
  const [rows, setRows] = useState<SignedContractRow[]>([]);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [imageConsentFilter, setImageConsentFilter] = useState<ImageConsentFilter>('');
  const [billingTypeFilter, setBillingTypeFilter] = useState<BillingTypeFilter>('');
  const [voucherFilter, setVoucherFilter] = useState<VoucherFilter>('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilter>('');
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

      if (billingTypeFilter && row.billingType !== billingTypeFilter) return false;

      if (voucherFilter === 'yes' && !row.hasDiscountVoucher) return false;
      if (voucherFilter === 'no' && row.hasDiscountVoucher) return false;

      if (paymentTypeFilter && row.paymentType !== paymentTypeFilter) {
        return false;
      }

      return true;
    });
  }, [
    rows,
    locationFilter,
    groupFilter,
    imageConsentFilter,
    billingTypeFilter,
    voucherFilter,
    paymentTypeFilter,
  ]);

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

  const paymentTypeOptions = useMemo(() => {
    const present = new Set<string>();
    for (const row of rows) {
      const t = row.paymentType?.trim();
      if (!t) continue;
      present.add(t);
    }
    const order = ['MONTHLY', 'YEARLY', 'PER_LESSON'] as const;
    const options: { value: string; label: string }[] = order
      .filter((t) => present.has(t))
      .map((t) => ({ value: t, label: paymentTypeShortLabel(t) }));
    for (const t of present) {
      if (!(order as readonly string[]).includes(t)) {
        options.push({ value: t, label: paymentTypeShortLabel(t) });
      }
    }
    return options;
  }, [rows]);

  const tableHeader = (
    <thead className="bg-zinc-50 text-zinc-700">
      <tr>
        <th className="px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block leading-snug">Imię i nazwisko dziecka</span>
            <HeaderFilterSelect
              value={billingTypeFilter}
              onChange={(v) => setBillingTypeFilter(v as BillingTypeFilter)}
              ariaLabel="Filtr typu umowy"
              className="max-w-[12rem]"
            >
              <option value="">Typ: wszystkie</option>
              <option value="company">Na firmę</option>
              <option value="private">Na os. prywatną</option>
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block">Lokalizacja</span>
            <HeaderFilterSelect
              value={locationFilter}
              onChange={(v) => {
                setLocationFilter(v);
                setGroupFilter('');
              }}
              ariaLabel="Filtr lokalizacji"
            >
              <option value="">Wszystkie</option>
              {locationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
              {hasNoLocationRows ? <option value="__none__">Bez lokalizacji</option> : null}
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block">Grupa</span>
            <HeaderFilterSelect
              value={groupFilter}
              onChange={setGroupFilter}
              ariaLabel="Filtr grupy"
            >
              <option value="">Wszystkie</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              {hasNoGroupRows ? <option value="__none__">Bez grupy</option> : null}
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="max-w-[8.5rem] px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block leading-snug">
              Wykorzystanie
              <br />
              wizerunku
            </span>
            <HeaderFilterSelect
              value={imageConsentFilter}
              onChange={(v) => setImageConsentFilter(v as ImageConsentFilter)}
              ariaLabel="Filtr wykorzystania wizerunku"
            >
              <option value="">Wszystkie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block">Bon zniżkowy</span>
            <HeaderFilterSelect
              value={voucherFilter}
              onChange={(v) => setVoucherFilter(v as VoucherFilter)}
              ariaLabel="Filtr bonu zniżkowego"
            >
              <option value="">Wszystkie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="px-3 py-2 align-bottom font-semibold">
          <div className="space-y-1.5">
            <span className="block">Sposób płatności</span>
            <HeaderFilterSelect
              value={paymentTypeFilter}
              onChange={(v) => setPaymentTypeFilter(v as PaymentTypeFilter)}
              ariaLabel="Filtr sposobu płatności"
              className="max-w-[12rem]"
            >
              <option value="">Wszystkie</option>
              {paymentTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </HeaderFilterSelect>
          </div>
        </th>
        <th className="px-3 py-2.5 align-bottom text-right font-semibold">Kwota na umowie</th>
      </tr>
    </thead>
  );

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
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-xs sm:text-sm">
            {tableHeader}
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    {rows.length === 0
                      ? 'Brak podpisanych umów.'
                      : 'Brak wyników dla wybranych filtrów.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={`${row.contractId}:${row.childId}`}
                    className="border-t border-zinc-100"
                  >
                    <td className="px-3 py-2.5 font-medium text-zinc-900">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {row.childName}
                        {row.billingType === 'company' ? (
                          <span
                            className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-inset ring-sky-200"
                            title="Umowa na firmę"
                          >
                            Firma
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-800">
                      {row.locationName?.trim() || (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-800">
                      {row.groupName?.trim() || <span className="text-zinc-400">—</span>}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
