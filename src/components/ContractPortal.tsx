'use client';

import { useEffect, useMemo, useState } from 'react';

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

type WizardPhase = 'contract' | 'attachments' | 'sign';

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
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] ?? 'umowa-podglad.pdf';
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
}: {
  title: string;
  subtitle?: string;
  html: string;
  pdfDoc: 'contract' | 'attachment1' | 'attachment2';
  childId?: string;
  preferPdfDownload: boolean;
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
}: {
  childAttachments: ContractChildAttachment[];
  readOnlySubtitle?: string;
  preferPdfDownload: boolean;
}) {
  return (
    <>
      {childAttachments.map((child) => {
        const name = childDisplayName(child);
        return (
          <div key={child.child_id} className="space-y-4">
            {childAttachments.length > 1 ? (
              <p className="text-sm font-semibold text-zinc-800">Dokumenty: {name}</p>
            ) : null}
            {child.attachment_1_html ? (
              <DocumentPreview
                title={`Załącznik nr 1 — Zgoda na wykorzystanie wizerunku (${name})`}
                subtitle={readOnlySubtitle}
                html={child.attachment_1_html}
                pdfDoc="attachment1"
                childId={child.child_id}
                preferPdfDownload={preferPdfDownload}
              />
            ) : null}
            {child.attachment_2_html ? (
              <DocumentPreview
                title={`Zgoda na odebranie dziecka przez lektora (${name})`}
                subtitle={readOnlySubtitle}
                html={child.attachment_2_html}
                pdfDoc="attachment2"
                childId={child.child_id}
                preferPdfDownload={preferPdfDownload}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export default function ContractPortal({ contract, onSigned, readOnly = false }: ContractPortalProps) {
  const preferPdfDownload = useIsMobileContractView();
  const [phase, setPhase] = useState<WizardPhase>('contract');
  const [contractAccepted, setContractAccepted] = useState(false);
  const [attachmentAccepted, setAttachmentAccepted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const isSigned = contract?.status === 'SIGNED';

  const childAttachments = useMemo(
    () =>
      contract?.child_attachments.filter((c) => c.attachment_1_html || c.attachment_2_html) ?? [],
    [contract?.child_attachments],
  );

  const attachmentItems = useMemo(() => {
    const items: Array<{
      key: string;
      childId: string;
      childName: string;
      type: 1 | 2;
      html: string;
    }> = [];
    for (const child of childAttachments) {
      const name = childDisplayName(child);
      if (child.attachment_1_html) {
        items.push({
          key: `${child.child_id}-att1`,
          childId: child.child_id,
          childName: name,
          type: 1,
          html: child.attachment_1_html,
        });
      }
      if (child.attachment_2_html) {
        items.push({
          key: `${child.child_id}-att2`,
          childId: child.child_id,
          childName: name,
          type: 2,
          html: child.attachment_2_html,
        });
      }
    }
    return items;
  }, [childAttachments]);

  const allAttachmentsAccepted =
    attachmentItems.length === 0 ||
    attachmentItems.every((item) => attachmentAccepted[item.key]);

  const signContract = async (opts?: {
    contractOk?: boolean;
    attachmentsOk?: boolean;
  }) => {
    const contractOk = opts?.contractOk ?? contractAccepted;
    const attachmentsOk = opts?.attachmentsOk ?? allAttachmentsAccepted;
    if (!contractOk || !attachmentsOk || !contract || readOnly || isSigned) return;
    setBusy(true);
    try {
      const res = await fetch('/api/enrollment/sign', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as ContractSignResult;
      if (!res.ok) throw new Error('Podpis nie powiódł się');
      onSigned?.(data);
    } catch {
      alert('Nie udało się podpisać umowy.');
    } finally {
      setBusy(false);
    }
  };

  const acceptContractAndContinue = () => {
    setContractAccepted(true);
    if (attachmentItems.length > 0) {
      setPhase('attachments');
      return;
    }
    if (preferPdfDownload) {
      void signContract({ contractOk: true, attachmentsOk: true });
      return;
    }
    setPhase('sign');
  };

  const acceptAttachmentsAndContinue = () => {
    const nextAccepted: Record<string, boolean> = {};
    for (const item of attachmentItems) nextAccepted[item.key] = true;
    setAttachmentAccepted(nextAccepted);
    setContractAccepted(true);
    if (preferPdfDownload) {
      void signContract({ contractOk: true, attachmentsOk: true });
      return;
    }
    setPhase('sign');
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
          . Poniżej możesz w każdej chwili zapoznać się z jej treścią.
        </div>
        <DocumentPreview
          title="Podgląd umowy"
          subtitle="Dokument podpisany — tylko do odczytu."
          html={contract.content_html}
          pdfDoc="contract"
          preferPdfDownload={preferPdfDownload}
        />
        <ChildAttachmentDocuments
          childAttachments={childAttachments}
          readOnlySubtitle="Dokument podpisany — tylko do odczytu."
          preferPdfDownload={preferPdfDownload}
        />
      </div>
    );
  }

  const hasImageConsent = attachmentItems.some((item) => item.type === 1);
  const hasPickupConsent = attachmentItems.some((item) => item.type === 2);

  const attachmentTitle = (type: 1 | 2, childName: string) =>
    type === 1
      ? `Załącznik nr 1 — Zgoda na wykorzystanie wizerunku (${childName})`
      : `Zgoda na odebranie dziecka przez lektora (${childName})`;

  const attachmentSubtitle = (type: 1 | 2) =>
    type === 1
      ? 'Dobrowolny dokument — brak podpisu nie wpływa na ważność umowy.'
      : 'Tej zgody nie podpisuje się elektronicznie. Pobierz PDF z Dokumentów, wydrukuj i przynieś z podpisem ręcznym na pierwsze zajęcia. Jeśli nie możesz wydrukować — nauczyciel będzie miał druki na zajęciach.';

  const signButtonLabel = () => {
    if (busy) return 'Podpisywanie…';
    if (preferPdfDownload) return 'Zapoznałem/am się z treścią i akceptuję umowę';
    if (hasImageConsent) return 'Podpisuję umowę i załączniki';
    return 'Podpisuję umowę';
  };

  return (
    <div className="space-y-4">
      {phase === 'contract' ? (
        <>
          <DocumentPreview
            title="Podgląd umowy"
            subtitle={
              preferPdfDownload
                ? 'Pobierz PDF, przeczytaj na telefonie, potem zaakceptuj poniżej.'
                : 'Przewiń dokument poniżej, aby zapoznać się z pełną treścią.'
            }
            html={contract.content_html}
            pdfDoc="contract"
            preferPdfDownload={preferPdfDownload}
          />
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
            {preferPdfDownload ? (
              <button
                type="button"
                disabled={busy}
                onClick={acceptContractAndContinue}
                className="w-full rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? 'Zapisywanie akceptacji…'
                  : attachmentItems.length > 0
                    ? 'Zapoznałem/am się z treścią i akceptuję — dalej'
                    : 'Zapoznałem/am się z treścią i akceptuję'}
              </button>
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
                <button
                  type="button"
                  disabled={!contractAccepted}
                  onClick={() => setPhase(attachmentItems.length > 0 ? 'attachments' : 'sign')}
                  className="mt-4 rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {attachmentItems.length > 0
                    ? hasImageConsent && hasPickupConsent
                      ? 'Przejdź do kolejnych dokumentów'
                      : hasPickupConsent
                        ? 'Przejdź do zgody na odebranie'
                        : hasImageConsent
                          ? 'Przejdź do załączników'
                          : 'Przejdź do podpisu'
                    : 'Przejdź do podpisu'}
                </button>
              </>
            )}
          </div>
        </>
      ) : null}

      {phase === 'attachments' ? (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Umowa zaakceptowana. Zapoznaj się z pozostałymi dokumentami
            {childAttachments.length > 1 ? ' dla każdego dziecka' : ''}
            {preferPdfDownload ? ' (pobierz PDF), potem zaakceptuj poniżej.' : ' i potwierdź każdy osobno.'}
          </div>

          {attachmentItems.map((item) => (
            <div key={item.key} className="space-y-3">
              <DocumentPreview
                title={attachmentTitle(item.type, item.childName)}
                subtitle={attachmentSubtitle(item.type)}
                html={item.html}
                pdfDoc={item.type === 1 ? 'attachment1' : 'attachment2'}
                childId={item.childId}
                preferPdfDownload={preferPdfDownload}
              />
              {!preferPdfDownload ? (
                <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#0f6e56]"
                      checked={Boolean(attachmentAccepted[item.key])}
                      onChange={(e) =>
                        setAttachmentAccepted((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm text-zinc-800">
                      {item.type === 2
                        ? `Zapoznałem/am się z treścią zgody na odebranie (${item.childName}). Wiem, że dokument trzeba wydrukować i podpisać ręcznie — nie podpisuję go elektronicznie.`
                        : `Zapoznałem/am się z treścią tego załącznika (${item.childName}) i akceptuję jego warunki.`}
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPhase('contract')}
              className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Wróć do umowy
            </button>
            {preferPdfDownload ? (
              <button
                type="button"
                disabled={busy}
                onClick={acceptAttachmentsAndContinue}
                className="w-full rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy
                  ? 'Zapisywanie akceptacji…'
                  : 'Zapoznałem/am się z treścią i akceptuję'}
              </button>
            ) : (
              <button
                type="button"
                disabled={!allAttachmentsAccepted}
                onClick={() => setPhase('sign')}
                className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Przejdź do podpisu
              </button>
            )}
          </div>
        </>
      ) : null}

      {phase === 'sign' ? (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {preferPdfDownload
              ? 'Dokumenty zostały zaakceptowane. Potwierdź poniżej — to równoznaczne z podpisem umowy w systemie.'
              : `Wszystkie dokumenty zostały zaakceptowane. Kliknij poniżej, aby podpisać umowę${
                  hasImageConsent ? ' i załącznik o wizerunku' : ''
                }. Po podpisie wygenerujemy pliki PDF i zapiszemy dokumenty w systemie.`}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
            <ul className="space-y-1 text-sm text-zinc-700">
              <li>✓ Umowa — zaakceptowana</li>
              {attachmentItems.map((item) => (
                <li key={item.key}>
                  ✓ {attachmentTitle(item.type, item.childName)} — zaakceptowany
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  setPhase(attachmentItems.length > 0 ? 'attachments' : 'contract')
                }
                className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Wróć
              </button>
              <button
                type="button"
                onClick={() => void signContract()}
                disabled={!contractAccepted || !allAttachmentsAccepted || busy}
                className="w-full rounded-full bg-[#0f6e56] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {signButtonLabel()}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
