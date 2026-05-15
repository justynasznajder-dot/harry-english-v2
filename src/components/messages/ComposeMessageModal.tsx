'use client';

export type ComposePanelMode = 'manager' | 'teacher' | 'parent';

export interface ComposeRecipientOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  childNames?: string | null;
  role: string;
}

export interface ComposeFilterMeta {
  groups: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  schoolYears: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
}

const ACCESS_LEVEL_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'PENDING', label: 'Oczekujący' },
  { value: 'PROPOSED', label: 'Propozycja grupy' },
  { value: 'CONTRACT_SENT', label: 'Umowa wysłana' },
  { value: 'ACTIVE', label: 'Aktywny' },
];

export interface ComposeMessageModalProps {
  open: boolean;
  onClose: () => void;
  mode: ComposePanelMode;
  canPickIndividuals: boolean;
  recipients: ComposeRecipientOption[];
  recipientSearch: string;
  onRecipientSearchChange: (value: string) => void;
  recipientSearchDebounced: string;
  selectedRecipientIds: string[];
  selectedRecipientLabels: Record<string, string>;
  singleRecipientId: string;
  onAddRecipient: (r: ComposeRecipientOption) => void;
  onRemoveRecipient: (id: string) => void;
  onSelectSingleRecipient: (r: ComposeRecipientOption) => void;
  onClearSingleRecipient: () => void;
  recipientLabel: (r: ComposeRecipientOption) => string;
  showGroupFilters: boolean;
  onToggleGroupFilters: () => void;
  filterMeta: ComposeFilterMeta | null;
  filterGroupId: string;
  onFilterGroupIdChange: (value: string) => void;
  filterLocationId: string;
  onFilterLocationIdChange: (value: string) => void;
  filterSchoolYearId: string;
  onFilterSchoolYearIdChange: (value: string) => void;
  filterTeacherId: string;
  onFilterTeacherIdChange: (value: string) => void;
  filterEnrollmentStatus: string;
  onFilterEnrollmentStatusChange: (value: string) => void;
  includeTeachers: boolean;
  onIncludeTeachersChange: (value: boolean) => void;
  onApplyManagerFilters: () => void;
  onAddAllFromList: () => void;
  composeSubject: string;
  onComposeSubjectChange: (value: string) => void;
  composeContent: string;
  onComposeContentChange: (value: string) => void;
  sendingCompose: boolean;
  onSend: () => void;
  onClearForm: () => void;
}

