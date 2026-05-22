'use client';

type Props = {
  externalEmails: string[];
  externalEmailBulkPaste: string;
  onExternalEmailBulkPasteChange: (value: string) => void;
  onParseExternalEmailBulk: () => void;
  onRemoveExternalEmail: (email: string) => void;
};

export default function ComposeEmailRecipientsColumn({
  externalEmails,
  externalEmailBulkPaste,
  onExternalEmailBulkPasteChange,
  onParseExternalEmailBulk,
  onRemoveExternalEmail,
}: Props) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 bg-sky-50/40 p-3 md:border-b-0 md:border-r md:p-4">
      <p className="mb-1 shrink-0 text-sm font-semibold text-zinc-800">Adresy odbiorców</p>
      <p className="mb-3 shrink-0 text-xs text-zinc-600">
        Każdy adres dostanie osobną wiadomość e-mail (odbiorcy nie widzą siebie nawzajem). Jeśli adres
        jest w bazie szkoły, wiadomość trafi też do panelu.
      </p>
      <textarea
        value={externalEmailBulkPaste}
        onChange={(e) => onExternalEmailBulkPasteChange(e.target.value)}
        rows={5}
        placeholder="Wpisz lub wklej adresy (jeden lub wiele — przecinek, średnik lub nowa linia)…"
        className="w-full shrink-0 resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light]"
      />
      <button
        type="button"
        disabled={!externalEmailBulkPaste.trim()}
        onClick={onParseExternalEmailBulk}
        className="mt-2 w-full shrink-0 rounded-lg bg-sky-100 py-2.5 text-xs font-semibold text-sky-900 hover:bg-sky-200 disabled:opacity-50"
      >
        Dodaj adresy
      </button>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
        {externalEmails.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-500">Brak dodanych adresów</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {externalEmails.map((email) => (
              <span
                key={email}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900"
              >
                <span className="truncate">{email}</span>
                <button
                  type="button"
                  onClick={() => onRemoveExternalEmail(email)}
                  className="shrink-0 font-bold leading-none hover:text-sky-700"
                  aria-label="Usuń adres e-mail"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
