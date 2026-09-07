'use client';

import { useEffect, useMemo, useState } from 'react';

import { parseContentDispositionFilename } from '@/lib/content-disposition';

export interface ContractChildAttachment {
  child_id: string;
  first_name: string;
  last_name: string;
  attachment_1_html: string | null;
  attachment_2_html: string | null;
}

interface ContractDocument {
  id: string;
  content_html: string;
  child_attachments: ContractChildAttachment[];
  status: string;
  signed_at?: string | null;
}

export type ContractSignResult = {
  message?: string;
  pdfGenerated?: boolean;
  pdfStored?: boolean;
  pdfEmailed?: boolean;
  nextChildToContract?: {
    child_id: string;
    request_id: string;
    first_name: string;
    last_name: string;
  } | null;
};

interface ContractPortalProps {
  contract: ContractDocument | null;
  onSigned?: (result?: ContractSignResult) => void;
  readOnly?: boolean;
}

/** Kolejność: wizerunek → odbiór (opcjonalnie) → umowa (podpis + mail). */
type WizardPhase = 'image' | 'pickup' | 'contract';

function formatSignedAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' });
}

function childDisplayName(child: Pick<ContractChildAttachment, 'first_name' | 'last_name'>): string {
  return `${child.first_name} ${child.last_name}`.trim();
}

function useIsMobileContractView(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return isMobile;
}

