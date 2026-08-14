'use client';

import { useEffect, useRef, useState } from 'react';
import ComposeEmailRecipientsColumn, {
  type ComposeExternalEmailRecipient,
} from '@/src/components/messages/ComposeEmailRecipientsColumn';
import {
  applyTemplateValues,
  ENROLLMENT_CHILD_NAME_TOKEN,
  extractTemplatePlaceholders,
  getTemplateFieldMeta,
} from '@/lib/message-templates';

export type { ComposeExternalEmailRecipient };

export type ComposePanelMode = 'manager' | 'teacher' | 'parent';
export type ComposeSection = 'parents' | 'teachers' | 'email' | 'enrollment-email';

const COMPOSE_FILTER_FIELD =
  'flex w-full min-h-[2.375rem] items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 outline-none transition focus:border-[#0f6e56] focus:ring-2 focus:ring-[#0f6e56]/20';

/** Stały ciemny tekst — nie dziedziczy jasnego koloru z `body` przy ciemnym motywie systemu. */
const COMPOSE_INPUT =
  'rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light]';

const COMPOSE_FILTER_CHEVRON = 'pointer-events-none shrink-0 text-xs text-zinc-400';

function ComposeFilterMultiSelect({
  items,
  selectedIds,
  placeholder,
  emptyListMessage,
  pluralLabel,
  onFilterChange,
  onConfirm,
}: {
  items: Array<{ id: string; name: string }>;
  selectedIds: string[];
  placeholder: string;
  emptyListMessage: string;
  pluralLabel: string;
  onFilterChange: (ids: string[]) => void;
  onConfirm: (ids: string[]) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>(selectedIds);
  const [confirming, setConfirming] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    setPendingIds(selectedIds);
    setOpen(true);
    updateMenuPosition();
  };

  const closeMenu = () => {
    setOpen(false);
    setMenuStyle(null);
  };

  const applyFilterAndClose = (ids: string[]) => {
    onFilterChange(ids);
    closeMenu();
  };

  const confirmSelection = async () => {
    if (pendingIds.length === 0 || confirming) return;
    setConfirming(true);
    try {
      await onConfirm(pendingIds);
      closeMenu();
    } finally {
      setConfirming(false);
    }
  };

  const clearAndClose = () => {
    setPendingIds([]);
    applyFilterAndClose([]);
  };

  const updateMenuPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) setPendingIds(selectedIds);
  }, [selectedIds, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      applyFilterAndClose(pendingIds);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, pendingIds, onFilterChange]);

  const selectedNames = items
    .filter((item) => selectedIds.includes(item.id))
    .map((item) => item.name);

  const triggerLabel =
    selectedIds.length === 0
      ? placeholder
      : selectedIds.length === 1
        ? selectedNames[0]
        : `${selectedIds.length} ${pluralLabel}`;

  const allPendingSelected =
    items.length > 0 && items.every((item) => pendingIds.includes(item.id));

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) applyFilterAndClose(pendingIds);
          else openMenu();
        }}
        className={COMPOSE_FILTER_FIELD}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span
          className={`min-w-0 flex-1 truncate ${selectedIds.length === 0 ? 'text-zinc-500' : 'text-zinc-900'}`}
        >
          {triggerLabel}
        </span>
        <span className={COMPOSE_FILTER_CHEVRON} aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && menuStyle && (
        <div
          ref={menuRef}
          className="fixed z-[60] flex max-h-[min(280px,50vh)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
          style={{
            top: menuStyle.top,
            left: menuStyle.left,
            width: menuStyle.width,
          }}
        >
          {items.length > 0 && (
            <div className="flex shrink-0 items-center justify-end border-b border-zinc-100 px-2 py-1">
              <button
                type="button"
                onClick={() => {
                  const ids = items.map((item) => item.id);
                  setPendingIds(allPendingSelected ? [] : ids);
                }}
                className="text-[11px] font-semibold text-[#0f6e56] underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
              >
                {allPendingSelected ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </button>
            </div>
          )}
          <div
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5"
            role="listbox"
            aria-multiselectable="true"
          >
            {items.length === 0 ? (
              <p className="px-1 py-2 text-xs text-zinc-500">{emptyListMessage}</p>
            ) : (
              items.map((item) => (
                <label
                  key={item.id}
                  role="option"
                  aria-selected={pendingIds.includes(item.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={pendingIds.includes(item.id)}
                    onChange={() => {
                      setPendingIds(
                        pendingIds.includes(item.id)
                          ? pendingIds.filter((id) => id !== item.id)
                          : [...pendingIds, item.id]
                      );
                    }}
                    className="rounded border-zinc-300 text-[#0f6e56]"
                  />
                  <span className="min-w-0 truncate">{item.name}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-zinc-100 p-2">
            <button
              type="button"
              onClick={clearAndClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Wyczyść
            </button>
            <button
              type="button"
              disabled={pendingIds.length === 0 || confirming}
              onClick={() => void confirmSelection()}
              className="flex-1 rounded-lg bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b5a46] disabled:opacity-50"
            >
              {confirming ? 'Dodawanie…' : 'Wybierz'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface ComposeRecipientOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  childNames?: string | null;
  role: string;
}

export interface ComposeFilterMeta {
  groups: Array<{ id: string; name: string; locationId: string | null }>;
  locations: Array<{ id: string; name: string }>;
  schoolYears: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
}

export interface ComposeMessageModalProps {
  open: boolean;
  onClose: () => void;
  mode: ComposePanelMode;
  canPickIndividuals: boolean;
  recipientsLoading?: boolean;
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
  filterGroupIds: string[];
  onGroupFilterChange: (groupIds: string[]) => void;
  onConfirmGroupFilter: (groupIds: string[]) => void | Promise<void>;
  onAddAllFromList: () => void;
  showBulkParentAddButtons?: boolean;
  onAddAllFromDatabase?: () => void;
  onAddAllActiveClients?: () => void;
  bulkAddLoading?: 'all' | 'active' | null;
  composeSubject: string;
  onComposeSubjectChange: (value: string) => void;
  composeContent: string;
  onComposeContentChange: (value: string) => void;
  sendingCompose: boolean;
  onSend: (meta?: {
    templateKey?: string;
    templateFieldValues?: Record<string, string>;
  }) => void;
  onClearForm: () => void;
  composeSection?: ComposeSection;
  onComposeSectionChange?: (section: ComposeSection) => void;
  showSectionTabs?: boolean;
  showTeachersTab?: boolean;
  externalEmailRecipients?: ComposeExternalEmailRecipient[];
  externalEmailBulkPaste?: string;
  onExternalEmailBulkPasteChange?: (value: string) => void;
  onParseExternalEmailBulk?: () => void;
  onRemoveExternalEmailRecipient?: (key: string) => void;
  enrollmentEmailLocationId?: string;
  onEnrollmentEmailLocationIdChange?: (locationId: string) => void;
  enrollmentEmailBirthYear?: string;
  onEnrollmentEmailBirthYearChange?: (year: string) => void;
  enrollmentEmailBirthYears?: Array<{ year: number; count: number }>;
  enrollmentEmailAddLoading?: boolean;
  enrollmentEmailLocations?: Array<{ id: string; name: string; newCount?: number }>;
  messageTemplates?: Array<{ key: string; label: string; subject: string; content: string }>;
  onApplyTemplate?: (subject: string, content: string) => void;
  /** Aktywne dzieci rodzica — pole szablonu `dziecko` jako select. */
  parentChildren?: Array<{ id: string; firstName: string; lastName: string }>;
  filterRenewalNoResponse?: boolean;
  onFilterRenewalNoResponseChange?: (value: boolean) => void;
}

export default function ComposeMessageModal(props: ComposeMessageModalProps) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!props.open) {
      setSelectedTemplateKey('');
      setTemplateFieldValues({});
    }
  }, [props.open]);

  useEffect(() => {
    if (props.composeSection && props.composeSection !== 'parents') {
      setSelectedTemplateKey('');
      setTemplateFieldValues({});
    }
  }, [props.composeSection]);

  if (!props.open) return null;

  const section = props.composeSection ?? 'parents';
  const isEmailSection = section === 'email' || section === 'enrollment-email';
  const isEnrollmentEmailSection = section === 'enrollment-email';
  const isTeachersAudience = section === 'teachers';

  const selectedTemplate =
    section !== 'parents'
      ? null
      : (props.messageTemplates?.find((t) => t.key === selectedTemplateKey) ?? null);
  const templateFields = selectedTemplate
    ? extractTemplatePlaceholders(selectedTemplate.subject, selectedTemplate.content)
    : [];
  const templateFieldsIncomplete =
    selectedTemplate != null &&
    templateFields.some((field) => !(templateFieldValues[field]?.trim()));

  const pushTemplateIntoCompose = (
    template: { subject: string; content: string },
    values: Record<string, string>
  ) => {
    if (!props.onApplyTemplate) return;
    const displayValues = { ...values };
    if (displayValues.dziecko) {
      const child = (props.parentChildren ?? []).find((c) => c.id === displayValues.dziecko);
      if (child) {
        displayValues.dziecko = `${child.firstName} ${child.lastName}`.trim();
      }
    }
    const filled = applyTemplateValues(template, displayValues);
    props.onApplyTemplate(filled.subject, filled.content);
  };

  const handleTemplateSelect = (key: string) => {
    setSelectedTemplateKey(key);
    if (!key) {
      setTemplateFieldValues({});
      props.onApplyTemplate?.('', '');
      return;
    }
    const tpl = props.messageTemplates?.find((t) => t.key === key);
    if (!tpl || !props.onApplyTemplate) return;
    const emptyValues: Record<string, string> = {};
    const children = props.parentChildren ?? [];
    for (const field of extractTemplatePlaceholders(tpl.subject, tpl.content)) {
      if (field === 'dziecko' && children.length === 1) {
        emptyValues[field] = children[0].id;
      } else {
        emptyValues[field] = '';
      }
    }
    setTemplateFieldValues(emptyValues);
    pushTemplateIntoCompose(tpl, emptyValues);
  };

  const handleTemplateFieldChange = (field: string, value: string) => {
    if (!selectedTemplate) return;
    const next = { ...templateFieldValues, [field]: value };
    setTemplateFieldValues(next);
    pushTemplateIntoCompose(selectedTemplate, next);
  };

  const handleClearForm = () => {
    setSelectedTemplateKey('');
    setTemplateFieldValues({});
    props.onClearForm();
  };

  const adresatIds = props.canPickIndividuals
    ? props.selectedRecipientIds
    : props.singleRecipientId
      ? [props.singleRecipientId]
      : [];
  const externalEmailRecipients = props.externalEmailRecipients ?? [];
  const uniqueExternalEmails = [
    ...new Set(externalEmailRecipients.map((r) => r.email.trim().toLowerCase()).filter(Boolean)),
  ];
  const totalRecipients = isEnrollmentEmailSection
    ? externalEmailRecipients.length
    : isEmailSection
      ? uniqueExternalEmails.length
      : adresatIds.length;

  const searchPlaceholder =
    props.mode === 'parent'
      ? 'Szukaj zarządcy po imieniu, nazwisku lub e-mailu…'
      : props.mode === 'teacher'
        ? 'Szukaj rodzica po imieniu, nazwisku lub e-mailu…'
        : isTeachersAudience
          ? 'Szukaj nauczyciela po imieniu, nazwisku lub e-mailu…'
          : 'Szukaj rodzica po imieniu, nazwisku lub e-mailu…';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="flex h-[min(92vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-xl [color-scheme:light]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 md:px-5 md:py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h3 id="compose-modal-title" className="text-lg font-bold text-zinc-900">
              Nowa wiadomość
            </h3>
            {props.showSectionTabs && props.onComposeSectionChange && (
              <div
                className="flex rounded-full bg-zinc-100 p-0.5"
                role="tablist"
                aria-label="Tryb wysyłki"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === 'parents'}
                  onClick={() => props.onComposeSectionChange!('parents')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    section === 'parents'
                      ? 'bg-white text-[#0f6e56] shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Do rodziców
                </button>
                {props.showTeachersTab && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'teachers'}
                    onClick={() => props.onComposeSectionChange!('teachers')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      section === 'teachers'
                        ? 'bg-white text-[#0f6e56] shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Do nauczycieli
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === 'email'}
                  onClick={() => props.onComposeSectionChange!('email')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    section === 'email'
                      ? 'bg-white text-[#0f6e56] shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Wyślij e-mail
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={section === 'enrollment-email'}
                  onClick={() => props.onComposeSectionChange!('enrollment-email')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    section === 'enrollment-email'
                      ? 'bg-white text-[#0f6e56] shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  E-mail ze zgłoszeń
                </button>
              </div>
            )}

          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:grid-rows-1">
          {isEmailSection ? (
            <ComposeEmailRecipientsColumn
              mode={isEnrollmentEmailSection ? 'enrollment' : 'manual'}
              recipients={externalEmailRecipients}
              onRemoveRecipient={(key) => props.onRemoveExternalEmailRecipient?.(key)}
              externalEmailBulkPaste={props.externalEmailBulkPaste ?? ''}
              onExternalEmailBulkPasteChange={(v) => props.onExternalEmailBulkPasteChange?.(v)}
              onParseExternalEmailBulk={() => props.onParseExternalEmailBulk?.()}
              locations={
                isEnrollmentEmailSection
                  ? (props.enrollmentEmailLocations ?? [])
                  : (props.filterMeta?.locations ?? [])
              }
              enrollmentLocationId={props.enrollmentEmailLocationId ?? ''}
              onEnrollmentLocationIdChange={(id) =>
                props.onEnrollmentEmailLocationIdChange?.(id)
              }
              birthYears={props.enrollmentEmailBirthYears ?? []}
              enrollmentBirthYear={props.enrollmentEmailBirthYear ?? ''}
              onEnrollmentBirthYearChange={(year) =>
                props.onEnrollmentEmailBirthYearChange?.(year)
              }
              enrollmentAddLoading={props.enrollmentEmailAddLoading}
            />
          ) : (
          <div className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 bg-zinc-50/80 p-3 md:border-b-0 md:border-r md:p-4">
            {props.canPickIndividuals &&
              !isTeachersAudience &&
              (props.mode === 'manager' || props.mode === 'teacher') && (
              <div className="mb-2 shrink-0 rounded-xl border border-zinc-200 bg-white">
                <button
                  type="button"
                  onClick={props.onToggleGroupFilters}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-zinc-700"
                >
                  {props.mode === 'teacher'
                    ? 'Filtry moich grup'
                    : 'Wysyłka do grupy (filtry masowe)'}
                  <span className="text-zinc-400">{props.showGroupFilters ? '▲' : '▼'}</span>
                </button>
                {props.showGroupFilters && (
                  <div className="max-h-48 space-y-2 overflow-y-auto border-t border-zinc-200 p-3">
                    {props.filterMeta && (
                      <>
                        <ComposeFilterMultiSelect
                          items={props.filterMeta.groups}
                          selectedIds={props.filterGroupIds}
                          placeholder="Wybierz grupę"
                          emptyListMessage="Brak grup"
                          pluralLabel="grupy"
                          onFilterChange={props.onGroupFilterChange}
                          onConfirm={props.onConfirmGroupFilter}
                        />
                        {props.mode === 'manager' && props.onFilterRenewalNoResponseChange && (
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={props.filterRenewalNoResponse ?? false}
                              onChange={(e) => {
                                props.onFilterRenewalNoResponseChange?.(e.target.checked);
                                props.onGroupFilterChange(props.filterGroupIds);
                              }}
                              className="rounded border-zinc-300 text-[#0f6e56]"
                            />
                            <span className="text-zinc-800">
                              Tylko rodzice bez odpowiedzi na odnowienie
                            </span>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {props.mode === 'parent' ? (
              <p className="mb-1.5 shrink-0 text-sm font-semibold text-zinc-800">Adresaci</p>
            ) : (
              <>
                <p className="mb-1.5 shrink-0 text-sm font-semibold text-zinc-800">Wyszukaj adresatów</p>
                <input
                  type="search"
                  value={props.recipientSearch}
                  onChange={(e) => props.onRecipientSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={`mb-2 w-full shrink-0 ${COMPOSE_INPUT}`}
                />
              </>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
              {props.recipientsLoading ? (
                <p className="px-3 py-4 text-xs text-zinc-500">Ładowanie listy…</p>
              ) : props.recipients.length === 0 ? (
                <p className="px-3 py-4 text-xs text-zinc-500">
                  {props.mode === 'parent'
                    ? 'Brak dostępnych odbiorców.'
                    : props.recipientSearchDebounced
                      ? 'Brak wyników — zmień wyszukiwanie'
                      : props.mode === 'teacher'
                        ? 'Brak rodziców w Twoich grupach. Użyj filtrów lub poczekaj na przypisanie uczniów.'
                        : isTeachersAudience
                          ? 'Brak nauczycieli w szkole.'
                          : 'Wybierz filtry lub wyszukaj rodzica.'}
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

            {props.canPickIndividuals && !isTeachersAudience && (
              props.showBulkParentAddButtons ? (
                <div className="mt-2 flex shrink-0 flex-col gap-1.5 border-t border-zinc-200/80 pt-2 md:flex-row">
                  <button
                    type="button"
                    disabled={!!props.bulkAddLoading}
                    onClick={props.onAddAllFromDatabase}
                    className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold leading-tight text-[#0f6e56] hover:bg-emerald-100 disabled:opacity-50 md:text-xs"
                  >
                    {props.bulkAddLoading === 'all' ? 'Ładowanie…' : 'Dodaj wszystkich z bazy'}
                  </button>
                  <button
                    type="button"
                    disabled={!!props.bulkAddLoading}
                    onClick={props.onAddAllActiveClients}
                    className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold leading-tight text-[#0f6e56] hover:bg-emerald-100 disabled:opacity-50 md:text-xs"
                  >
                    {props.bulkAddLoading === 'active'
                      ? 'Ładowanie…'
                      : 'Dodaj aktualnych klientów'}
                  </button>
                  <button
                    type="button"
                    disabled={props.recipients.length === 0}
                    onClick={props.onAddAllFromList}
                    className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold leading-tight text-[#0f6e56] hover:bg-emerald-100 disabled:opacity-50 md:text-xs"
                  >
                    Z listy ({props.recipients.length})
                  </button>
                </div>
              ) : (
                props.recipients.length > 0 && (
                  <button
                    type="button"
                    onClick={props.onAddAllFromList}
                    className="mt-3 w-full shrink-0 rounded-lg bg-emerald-50 py-2 text-sm font-semibold text-[#0f6e56] hover:bg-emerald-100"
                  >
                    Dodaj wszystkich z listy ({props.recipients.length})
                  </button>
                )
              )
            )}
          </div>
          )}

          {/* Prawa kolumna — treść wiadomości */}
          <div className="flex min-h-0 flex-col overflow-hidden p-3 md:p-4">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:gap-3">
              {section === 'parents' &&
                props.messageTemplates &&
                props.messageTemplates.length > 0 &&
                props.onApplyTemplate && (
                <div className="shrink-0">
                  <label htmlFor="compose-template" className="mb-1 block text-sm font-medium text-zinc-800">
                    Szablon wiadomości
                  </label>
                  <select
                    id="compose-template"
                    value={selectedTemplateKey}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className={`w-full ${COMPOSE_INPUT}`}
                  >
                    <option value="">Bez szablonu — napisz własną wiadomość</option>
                    {props.messageTemplates.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!isEmailSection && (
                <div className="shrink-0">
                  <label className="mb-1 block text-sm font-medium text-zinc-800">
                    Adresat / Adresaci
                  </label>
                  <div className="max-h-20 overflow-y-auto rounded-xl border border-zinc-300 bg-zinc-50/50 px-3 py-2 md:max-h-24">
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
              )}

              {selectedTemplate && templateFields.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  {templateFields.map((field) => {
                    const meta = getTemplateFieldMeta(field);
                    const fieldId = `compose-tpl-${field}`;
                    const childOptions = props.parentChildren ?? [];
                    const useChildSelect = field === 'dziecko' && childOptions.length > 0;

                    return (
                      <label key={field} htmlFor={fieldId} className="block shrink-0 text-sm">
                        <span className="mb-1 block font-medium text-zinc-800">{meta.label}</span>
                        {useChildSelect ? (
                          <select
                            id={fieldId}
                            value={templateFieldValues[field] ?? ''}
                            onChange={(e) => handleTemplateFieldChange(field, e.target.value)}
                            className={`w-full ${COMPOSE_INPUT}`}
                          >
                            <option value="">Wybierz dziecko…</option>
                            {childOptions.map((child) => {
                              const name = `${child.firstName} ${child.lastName}`.trim();
                              return (
                                <option key={child.id} value={child.id}>
                                  {name}
                                </option>
                              );
                            })}
                          </select>
                        ) : meta.multiline ? (
                          <textarea
                            id={fieldId}
                            rows={4}
                            value={templateFieldValues[field] ?? ''}
                            onChange={(e) => handleTemplateFieldChange(field, e.target.value)}
                            placeholder={meta.placeholder}
                            className={`w-full ${COMPOSE_INPUT}`}
                          />
                        ) : (
                          <input
                            id={fieldId}
                            type="text"
                            value={templateFieldValues[field] ?? ''}
                            onChange={(e) => handleTemplateFieldChange(field, e.target.value)}
                            placeholder={meta.placeholder}
                            className={`w-full ${COMPOSE_INPUT}`}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <>
                  {isEnrollmentEmailSection && (
                    <p className="shrink-0 text-[11px] leading-snug text-zinc-500">
                      W temacie i treści jest token{' '}
                      <code className="rounded bg-zinc-100 px-1 py-0.5 text-[11px] text-zinc-800">
                        {ENROLLMENT_CHILD_NAME_TOKEN}
                      </code>{' '}
                      (imię i nazwisko dziecka) — przy wysyłce podstawi się dane z listy odbiorców.
                    </p>
                  )}
                  <div className="shrink-0">
                    <label htmlFor="compose-subject" className="mb-1 block text-sm font-medium text-zinc-800">
                      Temat
                    </label>
                    <input
                      id="compose-subject"
                      type="text"
                      value={props.composeSubject}
                      onChange={(e) => props.onComposeSubjectChange(e.target.value)}
                      className={`w-full ${COMPOSE_INPUT}`}
                    />
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col">
                    <label htmlFor="compose-body" className="mb-1 block shrink-0 text-sm font-medium text-zinc-800">
                      Treść wiadomości
                    </label>
                    <textarea
                      id="compose-body"
                      value={props.composeContent}
                      onChange={(e) => props.onComposeContentChange(e.target.value)}
                      className={`min-h-0 w-full flex-1 resize-none ${COMPOSE_INPUT}`}
                      placeholder={isEnrollmentEmailSection ? undefined : 'Napisz wiadomość…'}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-2 flex shrink-0 flex-col gap-2 border-t border-zinc-200 pt-2 sm:flex-row md:mt-3">
              <button
                type="button"
                disabled={props.sendingCompose}
                onClick={handleClearForm}
                className="w-full rounded-full border border-zinc-300 bg-white py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 sm:w-auto sm:px-5"
              >
                Wyczyść formularz
              </button>
              <button
                type="button"
                disabled={props.sendingCompose || templateFieldsIncomplete}
                onClick={() =>
                  props.onSend(
                    section === 'parents' && selectedTemplateKey
                      ? {
                          templateKey: selectedTemplateKey,
                          templateFieldValues,
                        }
                      : undefined
                  )
                }
                className="w-full flex-1 rounded-full bg-[#0f6e56] py-2 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:opacity-50"
              >
                {props.sendingCompose
                  ? 'Wysyłanie…'
                  : totalRecipients > 1
                    ? `Wyślij do ${totalRecipients} odbiorców`
                    : 'Wyślij'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
