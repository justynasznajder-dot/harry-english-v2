'use client';

export type ComposeExternalEmailRecipient = {
  /** Unikalny klucz wiersza: id zgłoszenia albo `manual:${email}` */
  key: string;
  email: string;
  parentName?: string;
  childName?: string;
  childBirthYear?: number | null;
};

export type ComposeEmailRecipientsMode = 'manual' | 'enrollment';

type Props = {
  mode: ComposeEmailRecipientsMode;
  recipients: ComposeExternalEmailRecipient[];
  onRemoveRecipient: (key: string) => void;
  /** Tylko tryb manual */
  externalEmailBulkPaste?: string;
  onExternalEmailBulkPasteChange?: (value: string) => void;
  onParseExternalEmailBulk?: () => void;
  /** Tylko tryb enrollment */
  locations?: Array<{ id: string; name: string; newCount?: number }>;
  enrollmentLocationId?: string;
  onEnrollmentLocationIdChange?: (locationId: string) => void;
  birthYears?: Array<{ year: number; count: number }>;
  enrollmentBirthYear?: string;
  onEnrollmentBirthYearChange?: (year: string) => void;
  enrollmentAddLoading?: boolean;
};

export default function ComposeEmailRecipientsColumn({
  mode,
  recipients,
  onRemoveRecipient,
  externalEmailBulkPaste = '',
  onExternalEmailBulkPasteChange,
  onParseExternalEmailBulk,
  locations = [],
  enrollmentLocationId = '',
  onEnrollmentLocationIdChange,
  birthYears = [],
  enrollmentBirthYear = '',
  onEnrollmentBirthYearChange,
  enrollmentAddLoading = false,
}: Props) {
  const isEnrollment = mode === 'enrollment';

  return (
    <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 bg-sky-50/40 p-3 md:border-b-0 md:border-r md:p-4">
      {isEnrollment ? (
        <div className="mb-3 shrink-0 space-y-2 rounded-xl border border-sky-200 bg-white p-3">
          <p className="text-xs font-semibold text-zinc-800">Zgłoszenia (status NEW)</p>
          <select
            value={enrollmentLocationId}
            onChange={(e) => onEnrollmentLocationIdChange?.(e.target.value)}
            disabled={enrollmentAddLoading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 [color-scheme:light] disabled:opacity-60"
            aria-label="Preferowana lokalizacja zgłoszenia"
          >
            <option value="">Wybierz lokalizację…</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {typeof loc.newCount === 'number'
                  ? `${loc.name} (${loc.newCount})`
                  : loc.name}
              </option>
            ))}
          </select>
          <select
            value={enrollmentBirthYear}
            onChange={(e) => onEnrollmentBirthYearChange?.(e.target.value)}
            disabled={!enrollmentLocationId || enrollmentAddLoading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 [color-scheme:light] disabled:opacity-60"
            aria-label="Rok urodzenia dziecka"
          >
            <option value="">Wszystkie lata urodzenia</option>
            {birthYears.map((y) => (
              <option key={y.year} value={String(y.year)}>
                {y.year} ({y.count})
              </option>
            ))}
          </select>
          {enrollmentAddLoading ? (
            <p className="text-[11px] text-sky-800">Ładowanie zgłoszeń…</p>
          ) : null}
        </div>
      ) : (
        <>
          <textarea
            value={externalEmailBulkPaste}
            onChange={(e) => onExternalEmailBulkPasteChange?.(e.target.value)}
            rows={5}
            placeholder="Wpisz lub wklej adresy (jeden lub wiele — przecinek, średnik lub nowa linia)…"
            className="w-full shrink-0 resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light]"
          />
          <button
            type="button"
            disabled={!externalEmailBulkPaste.trim()}
            onClick={() => onParseExternalEmailBulk?.()}
            className="mt-2 w-full shrink-0 rounded-lg bg-sky-100 py-2.5 text-xs font-semibold text-sky-900 hover:bg-sky-200 disabled:opacity-50"
          >
            Dodaj adresy
          </button>
        </>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
        {recipients.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-500">
            {isEnrollment
              ? enrollmentLocationId
                ? enrollmentBirthYear
                  ? `Brak zgłoszeń NEW dla roku ${enrollmentBirthYear}`
                  : 'Brak zgłoszeń NEW dla tej lokalizacji'
                : 'Wybierz lokalizację, aby zobaczyć odbiorców'
              : 'Brak dodanych adresów'}
          </p>
        ) : isEnrollment ? (
          <ul className="space-y-1.5">
            {recipients.map((r) => (
              <li
                key={r.key}
                className="flex items-start justify-between gap-2 rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-sky-950"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {r.parentName || 'Rodzic'}
                    {r.childName ? (
                      <span className="font-normal text-sky-800">
                        {' '}
                        · dziecko: {r.childName}
                        {r.childBirthYear != null ? ` (${r.childBirthYear})` : ''}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sky-800">{r.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveRecipient(r.key)}
                  className="shrink-0 font-bold leading-none text-sky-800 hover:text-sky-600"
                  aria-label="Usuń odbiorcę"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((r) => (
              <span
                key={r.key}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900"
              >
                <span className="truncate">{r.email}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRecipient(r.key)}
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