async function downloadPreviewPdf(params: {
  doc: 'contract' | 'attachment1' | 'attachment2';
  childId?: string;
}): Promise<void> {
  const qs = new URLSearchParams({ doc: params.doc });
  if (params.childId) qs.set('childId', params.childId);
  const res = await fetch(`/api/parent/contract/preview-pdf?${qs.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Nie udało się pobrać PDF');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = parseContentDispositionFilename(disposition) ?? 'umowa-podglad.pdf';
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

function DocumentPreview({
  title,
  subtitle,
  html,
  pdfDoc,
  childId,
  preferPdfDownload,
  downloadOnly = false,
}: {
  title: string;
  subtitle?: string;
  html: string;
  pdfDoc: 'contract' | 'attachment1' | 'attachment2';
  childId?: string;
  preferPdfDownload: boolean;
  /** Po podpisaniu — bez podglądu HTML, tylko pobranie PDF. */
  downloadOnly?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadPreviewPdf({ doc: pdfDoc, childId });
      setDownloaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się pobrać PDF');
    } finally {
      setDownloading(false);
    }
  };

  if (downloadOnly) {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-800">{title}</p>
            {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="shrink-0 rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? 'Generowanie PDF…' : downloaded ? 'Pobierz PDF ponownie' : 'Pobierz PDF'}
          </button>
        </div>
        {error ? <p className="px-4 pb-3 text-xs font-medium text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (preferPdfDownload) {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <p className="text-sm font-semibold text-zinc-800">{title}</p>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-zinc-700">
            Na telefonie najwygodniej przeczytasz dokument w PDF. Pobierz podgląd (bez podpisu),
            otwórz plik, a potem wróć tutaj i zaakceptuj treść.
          </p>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="w-full rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? 'Generowanie PDF…' : downloaded ? 'Pobierz PDF ponownie' : 'Pobierz PDF podglądu'}
          </button>
          {downloaded ? (
            <p className="text-xs font-medium text-emerald-800">
              PDF zapisany na telefonie — możesz go otworzyć w plikach / powiadomieniach.
            </p>
          ) : null}
          {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <div>
          <p className="text-sm font-semibold text-zinc-800">{title}</p>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="rounded-full border border-[#0f6e56] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:opacity-60"
        >
          {downloading ? 'PDF…' : 'Pobierz PDF'}
        </button>
      </div>
      {error ? <p className="px-4 pt-2 text-xs font-medium text-rose-700">{error}</p> : null}
      <iframe
        srcDoc={html}
        title={title}
        className="block w-full border-0 bg-white"
        style={{ height: 'min(70vh, 720px)' }}
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function ChildAttachmentDocuments({
  childAttachments,
  readOnlySubtitle,
  preferPdfDownload,
  downloadOnly = false,
  includeImage,
}: {
  childAttachments: ContractChildAttachment[];
  readOnlySubtitle?: string;
  preferPdfDownload: boolean;
  downloadOnly?: boolean;
  includeImage?: boolean;
}) {
  return (
    <>
      {childAttachments.map((child) => {
        const name = childDisplayName(child);
        const showImage = includeImage !== false && Boolean(child.attachment_1_html);
        return (
          <div key={child.child_id} className="space-y-4">
            {childAttachments.length > 1 ? (
              <p className="text-sm font-semibold text-zinc-800">Dokumenty: {name}</p>
            ) : null}
            {showImage ? (
              <DocumentPreview
                title={`Załącznik nr 1 — Oświadczenie o wizerunku (${name})`}
                subtitle={readOnlySubtitle}
                html={child.attachment_1_html!}
                pdfDoc="attachment1"
                childId={child.child_id}
                preferPdfDownload={preferPdfDownload}
                downloadOnly={downloadOnly}
              />
            ) : null}
            {child.attachment_2_html ? (
              <DocumentPreview
                title={`Załącznik nr 2 — Odbiór dziecka przez lektora (${name})`}
                subtitle={readOnlySubtitle}
                html={child.attachment_2_html}
                pdfDoc="attachment2"
                childId={child.child_id}
                preferPdfDownload={preferPdfDownload}
                downloadOnly={downloadOnly}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function initialPhase(hasImage: boolean, hasPickup: boolean): WizardPhase {
  if (hasImage) return 'image';
  if (hasPickup) return 'pickup';
  return 'contract';
}

export default function ContractPortal({ contract, onSigned, readOnly = false }: ContractPortalProps) {
  const preferPdfDownload = useIsMobileContractView();

  const imageItems = useMemo(() => {
    const items: Array<{ key: string; childId: string; childName: string; html: string }> = [];
    for (const child of contract?.child_attachments ?? []) {
      if (!child.attachment_1_html) continue;
      items.push({
        key: `${child.child_id}-att1`,
        childId: child.child_id,
        childName: childDisplayName(child),
        html: child.attachment_1_html,
      });
    }
    return items;
  }, [contract?.child_attachments]);

  const pickupItems = useMemo(() => {
    const items: Array<{ key: string; childId: string; childName: string; html: string }> = [];
    for (const child of contract?.child_attachments ?? []) {
      if (!child.attachment_2_html) continue;
      items.push({
        key: `${child.child_id}-att2`,
        childId: child.child_id,
        childName: childDisplayName(child),
        html: child.attachment_2_html,
      });
    }
    return items;
  }, [contract?.child_attachments]);

  const hasImage = imageItems.length > 0;
  const hasPickup = pickupItems.length > 0;

  const [phase, setPhase] = useState<WizardPhase>(() => initialPhase(hasImage, hasPickup));
  const [imageConsent, setImageConsent] = useState<boolean | null>(hasImage ? null : false);
  const [pickupAccepted, setPickupAccepted] = useState<Record<string, boolean>>({});
  const [contractAccepted, setContractAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSigned = contract?.status === 'SIGNED';

  const childAttachments = useMemo(
    () =>
      contract?.child_attachments.filter((c) => c.attachment_1_html || c.attachment_2_html) ?? [],
    [contract?.child_attachments],
  );

  const allPickupAccepted =
    pickupItems.length === 0 || pickupItems.every((item) => pickupAccepted[item.key]);

  const goAfterImage = () => {
    setPhase(hasPickup ? 'pickup' : 'contract');
  };

  const acceptImageConsent = async () => {
    setImageBusy(true);
    setActionError(null);
    try {
      // PDF od razu po zgodzie (podgląd); ostateczna wersja podpisana idzie w mailu przy umowie.
      for (const item of imageItems) {
        await downloadPreviewPdf({ doc: 'attachment1', childId: item.childId });
      }
      setImageConsent(true);
      goAfterImage();
    } catch (err) {
      setActionError(
        err instanceof Error && err.message
          ? err.message
          : 'Nie udało się wygenerować PDF oświadczenia o wizerunku. Spróbuj ponownie.',
      );
    } finally {
      setImageBusy(false);
    }
  };

  const declineImageConsent = () => {
    setActionError(null);
    setImageConsent(false);
    goAfterImage();
  };

  const continueFromPickup = () => {
    const next: Record<string, boolean> = {};
    for (const item of pickupItems) next[item.key] = true;
    setPickupAccepted(next);
    setPhase('contract');
  };

  const signContract = async (opts?: { contractOk?: boolean }) => {
    const contractOk = opts?.contractOk ?? contractAccepted;
    if (!contractOk || !contract || readOnly || isSigned) return;
    if (hasImage && imageConsent === null) return;
    if (hasPickup && !allPickupAccepted && phase === 'contract') {
      // pickup already confirmed when entering contract via continueFromPickup
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch('/api/enrollment/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageConsent: imageConsent === true }),
      });
      const data = (await res.json().catch(() => ({}))) as ContractSignResult;
      if (!res.ok) throw new Error('Podpis nie powiódł się');
      onSigned?.(data);
    } catch {
      setActionError('Nie udało się podpisać umowy. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  };

  if (!contract) {
    return <p className="text-sm text-zinc-600">Brak umowy do podglądu.</p>;
  }

  if (readOnly || isSigned) {
    const signedAtLabel = formatSignedAt(contract.signed_at);
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Umowa została podpisana
          {signedAtLabel ? (
            <>
              {' '}
              <strong>{signedAtLabel}</strong>
            </>
          ) : null}
          . Możesz pobrać dokumenty PDF poniżej.
        </div>
        <DocumentPreview
          title="Umowa"
          subtitle="Dokument podpisany"
          html={contract.content_html}
          pdfDoc="contract"
          preferPdfDownload={preferPdfDownload}
          downloadOnly
        />
        <ChildAttachmentDocuments
          childAttachments={childAttachments}
          readOnlySubtitle="Dokument podpisany"
          preferPdfDownload={preferPdfDownload}
          downloadOnly
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError ? (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 shadow-sm"
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM10 14.5a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-rose-900">Nie udało się dokończyć tej czynności</p>
            <p className="mt-0.5 text-rose-800/90">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 self-start rounded-lg px-2 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
            aria-label="Zamknij komunikat"
          >
            Zamknij
          </button>
        </div>
      ) : null}

      {phase === 'image' ? (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Krok 1 z {hasPickup ? '3' : '2'}: oświadczenie o wizerunku. Zgoda jest dobrowolna —
            możesz wyrazić zgodę albo odmówić i przejść dalej.
          </div>
          {imageItems.map((item) => (
            <DocumentPreview
              key={item.key}
              title={`Załącznik nr 1 — Oświadczenie o wizerunku (${item.childName})`}
              subtitle="Dobrowolny dokument. Po wyrażeniu zgody pobierzemy PDF od razu."
              html={item.html}
              pdfDoc="attachment1"
              childId={item.childId}
              preferPdfDownload={preferPdfDownload}
            />
          ))}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={imageBusy}
              onClick={() => void acceptImageConsent()}
              className="rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {imageBusy ? 'Generowanie PDF…' : 'Wyrażam zgodę na wykorzystanie wizerunku'}
            </button>
            <button
              type="button"
              disabled={imageBusy}
              onClick={declineImageConsent}
              className="rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              Nie wyrażam zgody — przejdź dalej
            </button>
          </div>
        </>
      ) : null}

      {phase === 'pickup' ? (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Krok {hasImage ? '2' : '1'} z {hasImage ? '3' : '2'}: zgoda na odebranie dziecka przez
            lektora. Tej zgody nie podpisuje się elektronicznie — PDF będzie w mailu po podpisaniu
            umowy; wydrukuj i przynieś z podpisem ręcznym na pierwsze zajęcia.
          </div>
          {pickupItems.map((item) => (
            <div key={item.key} className="space-y-3">
              <DocumentPreview
                title={`Załącznik nr 2 — Odbiór dziecka przez lektora (${item.childName})`}
                subtitle="Dokument do wydruku — bez podpisu elektronicznego."
                html={item.html}
                pdfDoc="attachment2"
                childId={item.childId}
                preferPdfDownload={preferPdfDownload}
              />
              {!preferPdfDownload ? (
                <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#0f6e56]"
                      checked={Boolean(pickupAccepted[item.key])}
                      onChange={(e) =>
                        setPickupAccepted((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm text-zinc-800">
                      Zapoznałem/am się z treścią zgody na odebranie ({item.childName}). Wiem, że
                      dokument trzeba wydrukować i podpisać ręcznie.
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            {hasImage ? (
              <button
                type="button"
                onClick={() => setPhase('image')}
                className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Wróć
              </button>
            ) : null}
            {preferPdfDownload ? (
              <button
                type="button"
                onClick={continueFromPickup}
                className="rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46]"
              >
                Zapoznałem/am się — dalej do umowy
              </button>
            ) : (
              <button
                type="button"
                disabled={!allPickupAccepted}
                onClick={continueFromPickup}
                className="rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Dalej do umowy
              </button>
            )}
          </div>
        </>
      ) : null}

      {phase === 'contract' ? (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Ostatni krok: umowa. Po podpisaniu wyślemy jeden e-mail z umową
            {imageConsent ? ', oświadczeniem o wizerunku' : ''}
            {hasPickup ? ' i zgodą na odebranie' : ''}.
          </div>
          <DocumentPreview
            title="Podgląd umowy"
            subtitle={
              preferPdfDownload
                ? 'Pobierz PDF, przeczytaj na telefonie, potem podpisz poniżej.'
                : 'Przewiń dokument poniżej, aby zapoznać się z pełną treścią.'
            }
            html={contract.content_html}
            pdfDoc="contract"
            preferPdfDownload={preferPdfDownload}
          />
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
            {preferPdfDownload ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {hasPickup || hasImage ? (
                  <button
                    type="button"
                    onClick={() => setPhase(hasPickup ? 'pickup' : 'image')}
                    className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Wróć
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void signContract({ contractOk: true })}
                  className="rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Podpisywanie…' : 'Podpisuję umowę'}
                </button>
              </div>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#0f6e56]"
                    checked={contractAccepted}
                    onChange={(e) => setContractAccepted(e.target.checked)}
                  />
                  <span className="text-sm text-zinc-800">
                    Zapoznałem/am się z treścią umowy i akceptuję jej warunki.
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  {hasPickup || hasImage ? (
                    <button
                      type="button"
                      onClick={() => setPhase(hasPickup ? 'pickup' : 'image')}
                      className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      Wróć
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!contractAccepted || busy}
                    onClick={() => void signContract()}
                    className="rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? 'Podpisywanie…' : 'Podpisuję umowę'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
