'use client';

import { useCallback, useEffect, useState } from 'react';
import { periodMonthKey } from '@/lib/school-timezone';

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

type HeldParentRow = {
  parentId: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  totalAmount: number;
  alreadyInvoiced: boolean;
  lines: Array<{
    contractId: string;
    childId: string | null;
    childName: string;
    amount: number;
    alreadyInvoiced: boolean;
    signedAt: string | null;
  }>;
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

/** Parsuje rabat z pól typu "5", "5%", "5 %". */
function parseDiscountPercent(raw: string): number | null {
  const cleaned = String(raw ?? '')
    .replace(/%/g, '')
    .replace(',', '.')
    .trim();
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function applyDiscount(basePrice: number, discountPercent: number): number {
  return Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
}

function formatAmountInput(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
  const [invoiceMonth, setInvoiceMonth] = useState(() => periodMonthKey());
  const [eppDownloading, setEppDownloading] = useState(false);
  const [heldParents, setHeldParents] = useState<HeldParentRow[]>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [heldIssuingContractId, setHeldIssuingContractId] = useState<string | null>(null);

  const [correctiveOpen, setCorrectiveOpen] = useState(false);
  const [correctiveSourceId, setCorrectiveSourceId] = useState('');
  const [correctiveLoading, setCorrectiveLoading] = useState(false);
  const [correctiveSaving, setCorrectiveSaving] = useState(false);
  const [correctivePreviewLoading, setCorrectivePreviewLoading] = useState(false);
  const [correctivePreviewHtml, setCorrectivePreviewHtml] = useState<string | null>(null);
  const [correctivePreviewNumber, setCorrectivePreviewNumber] = useState<string | null>(null);
  /** Po udanym podglądzie — dopiero wtedy wolno wystawić korektę. */
  const [correctivePreviewReady, setCorrectivePreviewReady] = useState(false);
  const [correctiveFormError, setCorrectiveFormError] = useState<string | null>(null);
  const [correctiveForm, setCorrectiveForm] = useState({
    itemName: '',
    itemQty: '1 szt',
    itemDiscount: '0 %',
    itemUnitPrice: '',
    itemValue: '',
    amount: '',
    correctionReason: '',
  });
  /** Cena z faktury źródłowej — baza do wyliczenia rabatu. */
  const [correctiveBasePrice, setCorrectiveBasePrice] = useState<number | null>(null);

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

  const loadInvoices = useCallback(
    async (yearId: string, billing: BillingFilter, yearMonth: string) => {
      if (!yearId) return;
      setLoading(true);
      setStatusMessage(null);
      try {
        const params = new URLSearchParams({
          schoolYearId: yearId,
          billingType: billing,
        });
        if (yearMonth) params.set('yearMonth', yearMonth);
        const res = await fetch(`/api/accountant/invoices?${params.toString()}`, {
          cache: 'no-store',
        });
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
    },
    []
  );

  const loadHeldInvoices = useCallback(async (periodMonth: string) => {
    setHeldLoading(true);
    try {
      const res = await fetch(
        `/api/accountant/invoices/held?periodMonth=${encodeURIComponent(periodMonth)}`,
        { cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        heldParents?: HeldParentRow[];
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać wstrzymanych faktur');
        setHeldParents([]);
        return;
      }
      setHeldParents(data.heldParents ?? []);
    } catch {
      setStatusMessage('Błąd wczytywania wstrzymanych faktur');
      setHeldParents([]);
    } finally {
      setHeldLoading(false);
    }
  }, []);

  useEffect(() => {
    loadYears();
  }, [loadYears]);

  useEffect(() => {
    if (!schoolYearId) return;
    if (tab === 'clients') loadClients(schoolYearId);
    else {
      loadInvoices(schoolYearId, billingFilter, invoiceMonth);
      void loadHeldInvoices(invoiceMonth);
    }
  }, [schoolYearId, tab, billingFilter, invoiceMonth, loadClients, loadInvoices, loadHeldInvoices]);

  const issueHeldInvoice = async (contractId: string) => {
    setHeldIssuingContractId(contractId);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/accountant/invoices/held', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, periodMonth: invoiceMonth }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        heldParents?: HeldParentRow[];
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wystawić faktury');
        return;
      }
      if (data.heldParents) setHeldParents(data.heldParents);
      else await loadHeldInvoices(invoiceMonth);
      if (schoolYearId) await loadInvoices(schoolYearId, billingFilter, invoiceMonth);
      setStatusMessage(data.message ?? 'Wystawiono fakturę ręcznie');
    } catch {
      setStatusMessage('Błąd ręcznego wystawiania faktury');
    } finally {
      setHeldIssuingContractId(null);
    }
  };

  const downloadEpp = async () => {
    if (!schoolYearId) {
      setStatusMessage('Wybierz rok szkolny');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(invoiceMonth)) {
      setStatusMessage('Wybierz miesiąc eksportu EPP');
      return;
    }
    setEppDownloading(true);
    setStatusMessage(null);
    try {
      const params = new URLSearchParams({
        yearMonth: invoiceMonth,
        schoolYearId,
        billingType: billingFilter,
      });
      const res = await fetch(`/api/accountant/invoices/epp?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setStatusMessage(data.message ?? 'Nie udało się wygenerować pliku EPP');
        return;
      }
      const bytes = await res.arrayBuffer();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/i.exec(disposition);
      const filename = match?.[1] ?? `dokumenty_${invoiceMonth}.epp`;

      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 2000);

      const count = res.headers.get('X-Invoice-Count');
      setStatusMessage(
        count
          ? `Pobrano plik EPP (${count} faktur) za ${invoiceMonth}`
          : `Pobrano plik EPP za ${invoiceMonth}`
      );
    } catch {
      setStatusMessage('Błąd generowania pliku EPP');
    } finally {
      setEppDownloading(false);
    }
  };

  const [saleOptions, setSaleOptions] = useState<InvoiceRow[]>([]);

  const openCorrective = async (invoiceId?: string) => {
    setCorrectiveOpen(true);
    setCorrectiveFormError(null);
    setCorrectivePreviewReady(false);
    setCorrectivePreviewHtml(null);
    setCorrectivePreviewNumber(null);
    setCorrectiveBasePrice(null);
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
      const base = Number(inv.itemUnitPrice);
      setCorrectiveBasePrice(Number.isFinite(base) ? base : Number(inv.amount));
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
    setCorrectiveFormError(null);
    resetCorrectivePreviewGate();
    if (!id) return;
    setCorrectiveLoading(true);
    try {
      const res = await fetch(`/api/accountant/invoices/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { invoice?: InvoiceDetail };
      if (res.ok && data.invoice) {
        const inv = data.invoice;
        const base = Number(inv.itemUnitPrice);
        setCorrectiveBasePrice(Number.isFinite(base) ? base : Number(inv.amount));
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

  const resetCorrectivePreviewGate = () => {
    setCorrectivePreviewReady(false);
    setCorrectivePreviewHtml(null);
    setCorrectivePreviewNumber(null);
  };

  const updateCorrectiveForm = (
    patch:
      | Partial<typeof correctiveForm>
      | ((prev: typeof correctiveForm) => typeof correctiveForm)
  ) => {
    resetCorrectivePreviewGate();
    setCorrectiveFormError(null);
    setCorrectiveForm((prev) =>
      typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
    );
  };

  const getCorrectiveMissingFields = (): string[] => {
    const missing: string[] = [];
    if (!correctiveSourceId) missing.push('faktura źródłowa');
    if (!correctiveForm.itemName.trim()) missing.push('nazwa pozycji');
    if (!correctiveForm.itemQty.trim()) missing.push('ilość');
    const unit = Number(correctiveForm.itemUnitPrice);
    const value = Number(correctiveForm.itemValue);
    const amount = Number(correctiveForm.amount);
    if (!Number.isFinite(unit) || correctiveForm.itemUnitPrice.trim() === '') {
      missing.push('cena jednostkowa');
    }
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(amount) ||
      correctiveForm.amount.trim() === ''
    ) {
      missing.push('wartość / do zapłaty');
    }
    if (!correctiveForm.correctionReason.trim()) missing.push('powód korekty');
    return missing;
  };

  const validateCorrectiveForm = (): boolean => {
    const missing = getCorrectiveMissingFields();
    if (missing.length > 0) {
      setCorrectiveFormError(`Uzupełnij wymagane pola: ${missing.join(', ')}.`);
      return false;
    }
    setCorrectiveFormError(null);
    return true;
  };

  const correctivePayload = () => ({
    originalInvoiceId: correctiveSourceId,
    correctionReason: correctiveForm.correctionReason,
    itemName: correctiveForm.itemName,
    itemQty: correctiveForm.itemQty,
    itemDiscount: correctiveForm.itemDiscount,
    itemUnitPrice: Number(correctiveForm.itemUnitPrice),
    itemValue: Number(correctiveForm.itemValue),
    amount: Number(correctiveForm.amount),
  });

  const previewCorrective = async () => {
    if (!validateCorrectiveForm()) return;
    setCorrectivePreviewLoading(true);
    setCorrectiveFormError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/accountant/invoices/corrective/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctivePayload()),
      });
      const data = (await res.json().catch(() => ({}))) as {
        html?: string;
        invoiceNumber?: string;
        message?: string;
      };
      if (!res.ok || !data.html) {
        setCorrectiveFormError(data.message ?? 'Nie udało się przygotować podglądu');
        setCorrectivePreviewReady(false);
        return;
      }
      setCorrectivePreviewHtml(data.html);
      setCorrectivePreviewNumber(data.invoiceNumber ?? null);
      setCorrectivePreviewReady(true);
    } catch {
      setCorrectiveFormError('Błąd podglądu faktury korygującej');
      setCorrectivePreviewReady(false);
    } finally {
      setCorrectivePreviewLoading(false);
    }
  };

  const submitCorrective = async () => {
    if (!validateCorrectiveForm()) return;
    if (!correctivePreviewReady) {
      setCorrectiveFormError('Najpierw otwórz podgląd korekty, dopiero potem wystaw fakturę.');
      return;
    }
    setCorrectiveSaving(true);
    setCorrectiveFormError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/accountant/invoices/corrective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctivePayload()),
      });
      const data = (await res.json().catch(() => ({}))) as {
        invoiceNumber?: string;
        message?: string;
      };
      if (!res.ok) {
        setCorrectiveFormError(data.message ?? 'Nie udało się wystawić korekty');
        return;
      }
      setCorrectivePreviewHtml(null);
      setCorrectivePreviewNumber(null);
      setCorrectivePreviewReady(false);
      setCorrectiveOpen(false);
      setStatusMessage(`Wystawiono fakturę korygującą ${data.invoiceNumber ?? ''}`);
      setTab('invoices');
      await loadInvoices(schoolYearId, billingFilter, invoiceMonth);
    } catch {
      setCorrectiveFormError('Błąd wystawiania faktury korygującej');
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
            Umowy podpisane, faktury i korekty w wybranym roku szkolnym i miesiącu.
            EPP obejmuje dokładnie te same filtry co lista.
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-2">
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
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Miesiąc wystawienia
              </span>
              <input
                type="month"
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={eppDownloading || !invoiceMonth || !schoolYearId}
              onClick={downloadEpp}
              className="rounded-full bg-[#1e3a4c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {eppDownloading ? 'Generowanie…' : 'Generuj EPP'}
            </button>
          </div>
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
        <div className="space-y-6">
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
                      Brak faktur dla wybranego roku szkolnego i miesiąca
                      {invoiceMonth ? ` (${invoiceMonth})` : ''}.
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

          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
            <h3 className="text-base font-bold text-[#1e3a4c]">Faktury wstrzymane</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Dzieci wyłączone przez managera z automatycznego/ręcznego generowania w miesiącu{' '}
              {invoiceMonth}. Możesz wystawić fakturę ręcznie dla wybranego dziecka.
            </p>

            {heldLoading ? (
              <p className="mt-3 text-sm text-zinc-500">Wczytywanie…</p>
            ) : heldParents.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
                Brak wstrzymanych faktur.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-amber-100 bg-white">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-2 py-2">Rodzic</th>
                      <th className="px-2 py-2">Dziecko</th>
                      <th className="px-2 py-2">Kwota</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heldParents.flatMap((parent) =>
                      parent.lines.map((line, idx) => (
                        <tr key={line.contractId} className="border-b border-zinc-100 align-top">
                          <td className="px-2 py-2">
                            {idx === 0 ? (
                              <>
                                <div className="font-medium text-[#1e3a4c]">
                                  {`${parent.parentFirstName} ${parent.parentLastName}`.trim()}
                                </div>
                                <div className="text-xs text-zinc-500">{parent.parentEmail}</div>
                              </>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">{line.childName}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{money(line.amount)}</td>
                          <td className="px-2 py-2">
                            {line.alreadyInvoiced ? (
                              <span className="text-emerald-700">Wystawiona ręcznie</span>
                            ) : (
                              <span className="text-amber-800">Wstrzymana</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {line.alreadyInvoiced ? (
                              <span className="text-xs text-zinc-500">Już wystawiona</span>
                            ) : (
                              <button
                                type="button"
                                disabled={heldIssuingContractId === line.contractId}
                                onClick={() => void issueHeldInvoice(line.contractId)}
                                className="rounded-full bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {heldIssuingContractId === line.contractId
                                  ? 'Wystawianie…'
                                  : 'Wystaw fakturę ręcznie'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {correctiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-[#1e3a4c]">Faktura korygująca</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Wybierz fakturę sprzedaży i podaj skorygowane pozycje oraz powód.
              Przed wystawieniem obowiązkowy jest podgląd.
            </p>

            {correctiveFormError && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {correctiveFormError}
              </p>
            )}

            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Faktura źródłowa *</span>
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
                  <span className="mb-1 block font-medium">Nazwa pozycji *</span>
                  <input
                    value={correctiveForm.itemName}
                    onChange={(e) => updateCorrectiveForm({ itemName: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Ilość *</span>
                    <input
                      value={correctiveForm.itemQty}
                      onChange={(e) => updateCorrectiveForm({ itemQty: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Rabat %</span>
                    <input
                      value={correctiveForm.itemDiscount}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const pct = parseDiscountPercent(raw);
                        updateCorrectiveForm((p) => {
                          if (
                            pct == null ||
                            correctiveBasePrice == null ||
                            !Number.isFinite(correctiveBasePrice)
                          ) {
                            return { ...p, itemDiscount: raw };
                          }
                          const next = formatAmountInput(
                            applyDiscount(correctiveBasePrice, pct)
                          );
                          return {
                            ...p,
                            itemDiscount: raw,
                            itemUnitPrice: next,
                            itemValue: next,
                            amount: next,
                          };
                        });
                      }}
                      onBlur={() => {
                        const pct = parseDiscountPercent(correctiveForm.itemDiscount);
                        if (pct == null) return;
                        updateCorrectiveForm({ itemDiscount: `${pct} %` });
                      }}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                      placeholder="0 %"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Cena jedn. *</span>
                    <input
                      type="number"
                      step="0.01"
                      value={correctiveForm.itemUnitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateCorrectiveForm({
                          itemUnitPrice: v,
                          itemValue: v,
                          amount: v,
                        });
                      }}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Wartość / do zapłaty *</span>
                    <input
                      type="number"
                      step="0.01"
                      value={correctiveForm.amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateCorrectiveForm({
                          amount: v,
                          itemValue: v,
                        });
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
                      updateCorrectiveForm({ correctionReason: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2"
                    placeholder="Np. zmiana kwoty, błędne dane nabywcy…"
                  />
                </label>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCorrectiveOpen(false);
                  setCorrectiveFormError(null);
                  setCorrectivePreviewReady(false);
                  setCorrectivePreviewHtml(null);
                  setCorrectivePreviewNumber(null);
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={correctivePreviewLoading || correctiveSaving || correctiveLoading}
                onClick={previewCorrective}
                className="rounded-full border border-[#0f6e56] px-4 py-2 text-sm font-semibold text-[#0f6e56] disabled:opacity-50"
              >
                {correctivePreviewLoading ? 'Generowanie…' : 'Podgląd'}
              </button>
              <button
                type="button"
                disabled={
                  !correctivePreviewReady ||
                  correctiveSaving ||
                  correctiveLoading ||
                  correctivePreviewLoading
                }
                onClick={submitCorrective}
                title={
                  correctivePreviewReady
                    ? undefined
                    : 'Najpierw otwórz podgląd korekty'
                }
                className="rounded-full bg-[#0f3c33] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {correctiveSaving ? 'Zapisywanie…' : 'Wystaw korektę'}
              </button>
            </div>
          </div>
        </div>
      )}

      {correctivePreviewHtml && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3 className="text-lg font-bold text-[#1e3a4c]">Podgląd faktury korygującej</h3>
              <p className="mt-1 text-sm text-zinc-600">
                Sprawdź dokument, a następnie wystaw korektę
                {correctivePreviewNumber ? ` · nr ${correctivePreviewNumber}` : ''}.
              </p>
              {correctiveFormError && (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {correctiveFormError}
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-3">
              <iframe
                srcDoc={correctivePreviewHtml}
                title="Podgląd faktury korygującej"
                className="block w-full rounded-lg border border-zinc-200 bg-white"
                style={{ height: 'min(70vh, 820px)' }}
                sandbox="allow-same-origin"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setCorrectivePreviewHtml(null);
                  setCorrectivePreviewNumber(null);
                  // Podgląd był otwarty — wystawianie nadal możliwe po powrocie do edycji,
                  // dopóki nie zmienisz pól (wtedy gate się resetuje).
                }}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
              >
                Wróć do edycji
              </button>
              <button
                type="button"
                disabled={correctiveSaving || !correctivePreviewReady}
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