export default function ComposeMessageModal(props: ComposeMessageModalProps) {
  if (!props.open) return null;

  const adresatIds = props.canPickIndividuals
    ? props.selectedRecipientIds
    : props.singleRecipientId
      ? [props.singleRecipientId]
      : [];

  const searchPlaceholder =
    props.mode === 'parent'
      ? 'Szukaj nauczyciela…'
      : props.mode === 'teacher'
        ? 'Szukaj rodzica po imieniu, nazwisku lub e-mailu…'
        : 'Szukaj rodzica lub nauczyciela…';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="flex max-h-[min(90vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h3 id="compose-modal-title" className="text-lg font-bold text-zinc-900">
            Nowa wiadomość
          </h3>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Lewa kolumna — wybór adresatów */}
          <div className="flex min-h-[220px] flex-col border-b border-zinc-200 bg-zinc-50/80 p-4 md:min-h-0 md:border-b-0 md:border-r">
            <p className="mb-2 text-sm font-semibold text-zinc-800">Wybierz adresatów</p>
            <input
              type="search"
              value={props.recipientSearch}
              onChange={(e) => props.onRecipientSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="mb-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
            <div className="min-h-[120px] flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white md:min-h-[200px]">
              {props.recipients.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-500">
                  {props.recipientSearchDebounced
                    ? 'Brak wyników — zmień wyszukiwanie'
                    : 'Ładowanie listy…'}
                </p>
              ) : (
                props.recipients.map((r) => {
                  const picked = props.canPickIndividuals
                    ? props.selectedRecipientIds.includes(r.id)
                    : props.singleRecipientId === r.id;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 last:border-0"
                    >
                      <span className="min-w-0 truncate text-sm text-zinc-800">
                        {props.recipientLabel(r)}
                      </span>
                      <button
                        type="button"
                        disabled={picked}
                        onClick={() => {
                          if (props.canPickIndividuals) {
                            props.onAddRecipient(r);
                          } else {
                            props.onSelectSingleRecipient(r);
                          }
                        }}
                        className="shrink-0 rounded-full border border-[#0f6e56] px-3 py-1 text-xs font-semibold text-[#0f6e56] disabled:border-zinc-200 disabled:text-zinc-400"
                      >
                        {picked ? 'Dodano' : 'Dodaj'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {props.canPickIndividuals && props.mode === 'manager' && (
              <div className="mt-3 shrink-0 rounded-xl border border-zinc-200 bg-white">
                <button
                  type="button"
                  onClick={props.onToggleGroupFilters}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-zinc-700"
                >
                  Wysyłka do grupy (filtry masowe)
                  <span className="text-zinc-400">{props.showGroupFilters ? '▲' : '▼'}</span>
                </button>
                {props.showGroupFilters && (
                  <div className="max-h-48 space-y-2 overflow-y-auto border-t border-zinc-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Filtry grupy
                    </p>
                    {props.filterMeta && (
                      <>
                        <select
                          value={props.filterGroupId}
                          onChange={(e) => props.onFilterGroupIdChange(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Wybierz grupę</option>
                          {props.filterMeta.groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={props.filterLocationId}
                          onChange={(e) => props.onFilterLocationIdChange(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Lokalizacja</option>
                          {props.filterMeta.locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={props.filterSchoolYearId}
                          onChange={(e) => props.onFilterSchoolYearIdChange(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Rok szkolny</option>
                          {props.filterMeta.schoolYears.map((y) => (
                            <option key={y.id} value={y.id}>
                              {y.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={props.filterTeacherId}
                          onChange={(e) => props.onFilterTeacherIdChange(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Nauczyciel (grupa)</option>
                          {props.filterMeta.teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={props.filterEnrollmentStatus}
                          onChange={(e) => props.onFilterEnrollmentStatusChange(e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          {ACCESS_LEVEL_OPTIONS.map((o) => (
                            <option key={o.value || 'all'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={props.includeTeachers}
                        onChange={(e) => props.onIncludeTeachersChange(e.target.checked)}
                      />
                      Pokaż też nauczycieli
                    </label>
                    <button
                      type="button"
                      onClick={props.onApplyManagerFilters}
                      className="w-full rounded-lg border border-[#0f6e56] py-2 text-sm font-semibold text-[#0f6e56]"
                    >
                      Zastosuj filtry grupy
                    </button>
                    {props.recipients.length > 0 && (
                      <button
                        type="button"
                        onClick={props.onAddAllFromList}
                        className="w-full rounded-lg bg-emerald-50 py-2 text-sm font-semibold text-[#0f6e56]"
                      >
                        Dodaj wszystkich z listy ({props.recipients.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prawa kolumna — treść wiadomości */}
          <div className="flex min-h-0 flex-col overflow-y-auto p-5">
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-800">
                  Adresat / Adresaci
                </label>
                <div className="min-h-[80px] rounded-xl border border-zinc-300 bg-zinc-50/50 px-3 py-2.5">
                  {adresatIds.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      Wybierz odbiorców z listy po lewej stronie
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {adresatIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900"
                        >
                          <span className="truncate">
                            {props.selectedRecipientLabels[id] ?? id}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (props.canPickIndividuals) {
                                props.onRemoveRecipient(id);
                              } else {
                                props.onClearSingleRecipient();
                              }
                            }}
                            className="shrink-0 font-bold leading-none hover:text-emerald-700"
                            aria-label="Usuń odbiorcę"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="compose-subject" className="mb-1.5 block text-sm font-medium text-zinc-800">
                  Temat
                </label>
                <input
                  id="compose-subject"
                  type="text"
                  value={props.composeSubject}
                  onChange={(e) => props.onComposeSubjectChange(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <label htmlFor="compose-body" className="mb-1.5 block text-sm font-medium text-zinc-800">
                  Treść wiadomości
                </label>
                <textarea
                  id="compose-body"
                  value={props.composeContent}
                  onChange={(e) => props.onComposeContentChange(e.target.value)}
                  rows={10}
                  className="min-h-[160px] w-full flex-1 resize-y rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Napisz wiadomość…"
                />
              </div>

              <div className="mt-auto flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={props.sendingCompose}
                  onClick={props.onClearForm}
                  className="w-full rounded-full border border-zinc-300 bg-white py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 sm:w-auto sm:px-5"
                >
                  Wyczyść formularz
                </button>
                <button
                  type="button"
                  disabled={props.sendingCompose}
                  onClick={props.onSend}
                  className="w-full flex-1 rounded-full bg-[#0f6e56] py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:opacity-50"
                >
                  {props.sendingCompose
                    ? 'Wysyłanie…'
                    : props.canPickIndividuals && props.selectedRecipientIds.length > 1
                      ? `Wyślij do ${props.selectedRecipientIds.length} osób`
                      : 'Wyślij'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
