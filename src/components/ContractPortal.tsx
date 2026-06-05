'use client';

import { useState } from 'react';

interface ContractDocument {
  id: string;
  content_html: string;
  attachment_1_html?: string | null;
  attachment_2_html?: string | null;
  status: string;
}

interface ContractPortalProps {
  contract: ContractDocument | null;
  onSigned: () => void;
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

export default function ContractPortal({ contract, onSigned }: ContractPortalProps) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const signContract = async () => {
    if (!accepted || !contract) return;
    setBusy(true);
    try {
      const res = await fetch('/api/enrollment/sign', { method: 'POST' });
      if (!res.ok) throw new Error('Podpis nie powiódł się');
      onSigned();
    } catch {
      alert('Nie udało się podpisać umowy.');
    } finally {
      setBusy(false);
    }
  };

  if (!contract) {
    return (
      <p className="text-sm text-zinc-600">Brak umowy do podglądu.</p>
    );
  }

  return (
    <div className="space-y-4">
      <DocumentPreview
        title="Podgląd umowy"
        subtitle="Przewiń dokument poniżej, aby zapoznać się z pełną treścią."
        html={contract.content_html}
      />

      {contract.attachment_1_html ? (
        <DocumentPreview
          title="Załącznik nr 1 — Zgoda na wykorzystanie wizerunku"
          subtitle="Dobrowolny dokument — brak podpisu nie wpływa na ważność umowy."
          html={contract.attachment_1_html}
        />
      ) : null}

      {contract.attachment_2_html ? (
        <DocumentPreview
          title="Załącznik nr 2 — Upoważnienie lektora do odbioru dziecka"
          subtitle="Przekaż podpisany dokument w szkole/przedszkolu oraz lektorowi na pierwszych zajęciach."
          html={contract.attachment_2_html}
        />
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 accent-[#0f6e56]"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span className="text-sm text-zinc-800">
            Zapoznałem/am się z treścią umowy
            {contract.attachment_1_html ? ' i załączników' : ''} i akceptuję ich warunki.
          </span>
        </label>

        <button
          type="button"
          onClick={() => void signContract()}
          disabled={!accepted || busy}
          className="mt-4 rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Podpisywanie…' : 'Podpisuję umowę'}
        </button>
      </div>
    </div>
  );
}
