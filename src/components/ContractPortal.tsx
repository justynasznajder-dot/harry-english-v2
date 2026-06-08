'use client';

import { useMemo, useState } from 'react';

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

interface ContractPortalProps {
  contract: ContractDocument | null;
  onSigned?: () => void;
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

function DocumentPreview({
  title,
  subtitle,
  html,
}: {
  title: string;
  subtitle?: string;
  html: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <p className="text-sm font-semibold text-zinc-800">{title}</p>
        {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
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
}: {
  childAttachments: ContractChildAttachment[];
  readOnlySubtitle?: string;
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
              />
            ) : null}
            {child.attachment_2_html ? (
              <DocumentPreview
                title={`Załącznik nr 2 — Upoważnienie lektora do odbioru dziecka (${name})`}
                subtitle={readOnlySubtitle}
                html={child.attachment_2_html}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export default function ContractPortal({ contract, onSigned, readOnly = false }: ContractPortalProps) {
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
    const items: Array<{ key: string; childName: string; type: 1 | 2; html: string }> = [];
    for (const child of childAttachments) {
      const name = childDisplayName(child);
      if (child.attachment_1_html) {
        items.push({
          key: `${child.child_id}-att1`,
          childName: name,
          type: 1,
          html: child.attachment_1_html,
        });
      }
      if (child.attachment_2_html) {
        items.push({
          key: `${child.child_id}-att2`,
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

  const signContract = async () => {
    if (!contractAccepted || !allAttachmentsAccepted || !contract || readOnly || isSigned) return;
    setBusy(true);
    try {
      const res = await fetch('/api/enrollment/sign', { method: 'POST' });
      if (!res.ok) throw new Error('Podpis nie powiódł się');
      onSigned?.();
    } catch {
      alert('Nie udało się podpisać umowy.');
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
          . Poniżej możesz w każdej chwili zapoznać się z jej treścią.
        </div>
        <DocumentPreview
          title="Podgląd umowy"
          subtitle="Dokument podpisany — tylko do odczytu."
          html={contract.content_html}
        />
        <ChildAttachmentDocuments
          childAttachments={childAttachments}
          readOnlySubtitle="Dokument podpisany — tylko do odczytu."
        />
      </div>
    );
  }

  const attachmentTitle = (type: 1 | 2, childName: string) =>
    type === 1
      ? `Załącznik nr 1 — Zgoda na wykorzystanie wizerunku (${childName})`
      : `Załącznik nr 2 — Upoważnienie lektora do odbioru dziecka (${childName})`;

  const attachmentSubtitle = (type: 1 | 2) =>
    type === 1
      ? 'Dobrowolny dokument — brak podpisu nie wpływa na ważność umowy.'
      : 'Przekaż podpisany dokument w szkole/przedszkolu oraz lektorowi na pierwszych zajęciach.';

  return (
    <div className="space-y-4">
      {phase === 'contract' ? (
        <>
          <DocumentPreview
            title="Podgląd umowy"
            subtitle="Przewiń dokument poniżej, aby zapoznać się z pełną treścią."
            html={contract.content_html}
          />
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
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
              {attachmentItems.length > 0 ? 'Przejdź do załączników' : 'Przejdź do podpisu'}
            </button>
          </div>
        </>
      ) : null}

      {phase === 'attachments' ? (
        <>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Umowa zaakceptowana. Zapoznaj się z załącznikami
            {childAttachments.length > 1 ? ' dla każdego dziecka' : ''} i potwierdź zgodę na każdy
            dokument osobno.
          </div>

          {attachmentItems.map((item) => (
            <div key={item.key} className="space-y-3">
              <DocumentPreview
                title={attachmentTitle(item.type, item.childName)}
                subtitle={attachmentSubtitle(item.type)}
                html={item.html}
              />
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
                    Zapoznałem/am się z treścią tego załącznika ({item.childName}) i akceptuję jego
                    warunki.
                  </span>
                </label>
              </div>
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
            <button
              type="button"
              disabled={!allAttachmentsAccepted}
              onClick={() => setPhase('sign')}
              className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Przejdź do podpisu
            </button>
          </div>
        </>
      ) : null}

      {phase === 'sign' ? (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Wszystkie dokumenty zostały zaakceptowane. Kliknij poniżej, aby podpisać umowę
            {attachmentItems.length > 0 ? ' i załączniki' : ''}. Po podpisie wygenerujemy pliki PDF
            i zapiszemy dokumenty w systemie.
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
                className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Podpisywanie…' : 'Podpisuję umowę i załączniki'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
