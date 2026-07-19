'use client';

import { useCallback, useEffect, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';

type ContractDoc = {
  id: string;
  signedAt: string | null;
  status: string;
  paymentType: string | null;
  schoolYearName: string | null;
  children: Array<{ childId: string; firstName: string; lastName: string }>;
};

type PdfFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
  downloadUrl: string;
};

export default function ParentDocumentsTab() {
  const [contracts, setContracts] = useState<ContractDoc[]>([]);
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
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
      setContracts(data.contracts ?? []);
      setPdfFiles(data.pdfFiles ?? []);
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

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moje dokumenty</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Podpisane umowy i pliki PDF wysłane na e-mail po podpisaniu.
        </p>
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
      ) : (
        <div className="space-y-4">
          {contracts.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">Podpisane umowy</h3>
              {contracts.map((c) => (
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

          {pdfFiles.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900">Pliki PDF</h3>
              <ul className="space-y-2">
                {pdfFiles.map((f) => (
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
          ) : (
            <p className="text-sm text-zinc-600">
              Pliki PDF są też wysyłane na Twój adres e-mail po podpisaniu umowy.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
