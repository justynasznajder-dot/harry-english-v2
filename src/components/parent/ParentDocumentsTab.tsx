'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { paymentTypeShortLabel } from '@/lib/payment-labels';
import {
  PICKUP_CONSENT_DOCUMENT_TITLE,
  PICKUP_CONSENT_PDF_TITLE,
  PICKUP_CONSENT_PDF_TITLE_LEGACY,
} from '@/lib/pickup-consent-notice';
import { IMAGE_CONSENT_PDF_TITLE } from '@/lib/image-consent-notice';

type ContractChild = { childId: string; firstName: string; lastName: string };

type ContractDoc = {
  id: string;
  signedAt: string | null;
  status: string;
  paymentType: string | null;
  schoolYearName: string | null;
  contractNumber: string | null;
  children: ContractChild[];
};

type PdfFile = {
  key: string;
  filename: string;
  size: number | null;
  lastModified: string | null;
  downloadUrl: string;
};

type ChildDocumentsGroup = {
  key: string;
  childId: string | null;
  displayName: string;
  contracts: ContractDoc[];
  pdfFiles: PdfFile[];
};

const ALL_YEARS = 'all';

function yearFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const y = new Date(value).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function yearFromPdf(file: PdfFile): number | null {
  const fromPath =
    file.key.match(/\/(\d{4})\/(?:umowy|umowa)\//) ?? file.key.match(/\/(\d{4})\//);
  if (fromPath) return Number(fromPath[1]);
  return yearFromIso(file.lastModified);
}

function contractNumberSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value
    .trim()
    .replace(/\//g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || null;
}

function childNameSlug(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .toLowerCase();
}

/** Dopasuj PDF do numeru umowy — bez fallbacku po roku (ten myli dzieci). */
function filenameMatchesContractNumber(
  filename: string,
  contractNumber: string | null | undefined
): boolean {
  const slug = contractNumberSlug(contractNumber);
  if (!slug) return false;
  const base = (filename.split(/[/\\]/).pop() ?? filename).replace(/\.pdf$/i, '');
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `Umowa _ Imię _ {slug}` albo `Umowa-{slug}` — separator może mieć spacje wokół `_`/`-`.
  return new RegExp(`(?:^|[-_\\s])${escaped}$`, 'i').test(base);
}

function pdfMatchesContractNumbers(file: PdfFile, contracts: ContractDoc[]): boolean {
  return contracts.some((c) => filenameMatchesContractNumber(file.filename, c.contractNumber));
}

/** Filtr listy PDF po wybranym roku kalendarzowym. */
function pdfBelongsToYearFilter(file: PdfFile, contracts: ContractDoc[], year: number): boolean {
  if (contracts.some((c) => filenameMatchesContractNumber(file.filename, c.contractNumber))) {
    const matched = contracts.find((c) =>
      filenameMatchesContractNumber(file.filename, c.contractNumber)
    );
    return yearFromIso(matched?.signedAt) === year || yearFromPdf(file) === year;
  }
  return yearFromPdf(file) === year;
}

function pdfMatchesChildName(file: PdfFile, child: ContractChild): boolean {
  const filename = file.filename.toLowerCase();
  const slug = childNameSlug(child.firstName, child.lastName);
  if (slug && filename.includes(slug)) return true;
  const fullName = `${child.firstName} ${child.lastName}`.trim().toLowerCase();
  return fullName.length > 0 && filename.includes(fullName);
}

function isMainContractPdf(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim().toLowerCase();
  return /^umowa(\s+_|\s*[-_])/i.test(base) || /^umowa[-_]/i.test(base);
}

function isAttachmentPdf(filename: string): boolean {
  const base = (filename.split(/[/\\]/).pop() ?? filename).toLowerCase();
  return (
    base.startsWith('zalacznik-') ||
    base.startsWith(IMAGE_CONSENT_PDF_TITLE.toLowerCase()) ||
    base.startsWith(PICKUP_CONSENT_PDF_TITLE.toLowerCase()) ||
    base.startsWith(PICKUP_CONSENT_PDF_TITLE_LEGACY.toLowerCase()) ||
    base.includes('wizerunek') ||
    Boolean(childNameFromPickupFilename(filename)) ||
    Boolean(childNameFromImageConsentFilename(filename))
  );
}

function childNameFromImageConsentFilename(filename: string): string | null {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  const lower = base.toLowerCase();
  const title = IMAGE_CONSENT_PDF_TITLE.toLowerCase();
  if (!lower.startsWith(title)) return null;
  const after = base.slice(IMAGE_CONSENT_PDF_TITLE.length).replace(/\.pdf$/i, '').trim();
  const parts = after
    .replace(/^_+\s*/, '')
    .split(/\s+_\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Imię Nazwisko [_ numer umowy]
  return parts[0] || null;
}

function childNameFromPickupFilename(filename: string): string | null {
  const base = (filename.split(/[/\\]/).pop() ?? filename).trim();
  const lower = base.toLowerCase();

  for (const title of [PICKUP_CONSENT_PDF_TITLE, PICKUP_CONSENT_PDF_TITLE_LEGACY]) {
    if (lower.startsWith(title.toLowerCase())) {
      const after = base.slice(title.length).replace(/\.pdf$/i, '').trim();
      const parts = after
        .replace(/^_+\s*/, '')
        .split(/\s+_\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts[0] || null;
    }
  }

  const legacyPrefix = `${PICKUP_CONSENT_DOCUMENT_TITLE}_`;
  if (lower.startsWith(legacyPrefix.toLowerCase())) {
    const name = base.slice(legacyPrefix.length).replace(/\.pdf$/i, '').trim();
    return name || null;
  }
  return null;
}

function formatSignedDate(value: string): string {
  return new Date(value).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ParentDocumentsTab({
  complimentaryAccess = false,
}: {
  complimentaryAccess?: boolean;
}) {
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
      new Set(
        [
          ...contracts.map((c) => yearFromIso(c.signedAt)),
          ...pdfFiles.map((f) => yearFromPdf(f)),
        ].filter((y): y is number => y != null)
      )
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
    const year = Number(selectedYear);
    return pdfFiles.filter((f) => pdfBelongsToYearFilter(f, filteredContracts, year));
  }, [pdfFiles, filteredContracts, selectedYear]);

  const childGroups = useMemo((): ChildDocumentsGroup[] => {
    const byChildId = new Map<string, ChildDocumentsGroup>();
    const childById = new Map<string, ContractChild>();

    const ensureChild = (child: ContractChild): ChildDocumentsGroup => {
      childById.set(child.childId, child);
      const existing = byChildId.get(child.childId);
      if (existing) return existing;
      const group: ChildDocumentsGroup = {
        key: child.childId,
        childId: child.childId,
        displayName: `${child.firstName} ${child.lastName}`.trim(),
        contracts: [],
        pdfFiles: [],
      };
      byChildId.set(child.childId, group);
      return group;
    };

    for (const contract of filteredContracts) {
      for (const child of contract.children) {
        const group = ensureChild(child);
        if (!group.contracts.some((c) => c.id === contract.id)) {
          group.contracts.push(contract);
        }
      }
    }

    const assignedKeys = new Set<string>();

    // 1) Umowy PDF — po numerze umowy albo imieniu dziecka w nazwie pliku.
    for (const group of byChildId.values()) {
      const child = group.childId ? childById.get(group.childId) : null;
      for (const file of filteredPdfFiles) {
        if (assignedKeys.has(file.key)) continue;
        if (!isMainContractPdf(file.filename)) continue;
        const byNumber = pdfMatchesContractNumbers(file, group.contracts);
        const byName = child ? pdfMatchesChildName(file, child) : false;
        if (!byNumber && !byName) continue;
        group.pdfFiles.push(file);
        assignedKeys.add(file.key);
      }
    }

    // 2) Załączniki — po numerze umowy albo imieniu dziecka.
    for (const group of byChildId.values()) {
      const child = group.childId ? childById.get(group.childId) : null;
      if (!child) continue;
      for (const file of filteredPdfFiles) {
        if (assignedKeys.has(file.key)) continue;
        if (isMainContractPdf(file.filename)) continue;
        const byNumber = pdfMatchesContractNumbers(file, group.contracts);
        const byName = isAttachmentPdf(file.filename) && pdfMatchesChildName(file, child);
        if (!byNumber && !byName) continue;
        group.pdfFiles.push(file);
        assignedKeys.add(file.key);
      }
    }

    // 3) Zgody bez kontraktu (np. Tryb bez umowy) — po imieniu z nazwy pliku.
    for (const file of filteredPdfFiles) {
      if (assignedKeys.has(file.key)) continue;
      const fromPickup = childNameFromPickupFilename(file.filename);
      if (!fromPickup) continue;
      const key = `name:${fromPickup.toLowerCase()}`;
      let group = Array.from(byChildId.values()).find(
        (g) => g.displayName.toLowerCase() === fromPickup.toLowerCase()
      );
      if (!group) {
        group = {
          key,
          childId: null,
          displayName: fromPickup,
          contracts: [],
          pdfFiles: [],
        };
        byChildId.set(key, group);
      }
      group.pdfFiles.push(file);
      assignedKeys.add(file.key);
    }

    const groups = Array.from(byChildId.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'pl')
    );

    const leftovers = filteredPdfFiles.filter((f) => !assignedKeys.has(f.key));
    if (leftovers.length > 0) {
      groups.push({
        key: 'other',
        childId: null,
        displayName: 'Pozostałe dokumenty',
        contracts: [],
        pdfFiles: leftovers,
      });
    }

    return groups.filter((g) => g.contracts.length > 0 || g.pdfFiles.length > 0);
  }, [filteredContracts, filteredPdfFiles]);

  const emptyForYear =
    !loading &&
    !error &&
    childGroups.length === 0 &&
    (contracts.length > 0 || pdfFiles.length > 0);

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moje dokumenty</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Dokumenty PDF pogrupowane według dziecka.
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
          {complimentaryAccess
            ? 'Tryb bez umowy — wcześniejsze umowy i dokumenty płatne nie są dostępne. Ewentualna zgoda na odbiór przez lektora pojawi się poniżej, jeśli jest wymagana.'
            : 'Brak podpisanych dokumentów. Po podpisaniu umowy pojawią się tu pliki PDF dla każdego dziecka.'}
        </div>
      ) : emptyForYear ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
          Brak dokumentów dla wybranego roku.
        </div>
      ) : (
        <div className="space-y-4">
          {childGroups.map((group) => (
            <article
              key={group.key}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"
            >
              <h3 className="text-base font-semibold text-zinc-900">{group.displayName}</h3>

              {group.contracts.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                  {group.contracts.map((c) => (
                    <li key={c.id}>
                      Umowa{c.schoolYearName ? ` — ${c.schoolYearName}` : ''}
                      {c.signedAt ? ` · podpisano ${formatSignedDate(c.signedAt)}` : ''}
                      {c.paymentType
                        ? ` · ${paymentTypeShortLabel(c.paymentType)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              ) : null}

              {group.pdfFiles.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {group.pdfFiles.map((f) => (
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
              ) : (
                <p className="mt-3 text-sm text-zinc-600">
                  Pliki PDF są też wysyłane mailem po podpisaniu umowy.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
