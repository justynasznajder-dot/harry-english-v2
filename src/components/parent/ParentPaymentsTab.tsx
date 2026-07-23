'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import {
  formatAmountPln,
  formatMonthLabel,
  paymentStatusClass,
  paymentStatusLabel,
} from '@/src/components/parent/parent-portal-utils';

type PaymentRow = {
  id: string;
  childId: string | null;
  childName: string | null;
  amount: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  periodMonth: string | null;
  description: string | null;
  paymentType: string | null;
  source: 'payment' | 'lesson_billing';
  billingPeriodStatus: string | null;
  invoiceNumber: string | null;
  hasInvoicePdf: boolean;
};

const ALL_YEARS = 'all';

function yearFromPayment(p: PaymentRow): number | null {
  if (p.periodMonth) {
    const y = Number(p.periodMonth.slice(0, 4));
    if (Number.isFinite(y)) return y;
  }
  if (p.dueDate) {
    const y = Number(p.dueDate.slice(0, 4));
    if (Number.isFinite(y)) return y;
  }
  if (p.paidAt) {
    const y = new Date(p.paidAt).getFullYear();
    if (Number.isFinite(y)) return y;
  }
  return null;
}

export default function ParentPaymentsTab({ complimentaryAccess }: { complimentaryAccess?: boolean }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parent/payments', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        payments?: PaymentRow[];
        complimentaryAccess?: boolean;
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać płatności');
        setPayments([]);
        return;
      }
      const nextPayments = data.payments ?? [];
      setPayments(nextPayments);

      const years = Array.from(
        new Set(nextPayments.map((p) => yearFromPayment(p)).filter((y): y is number => y != null))
      ).sort((a, b) => b - a);

      setSelectedYear((prev) => {
        if (prev !== ALL_YEARS && years.includes(Number(prev))) return prev;
        const current = new Date().getFullYear();
        if (years.includes(current)) return String(current);
        if (years[0]) return String(years[0]);
        return ALL_YEARS;
      });
    } catch {
      setError('Błąd połączenia z serwerem');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(payments.map((p) => yearFromPayment(p)).filter((y): y is number => y != null))
    ).sort((a, b) => b - a);

    const options: Array<{ id: string; label: string }> = years.map((y) => ({
      id: String(y),
      label: String(y),
    }));
    if (options.length > 1) {
      options.unshift({ id: ALL_YEARS, label: 'Wszystkie lata' });
    }
    return options;
  }, [payments]);

  const showYearSelector = yearOptions.length > 0;

  const filteredPayments = useMemo(() => {
    if (selectedYear === ALL_YEARS) return payments;
    const year = Number(selectedYear);
    return payments.filter((p) => yearFromPayment(p) === year);
  }, [payments, selectedYear]);

  if (complimentaryAccess) {
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Płatności</h2>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-6 text-sm text-sky-900">
          <p className="font-semibold">Tryb bez opłat</p>
          <p className="mt-2">
            Twoje konto korzysta z dostępu do systemu bez generowania faktur i bez pobierania
            płatności.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Płatności</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Status rozliczeń zgodnie z umową. Faktury PDF możesz pobrać poniżej.
          </p>
        </div>
        {showYearSelector && !loading && !error ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Rok</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="min-w-[160px] rounded-xl border border-emerald-200 px-3 py-2 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Okres</th>
                <th className="px-4 py-3 font-semibold">Dziecko</th>
                <th className="px-4 py-3 font-semibold">Kwota</th>
                <th className="px-4 py-3 font-semibold">Rozliczenie</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Faktura</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                    {payments.length > 0
                      ? 'Brak płatności dla wybranego roku.'
                      : 'Brak danych o płatnościach.'}
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={`${p.source}-${p.id}`} className="border-t border-zinc-100">
                    <td className="px-4 py-3">
                      <div>{p.periodMonth ? formatMonthLabel(p.periodMonth) : '—'}</div>
                      {p.dueDate ? (
                        <div className="text-xs text-zinc-500">Termin: {p.dueDate}</div>
                      ) : null}
                      {p.description ? (
                        <div className="text-xs text-zinc-500">{p.description}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{p.childName ?? '—'}</td>
                    <td className="px-4 py-3 font-medium">{formatAmountPln(p.amount)}</td>
                    <td className="px-4 py-3">
                      {p.paymentType ? paymentTypeShortLabel(p.paymentType) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${paymentStatusClass(p.status)}`}
                      >
                        {paymentStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.source === 'payment' && p.hasInvoicePdf ? (
                        <div className="space-y-1">
                          {p.invoiceNumber ? (
                            <div className="text-xs text-zinc-500">{p.invoiceNumber}</div>
                          ) : null}
                          <a
                            href={`/api/parent/payments/${p.id}/invoice`}
                            className="inline-flex text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
                          >
                            Pobierz fakturę
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
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
