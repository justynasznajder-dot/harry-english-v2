'use client';

import { useCallback, useEffect, useState } from 'react';

type SchoolYear = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  isActive: boolean;
};

type ClientRow = {
  contractId: string;
  paymentType: string | null;
  amount: number | null;
  signedAt: string | null;
  billingType: 'company' | 'private';
  billingExempt: boolean;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    clientNumber?: string | null;
    companyName: string | null;
    nip: string | null;
  };
  group: { id: string; name: string | null } | null;
  childrenNames: string;
};

type InvoiceRow = {
  id: string;
  paymentId: string;
  invoiceNumber: string;
  documentType: string;
  correctsInvoiceId: string | null;
  correctionReason: string | null;
  originalInvoiceNumber: string | null;
  issueDate: string;
  buyerName: string;
  buyerNip: string | null;
  billingType: 'company' | 'private';
  amount: number;
  itemName: string;
  paymentStatus: string | null;
  hasPdf: boolean;
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  documentType: string;
  itemName: string;
  itemQty: string;
  itemDiscount: string;
  itemUnitPrice: number;
  itemValue: number;
  amount: number;
  issueDate: string;
  saleDate: string;
  dueDate: string;
};

type Tab = 'clients' | 'invoices';
type BillingFilter = 'all' | 'company' | 'private';

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Raty miesięczne',
  YEARLY: 'Płatność roczna',
  PER_LESSON: 'Za zajęcia',
};

function paymentTypeLabel(value: string | null): string {
  if (!value) return '—';
  return PAYMENT_TYPE_LABELS[value] ?? value;
}

