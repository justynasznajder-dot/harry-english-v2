'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import {
  attendanceStatusClass,
  attendanceStatusLabel,
  formatAmountPln,
  formatLessonDateTime,
  formatMonthLabel,
  paymentDisplayStatusVisual,
} from '@/src/components/parent/parent-portal-utils';

type DisplayStatus = 'AWAITING_INVOICE' | 'UNPAID' | 'PAID';

type InvoiceRef = {
  paymentId: string | null;
  invoiceNumber: string | null;
  hasInvoicePdf: boolean;
  dueDate: string | null;
  paidAt: string | null;
};

type InstallmentRow = InvoiceRef & {
  periodMonth: string;
  amount: string;
  displayStatus: DisplayStatus;
};

type LessonCharge = {
  lessonId: string;
  scheduledAt: string;
  attendanceStatus: string;
  groupName: string;
  unitPrice: string;
  amount: string;
  periodMonth: string;
};

type LessonMonthRow = InvoiceRef & {
  periodMonth: string;
  lessonsCount: number;
  amount: string;
  displayStatus: DisplayStatus;
  lessons: LessonCharge[];
};

type ChildOverview = {
  childId: string;
  childName: string;
  contractId: string;
  paymentType: string;
  schoolYearName: string | null;
  installments: InstallmentRow[] | null;
  yearly: (InstallmentRow & { label: string }) | null;
  lessonMonths: LessonMonthRow[] | null;
  lessonUnitPrice: string | null;
};

