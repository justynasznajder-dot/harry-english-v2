'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';

type ContractDoc = {
  id: string;
  signedAt: string | null;
  status: string;
  paymentType: string | null;
  schoolYearName: string | null;
  contractNumber: string | null;
  children: Array<{ childId: string; firstName: string; lastName: string }>;
};

type PdfFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
  downloadUrl: string;
};

const ALL_YEARS = 'all';

function yearFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const y = new Date(value).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function yearFromPdf(file: PdfFile): number | null {
  const fromPath = file.key.match(/\/umowa\/(\d{4})\//);
  if (fromPath) return Number(fromPath[1]);
  return yearFromIso(file.lastModified);
}

function contractNumberSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\//g, '-');
}

function pdfMatchesContracts(file: PdfFile, contracts: ContractDoc[]): boolean {
  if (contracts.length === 0) return false;

  const numberSlugs = contracts
    .map((c) => contractNumberSlug(c.contractNumber))
    .filter((s): s is string => Boolean(s));
  if (numberSlugs.some((slug) => file.filename.includes(slug))) {
    return true;
  }

  const calendarYears = new Set(
    contracts.map((c) => yearFromIso(c.signedAt)).filter((y): y is number => y != null)
  );
  if (calendarYears.size === 0) return false;
  const fileYear = yearFromPdf(file);
  return fileYear != null && calendarYears.has(fileYear);
}

export default function ParentDocumentsTab() {
  const [contracts, setContracts] = useState<ContractDoc[]>([]);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parent/documents', { cache: 'no-store', credentials: 'include' });
      const data = (await r.json().catch(() => ({}))) as {
        contracts?: ContractDoc[];
        pdfFiles?: PdfFile[];
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać dokumentów');
        setContracts([]);
        setPdfFiles([]);
        return;
      }
      const nextContracts = data.contracts ?? [];
      setContracts(nextContracts);
      setPdfFiles(data.pdfFiles ?? []);

      const years = Array.from(
        new Set(
          nextContracts
            .map((c) => yearFromIso(c.signedAt))
            .filter((y): y is number => y != null)
        )
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
      setContracts([]);
      setPdfFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set([
        ...contracts.map((c) => yearFromIso(c.signedAt)),
        ...pdfFiles.map((f) => yearFromPdf(f)),
      ].filter((y): y is number => y != null))
    ).sort((a, b) => b - a);

    const options: Array<{ id: string; label: string }> = years.map((y) => ({
      id: String(y),
      label: String(y),
    }));
    if (options.length > 1) {
      options.unshift({ id: ALL_YEARS, label: 'Wszystkie lata' });
    }
    return options;
  }, [contracts, pdfFiles]);

  const showYearSelector = yearOptions.length > 0;

  const filteredContracts = useMemo(() => {
    if (selectedYear === ALL_YEARS) return contracts;
    const year = Number(selectedYear);
    return contracts.filter((c) => yearFromIso(c.signedAt) === year);
  }, [contracts, selectedYear]);

  const filteredPdfFiles = useMemo(() => {
    if (selectedYear === ALL_YEARS) return pdfFiles;
    if (filteredContracts.length === 0) {
      const year = Number(selectedYear);
      return pdfFiles.filter((f) => yearFromPdf(f) === year);
    }
    const matched = pdfFiles.filter((f) => pdfMatchesContracts(f, filteredContracts));
    if (matched.length > 0) return matched;
    const year = Number(selectedYear);
    return pdfFiles.filter((f) => yearFromPdf(f) === year);
  }, [pdfFiles, filteredContracts, selectedYear]);

  const emptyForYear =
    !loading &&
    !error &&
    filteredContracts.length === 0 &&
    filteredPdfFiles.length === 0 &&
    (contracts.length > 0 || pdfFiles.length > 0);

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moje dokumenty</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Podpisane umowy i pliki PDF wysłane na e-mail po podpisaniu.
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
      ) : contracts.length === 0 && pdfFiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
          Brak podpisanych dokumentów. Po podpisaniu umowy pojawi się tutaj podsumowanie i pliki PDF.
        </div>
      ) : emptyForYear ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
          Brak dokumentów dla wybranego roku.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredContracts.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">Podpisane umowy</h3>
              {filteredContracts.map((c) => (
                <article
                  key={c.id}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"
                >
                  <p className="font-semibold text-zinc-900">
                    Umowa {c.schoolYearName ? `— ${c.schoolYearName}` : ''}
                  </p>
                  {c.signedAt ? (
                    <p className="mt-1 text-sm text-zinc-600">
                      Podpisano:{' '}
                      {new Date(c.signedAt).toLocaleDateString('pl-PL', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  ) : null}
                  {c.paymentType ? (
                    <p className="text-sm text-zinc-600">
                      Rozliczenie: {paymentTypeShortLabel(c.paymentType)}
                    </p>
                  ) : null}
                  {c.children.length > 0 ? (
                    <p className="mt-2 text-sm text-zinc-700">
                      Dzieci:{' '}
                      {c.children.map((ch) => `${ch.firstName} ${ch.lastName}`).join(', ')}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {filteredPdfFiles.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">Pliki PDF</h3>
              <ul className="space-y-2">
                {filteredPdfFiles.map((f) => (
                  <li
                    key={f.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{f.filename}</p>
                      {f.lastModified ? (
                        <p className="text-xs text-zinc-500">
                          {new Date(f.lastModified).toLocaleDateString('pl-PL')}
                        </p>
                      ) : null}
                    </div>
                    <a
                      href={f.downloadUrl}
                      className="rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b5a46]"
                    >
                      Pobierz PDF
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : filteredContracts.length > 0 ? (
            <p className="text-sm text-zinc-600">
              Pliki PDF są też wysyłane na Twój adres e-mail po podpisaniu umowy.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