function paymentStatusLabel(value: string | null): string {
  if (!value) return '—';
  const map: Record<string, string> = {
    PENDING: 'Oczekuje',
    PAID: 'Opłacona',
    OVERDUE: 'Zaległa',
    CANCELLED: 'Anulowana',
  };
  return map[value] ?? value;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

export default function AccountantPortal() {
  const [tab, setTab] = useState<Tab>('clients');
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [schoolYearId, setSchoolYearId] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [correctiveOpen, setCorrectiveOpen] = useState(false);
  const [correctiveSourceId, setCorrectiveSourceId] = useState('');
  const [correctiveLoading, setCorrectiveLoading] = useState(false);
  const [correctiveSaving, setCorrectiveSaving] = useState(false);
  const [correctiveForm, setCorrectiveForm] = useState({
    itemName: '',
    itemQty: '1 szt',
    itemDiscount: '0 %',
    itemUnitPrice: '',
    itemValue: '',
    amount: '',
    correctionReason: '',
  });

  const loadYears = useCallback(async () => {
    try {
      const res = await fetch('/api/accountant/school-years', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        years?: SchoolYear[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać lat szkolnych');
        return;
      }
      const list = data.years ?? [];
      setYears(list);
      const active = list.find((y) => y.isActive) ?? list[0];
      if (active) setSchoolYearId((prev) => prev || active.id);
    } catch {
      setStatusMessage('Błąd wczytywania lat szkolnych');
    }
  }, []);

  const loadClients = useCallback(async (yearId: string) => {
    if (!yearId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `/api/accountant/clients?schoolYearId=${encodeURIComponent(yearId)}`,
        { cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        clients?: ClientRow[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać klientów');
        setClients([]);
        return;
      }
      setClients(data.clients ?? []);
    } catch {
      setStatusMessage('Błąd wczytywania klientów');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async (yearId: string, billing: BillingFilter) => {
    if (!yearId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(
        `/api/accountant/invoices?schoolYearId=${encodeURIComponent(yearId)}&billingType=${billing}`,
        { cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        invoices?: InvoiceRow[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać faktur');
        setInvoices([]);
        return;
      }
      setInvoices(data.invoices ?? []);
    } catch {
      setStatusMessage('Błąd wczytywania faktur');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadYears();
  }, [loadYears]);

  useEffect(() => {
    if (!schoolYearId) return;
    if (tab === 'clients') loadClients(schoolYearId);
    else loadInvoices(schoolYearId, billingFilter);
  }, [schoolYearId, tab, billingFilter, loadClients, loadInvoices]);

  const [saleOptions, setSaleOptions] = useState<InvoiceRow[]>([]);

  const openCorrective = async (invoiceId?: string) => {
    setCorrectiveOpen(true);
    setCorrectiveForm({
      itemName: '',
      itemQty: '1 szt',
      itemDiscount: '0 %',
      itemUnitPrice: '',
      itemValue: '',
      amount: '',
      correctionReason: '',
    });
    setCorrectiveLoading(true);
    try {
      let sales = invoices.filter((i) => i.documentType === 'SALE');
      if (schoolYearId) {
        const res = await fetch(
          `/api/accountant/invoices?schoolYearId=${encodeURIComponent(schoolYearId)}&billingType=all`,
          { cache: 'no-store' }
        );
        const data = (await res.json().catch(() => ({}))) as { invoices?: InvoiceRow[] };
        if (res.ok && data.invoices) {
          sales = data.invoices.filter((i) => i.documentType === 'SALE');
          setSaleOptions(sales);
        } else {
          setSaleOptions(sales);
        }
      } else {
        setSaleOptions(sales);
      }
      const sourceId = invoiceId || sales[0]?.id || '';
      setCorrectiveSourceId(sourceId);
      if (!sourceId) return;
      const detailRes = await fetch(`/api/accountant/invoices/${encodeURIComponent(sourceId)}`, {
        cache: 'no-store',
      });
      const detailData = (await detailRes.json().catch(() => ({}))) as {
        invoice?: InvoiceDetail;
        message?: string;
      };
      if (!detailRes.ok || !detailData.invoice) {
        setStatusMessage(detailData.message ?? 'Nie udało się wczytać faktury źródłowej');
        return;
      }
      const inv = detailData.invoice;
      setCorrectiveForm({
        itemName: inv.itemName,
        itemQty: inv.itemQty || '1 szt',
        itemDiscount: inv.itemDiscount || '0 %',
        itemUnitPrice: String(inv.itemUnitPrice),
        itemValue: String(inv.itemValue),
        amount: String(inv.amount),
        correctionReason: '',
      });
    } catch {
      setStatusMessage('Błąd wczytywania faktury źródłowej');
    } finally {
      setCorrectiveLoading(false);
    }
  };

  const onChangeCorrectiveSource = async (id: string) => {
    setCorrectiveSourceId(id);
    if (!id) return;
    setCorrectiveLoading(true);
    try {
      const res = await fetch(`/api/accountant/invoices/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { invoice?: InvoiceDetail };
      if (res.ok && data.invoice) {
        const inv = data.invoice;
        setCorrectiveForm((prev) => ({
          ...prev,
          itemName: inv.itemName,
          itemQty: inv.itemQty || '1 szt',
          itemDiscount: inv.itemDiscount || '0 %',
          itemUnitPrice: String(inv.itemUnitPrice),
          itemValue: String(inv.itemValue),
          amount: String(inv.amount),
        }));
      }
    } finally {
      setCorrectiveLoading(false);
    }
  };

  const submitCorrective = async () => {
    if (!correctiveSourceId) {
      setStatusMessage('Wybierz fakturę źródłową');
      return;
    }
    if (!correctiveForm.correctionReason.trim()) {
      setStatusMessage('Podaj powód korekty');
      return;
    }
    setCorrectiveSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/accountant/invoices/corrective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalInvoiceId: correctiveSourceId,
          correctionReason: correctiveForm.correctionReason,
          itemName: correctiveForm.itemName,
          itemQty: correctiveForm.itemQty,
          itemDiscount: correctiveForm.itemDiscount,
          itemUnitPrice: Number(correctiveForm.itemUnitPrice),
          itemValue: Number(correctiveForm.itemValue),
          amount: Number(correctiveForm.amount),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        invoiceNumber?: string;
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wystawić korekty');
        return;
      }
      setCorrectiveOpen(false);
      setStatusMessage(`Wystawiono fakturę korygującą ${data.invoiceNumber ?? ''}`);
      setTab('invoices');
      await loadInvoices(schoolYearId, billingFilter);
    } catch {
      setStatusMessage('Błąd wystawiania faktury korygującej');
    } finally {
      setCorrectiveSaving(false);
    }
  };

  const saleInvoices = saleOptions.length > 0 ? saleOptions : invoices.filter((i) => i.documentType === 'SALE');

  return (
    <div className="rounded-3xl bg-[#f8f6f3] p-4 shadow-xl sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1e3a4c]">Panel księgowej</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Umowy podpisane, faktury i korekty w wybranym roku szkolnym.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[#1e3a4c]">Rok szkolny</span>
          <select
            value={schoolYearId}
            onChange={(e) => setSchoolYearId(e.target.value)}
            className="min-w-[220px] rounded-xl border border-zinc-300 bg-white px-3 py-2"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isActive ? ' (aktywny)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('clients')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'clients'
              ? 'bg-[#0f3c33] text-white'
              : 'border border-zinc-300 bg-white text-[#1e3a4c]'
          }`}
        >
          Klienci (umowy)
        </button>
        <button
          type="button"
          onClick={() => setTab('invoices')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'invoices'
              ? 'bg-[#0f3c33] text-white'
              : 'border border-zinc-300 bg-white text-[#1e3a4c]'
          }`}
        >
          Faktury
        </button>
        {tab === 'invoices' && (
          <button
            type="button"
            onClick={() => openCorrective()}
            className="rounded-full border border-[#0f6e56] bg-[#d8f3ea] px-4 py-2 text-sm font-semibold text-[#0f6e56]"
          >
            Wystaw fakturę korygującą
          </button>
        )}
      </div>

      {tab === 'invoices' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ['all', 'Wszystkie'],
              ['company', 'Na firmę'],
              ['private', 'Osoby prywatne'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBillingFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                billingFilter === key
                  ? 'bg-[#1e3a4c] text-white'
                  : 'border border-zinc-300 bg-white text-zinc-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {statusMessage && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {statusMessage}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-zinc-500">Ładowanie…</p>
      ) : tab === 'clients' ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">Płatnik</th>
                <th className="px-2 py-2">Dzieci</th>
                <th className="px-2 py-2">Grupa</th>
                <th className="px-2 py-2">System płatności</th>
                <th className="px-2 py-2">Rozliczenie</th>
                <th className="px-2 py-2">Kwota</th>
                <th className="px-2 py-2">Podpisano</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-zinc-500">
                    Brak podpisanych umów w tym roku.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.contractId} className="border-b border-zinc-200 align-top">
                    <td className="px-2 py-2 font-mono text-xs text-zinc-600">
                      {c.parent.clientNumber ?? '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-[#1e3a4c]">
                        {c.parent.firstName} {c.parent.lastName}
                      </div>
                      <div className="text-xs text-zinc-500">{c.parent.email}</div>
                      {c.billingType === 'company' && c.parent.companyName && (
                        <div className="text-xs text-zinc-600">
                          {c.parent.companyName}
                          {c.parent.nip ? ` · NIP ${c.parent.nip}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">{c.childrenNames || '—'}</td>
                    <td className="px-2 py-2">{c.group?.name || '—'}</td>
                    <td className="px-2 py-2">{paymentTypeLabel(c.paymentType)}</td>
                    <td className="px-2 py-2">
                      {c.billingType === 'company' ? 'Firma' : 'Osoba prywatna'}
                      {c.billingExempt ? ' · zwolniony' : ''}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{money(c.amount)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {c.signedAt ? String(c.signedAt).slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-2 py-2">Numer</th>
                <th className="px-2 py-2">Typ</th>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Nabywca</th>
                <th className="px-2 py-2">Kwota</th>
                <th className="px-2 py-2">Status płatności</th>
                <th className="px-2 py-2">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-zinc-500">
                    Brak faktur dla wybranego filtra.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-200 align-top">
                    <td className="px-2 py-2 font-medium text-[#1e3a4c]">{inv.invoiceNumber}</td>
                    <td className="px-2 py-2">
                      {inv.documentType === 'CORRECTIVE' ? 'Korekta' : 'Sprzedaż'}
                      {inv.originalInvoiceNumber && (
                        <div className="text-xs text-zinc-500">→ {inv.originalInvoiceNumber}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{inv.issueDate}</td>
                    <td className="px-2 py-2">
                      <div>{inv.buyerName}</div>
                      <div className="text-xs text-zinc-500">
                        {inv.billingType === 'company' ? 'Firma' : 'Osoba prywatna'}
                        {inv.buyerNip ? ` · NIP ${inv.buyerNip}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{money(inv.amount)}</td>
                    <td className="px-2 py-2">
                      <span title="Edycja statusu — wkrótce">
                        {paymentStatusLabel(inv.paymentStatus)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        {inv.hasPdf && (
                          <a
                            href={`/api/accountant/invoices/${encodeURIComponent(inv.id)}?format=pdf`}
                            className="text-xs font-semibold text-[#0f6e56] hover:underline"
                          >
                            Pobierz PDF
                          </a>
                        )}
                        {inv.documentType === 'SALE' && (
                          <button
                            type="button"
                            onClick={() => openCorrective(inv.id)}
                            className="text-left text-xs font-semibold text-[#1e3a4c] hover:underline"
                          >
                            Wystaw korektę
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {correctiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-[#1e3a4c]">Faktura korygująca</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Wybierz fakturę sprzedaży i podaj skorygowane pozycje oraz powód.
            </p>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Faktura źródłowa</span>
              <select
                value={correctiveSourceId}
                onChange={(e) => onChangeCorrectiveSource(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2"
              >
                <option value="">— wybierz —</option>
                {saleInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} · {inv.buyerName} · {money(inv.amount)}
                  </option>
                ))}
              </select>
            </label>

            {correctiveLoading ? (
              <p className="mt-4 text-sm text-zinc-500">Ładowanie danych faktury…</p>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Nazwa pozycji</span>
                  <input
                    value={correctiveForm.itemName}
                    onChange={(e) =>
                      setCorrectiveForm((p) => ({ ...p, itemName: e.target.value }))
                    }
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Ilość</span>
                    <input
                      value={correctiveForm.itemQty}
                      onChange={(e) =>
                        setCorrectiveForm((p) => ({ ...p, itemQty: e.target.value }))
                      }
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Rabat</span>
                    <input
                      value={correctiveForm.itemDiscount}
                      onChange={(e) =>
                        setCorrectiveForm((p) => ({ ...p, itemDiscount: e.target.value }))
                      }
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Cena jedn.</span>
                    <input
                      type="number"
                      step="0.01"
                      value={correctiveForm.itemUnitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCorrectiveForm((p) => ({
                          ...p,
                          itemUnitPrice: v,
                          itemValue: v,
                          amount: v,
                        }));
                      }}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Wartość / do zapłaty</span>
                    <input
                      type="number"
                      step="0.01"
                      value={correctiveForm.amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCorrectiveForm((p) => ({
                          ...p,
                          amount: v,
                          itemValue: v,
                        }));
                      }}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Powód korekty *</span>
                  <textarea
                    value={correctiveForm.correctionReason}
                    onChange={(e) =>
                      setCorrectiveForm((p) => ({ ...p, correctionReason: e.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    placeholder="Np. zmiana kwoty, błędne dane nabywcy…"
                  />
                </label>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectiveOpen(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={correctiveSaving || correctiveLoading}
                onClick={submitCorrective}
                className="rounded-full bg-[#0f3c33] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {correctiveSaving ? 'Zapisywanie…' : 'Wystaw korektę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