async function downloadInvoicePdf(paymentId: string): Promise<void> {
  const res = await fetch(`/api/parent/payments/${paymentId}/invoice`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Nie udało się pobrać faktury');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] ?? 'faktura.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const visual = paymentDisplayStatusVisual(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${visual.className}`}
      title={visual.label}
    >
      {visual.kind === 'paid' ? (
        <span aria-hidden className="text-base leading-none text-emerald-600">
          ✓
        </span>
      ) : visual.kind === 'unpaid' ? (
        <span aria-hidden className="text-base leading-none text-rose-600">
          ✓
        </span>
      ) : (
        <span aria-hidden className="text-sm leading-none text-zinc-400">
          ◌
        </span>
      )}
      {visual.label}
    </span>
  );
}

function InvoiceDownloadButton({
  paymentId,
  invoiceNumber,
}: {
  paymentId: string;
  invoiceNumber: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {invoiceNumber ? <div className="text-xs text-zinc-600">{invoiceNumber}</div> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void downloadInvoicePdf(paymentId)
            .catch((err) => {
              setError(err instanceof Error ? err.message : 'Nie udało się pobrać faktury');
            })
            .finally(() => setBusy(false));
        }}
        className="inline-flex rounded-full bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Pobieranie…' : 'Pobierz fakturę'}
      </button>
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}

function InvoiceCell({ row }: { row: InvoiceRef & { displayStatus: DisplayStatus } }) {
  if (row.displayStatus === 'AWAITING_INVOICE' || !row.paymentId) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  if (row.hasInvoicePdf) {
    return <InvoiceDownloadButton paymentId={row.paymentId} invoiceNumber={row.invoiceNumber} />;
  }
  if (row.invoiceNumber) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-zinc-600">{row.invoiceNumber}</div>
        <span className="text-xs text-amber-800">Faktura bez pliku PDF — skontaktuj się ze szkołą.</span>
      </div>
    );
  }
  return <span className="text-xs text-zinc-400">—</span>;
}

function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      {children}
    </div>
  );
}

function ChildMonthlySection({ child }: { child: ChildOverview }) {
  const rows = child.installments ?? [];
  return (
    <div className="space-y-3">
      <InfoBanner>
        Faktury ratalne wystawiane są w okolicach <strong>10. dnia każdego miesiąca</strong>. Do
        tego czasu status to „Oczekiwanie na fakturę”.
      </InfoBanner>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">Brak harmonogramu rat dla tego roku szkolnego.</p>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <article
                key={row.periodMonth}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">{formatMonthLabel(row.periodMonth)}</p>
                    {row.dueDate ? (
                      <p className="mt-0.5 text-xs text-zinc-500">Termin: {row.dueDate}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={row.displayStatus} />
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-100 pt-3">
                  <p className="text-base font-semibold text-zinc-900">{formatAmountPln(row.amount)}</p>
                  <InvoiceCell row={row} />
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Miesiąc</th>
                  <th className="px-4 py-3 font-semibold">Kwota</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Faktura</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.periodMonth} className="border-t border-zinc-100">
                    <td className="px-4 py-3">
                      <div>{formatMonthLabel(row.periodMonth)}</div>
                      {row.dueDate ? (
                        <div className="text-xs text-zinc-500">Termin: {row.dueDate}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">{formatAmountPln(row.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.displayStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ChildYearlySection({ child }: { child: ChildOverview }) {
  const row = child.yearly;
  if (!row) {
    return <p className="text-sm text-zinc-600">Brak danych o płatności jednorazowej.</p>;
  }
  return (
    <div className="space-y-3">
      <InfoBanner>
        Płatność jednorazowa za rok szkolny. Po wystawieniu faktury status zmieni się na „Do
        zapłaty”, a po zaksięgowaniu wpłaty — na „Opłacone”.
      </InfoBanner>
      <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-zinc-900">{row.label}</p>
            {row.dueDate ? (
              <p className="mt-0.5 text-xs text-zinc-500">Termin: {row.dueDate}</p>
            ) : null}
          </div>
          <StatusBadge status={row.displayStatus} />
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-100 pt-3">
          <p className="text-xl font-semibold text-zinc-900">{formatAmountPln(row.amount)}</p>
          <InvoiceCell row={row} />
        </div>
      </article>
    </div>
  );
}

function ChildLessonSection({ child }: { child: ChildOverview }) {
  const months = child.lessonMonths ?? [];
  return (
    <div className="space-y-4">
      <InfoBanner>
        Rozliczenie za obecności oznaczone przez nauczyciela (obecny / spóźniony)
        {child.lessonUnitPrice ? (
          <>
            {' '}
            × stawka <strong>{formatAmountPln(child.lessonUnitPrice)}</strong>
          </>
        ) : null}
        . Faktura za miesiąc wystawiana jest <strong>ostatniego dnia miesiąca</strong>.
      </InfoBanner>
      {months.length === 0 ? (
        <p className="text-sm text-zinc-600">
          Brak oznaczonych obecności do rozliczenia. Pojawią się tu zajęcia po oznaczeniu przez
          lektora.
        </p>
      ) : (
        months.map((month) => (
          <div
            key={month.periodMonth}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
              <div>
                <p className="font-semibold text-zinc-900">{formatMonthLabel(month.periodMonth)}</p>
                <p className="text-xs text-zinc-500">
                  {month.lessonsCount}{' '}
                  {month.lessonsCount === 1
                    ? 'zajęcie'
                    : month.lessonsCount < 5
                      ? 'zajęcia'
                      : 'zajęć'}{' '}
                  · łącznie {formatAmountPln(month.amount)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={month.displayStatus} />
                <InvoiceCell row={month} />
              </div>
            </div>
            <ul className="divide-y divide-zinc-100">
              {month.lessons.map((lesson) => (
                <li
                  key={lesson.lessonId}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {formatLessonDateTime(lesson.scheduledAt)}
                    </p>
                    <p className="text-xs text-zinc-500">{lesson.groupName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${attendanceStatusClass(lesson.attendanceStatus)}`}
                    >
                      {attendanceStatusLabel(lesson.attendanceStatus)}
                    </span>
                    <span className="font-semibold text-zinc-900">
                      {formatAmountPln(lesson.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

export default function ParentPaymentsTab({ complimentaryAccess }: { complimentaryAccess?: boolean }) {
  const [children, setChildren] = useState<ChildOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parent/payments', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        overview?: { children?: ChildOverview[] };
        complimentaryAccess?: boolean;
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać płatności');
        setChildren([]);
        return;
      }
      setChildren(data.overview?.children ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Płatności</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Harmonogram i status rozliczeń dla wszystkich dzieci. Zielony ✓ = opłacone, czerwony ✓ =
          faktura do zapłaty, ◌ = oczekiwanie na fakturę.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : children.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          Brak podpisanych umów z płatnościami. Harmonogram pojawi się po podpisaniu umowy.
        </div>
      ) : (
        <div className="space-y-8">
          {children.map((child) => (
            <article key={`${child.childId}-${child.contractId}`} className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-emerald-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">{child.childName}</h3>
                  <p className="text-sm text-zinc-600">
                    {paymentTypeShortLabel(child.paymentType)}
                    {child.schoolYearName ? ` · ${child.schoolYearName}` : null}
                  </p>
                </div>
              </div>
              {child.paymentType === 'MONTHLY' ? <ChildMonthlySection child={child} /> : null}
              {child.paymentType === 'YEARLY' ? <ChildYearlySection child={child} /> : null}
              {child.paymentType === 'PER_LESSON' ? <ChildLessonSection child={child} /> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
