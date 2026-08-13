'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ComposeMessageModal, {
  type ComposeExternalEmailRecipient,
  type ComposeSection,
} from '@/src/components/messages/ComposeMessageModal';
import { parseEmailList } from '@/lib/email-address';
import { normalizePolishPhone } from '@/lib/phone';

function uniqueEmailsFromRecipients(list: ComposeExternalEmailRecipient[]): string[] {
  return [...new Set(list.map((r) => r.email.trim().toLowerCase()).filter(Boolean))];
}

function isExternalEmailComposeSection(section: ComposeSection): boolean {
  return section === 'email' || section === 'enrollment-email';
}

type PanelMode = 'manager' | 'teacher' | 'parent';

interface ThreadSummary {
  id: string;
  subject: string | null;
  content: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  replyCount: number;
  unreadCount: number;
  lastReplyAt: string | null;
  sender: { id: string; firstName: string; lastName: string; role: string };
  recipient: { id: string; firstName: string; lastName: string; role: string };
}

interface ThreadMessage {
  id: string;
  subject: string | null;
  content: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    roleLabel: string;
    phone?: string | null;
  };
}

interface RecipientOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  childNames?: string | null;
  role: string;
}

interface FilterMeta {
  groups: Array<{ id: string; name: string; locationId: string | null }>;
  locations: Array<{ id: string; name: string }>;
  schoolYears: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; name: string }>;
}

function initials(first: string, last: string): string {
  return `${(first[0] ?? '').toUpperCase()}${(last[0] ?? '').toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewText(text: string, max = 50): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function roleLabel(role: string): string {
  if (role === 'MANAGER') return 'Zarządca';
  if (role === 'TEACHER') return 'Nauczyciel';
  if (role === 'PARENT') return 'Rodzic';
  return role;
}

function isEnrollmentScheduleInquiry(subject: string | null | undefined): boolean {
  return (subject ?? '').trim().startsWith('Zgłoszenie —');
}

function formatPhoneDisplay(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const normalized = normalizePolishPhone(raw);
  return normalized || raw;
}

interface MessagesPanelProps {
  mode: PanelMode;
  currentUserId?: string;
  /** Inkrementuj przy ponownym kliknięciu zakładki „Wiadomości” — wraca do listy. */
  listResetToken?: number;
  /** Wywołaj po zmianie skrzynki (odśwież licznik na zakładce). */
  onInboxChange?: () => void;
  /** Aktywne dzieci rodzica (select w szablonach). */
  parentChildren?: Array<{ id: string; firstName: string; lastName: string }>;
}

export default function MessagesPanel({
  mode,
  currentUserId: currentUserIdProp,
  listResetToken = 0,
  onInboxChange,
  parentChildren,
}: MessagesPanelProps) {
  const [currentUserId, setCurrentUserId] = useState(currentUserIdProp ?? '');

  useEffect(() => {
    if (currentUserIdProp) {
      setCurrentUserId(currentUserIdProp);
      return;
    }
    fetch('/api/user/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, [currentUserIdProp]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [sendingCompose, setSendingCompose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [selectedRecipientLabels, setSelectedRecipientLabels] = useState<Record<string, string>>(
    {}
  );
  const [singleRecipientId, setSingleRecipientId] = useState('');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientSearchDebounced, setRecipientSearchDebounced] = useState('');
  const [showGroupFilters, setShowGroupFilters] = useState(false);

  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([]);
  const [filterLocationIds, setFilterLocationIds] = useState<string[]>([]);
  const [filterRenewalNoResponse, setFilterRenewalNoResponse] = useState(false);
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false);
  const [messageTemplates, setMessageTemplates] = useState<
    Array<{ key: string; label: string; subject: string; content: string }>
  >([]);
  const [recipientsReloadToken, setRecipientsReloadToken] = useState(0);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [composeSection, setComposeSection] = useState<ComposeSection>('parents');
  const [bulkAddLoading, setBulkAddLoading] = useState<'all' | 'active' | null>(null);
  const [externalEmailRecipients, setExternalEmailRecipients] = useState<
    ComposeExternalEmailRecipient[]
  >([]);
  const [externalEmailBulkPaste, setExternalEmailBulkPaste] = useState('');
  const [enrollmentEmailLocationId, setEnrollmentEmailLocationId] = useState('');
  const [enrollmentEmailAddLoading, setEnrollmentEmailAddLoading] = useState(false);
  const pendingComposeMetaRef = useRef<{
    templateKey?: string;
    templateFieldValues?: Record<string, string>;
  } | null>(null);

  const canPickIndividuals = mode === 'manager' || mode === 'teacher' || mode === 'parent';
  const canUseExternalEmails = mode === 'manager' || mode === 'teacher';

  const resetComposeForm = useCallback(() => {
    setSelectedRecipientIds([]);
    setSelectedRecipientLabels({});
    setSingleRecipientId('');
    setRecipientSearch('');
    setRecipientSearchDebounced('');
    setFilterGroupIds([]);
    setFilterLocationIds([]);
    setFilterRenewalNoResponse(false);
    setSendPreviewOpen(false);
    setShowGroupFilters(false);
    setComposeSection('parents');
    setBulkAddLoading(null);
    setComposeSubject('');
    setComposeContent('');
    setExternalEmailRecipients([]);
    setExternalEmailBulkPaste('');
    setEnrollmentEmailLocationId('');
    setEnrollmentEmailAddLoading(false);
    pendingComposeMetaRef.current = null;
    setRecipientsReloadToken((t) => t + 1);
  }, []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    resetComposeForm();
  }, [resetComposeForm]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setRecipientSearchDebounced(recipientSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [recipientSearch]);

  useEffect(() => {
    setSelectedThreadId(null);
    closeCompose();
    setReplyText('');
    setError(null);
  }, [listResetToken, closeCompose]);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ page: '1', limit: '50' });
      if (searchDebounced) q.set('search', searchDebounced);
      const res = await fetch(`/api/messages?${q}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd pobierania');
      setThreads(data.threads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania wiadomości');
    } finally {
      setLoading(false);
      onInboxChange?.();
    }
  }, [searchDebounced, onInboxChange]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const closeThread = useCallback(() => {
    setSelectedThreadId(null);
    setReplyText('');
    void loadThreads();
  }, [loadThreads]);

  const loadThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${threadId}/thread`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd pobierania wątku');
      setThreadMessages(data.thread ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania wątku');
    } finally {
      setThreadLoading(false);
      onInboxChange?.();
    }
  }, [onInboxChange]);

  useEffect(() => {
    if (selectedThreadId) void loadThread(selectedThreadId);
    else setThreadMessages([]);
  }, [selectedThreadId, loadThread]);

  const buildRecipientsQuery = useCallback(
    (overrides?: { locationIds?: string[]; groupIds?: string[] }) => {
      const locationIds = overrides?.locationIds ?? filterLocationIds;
      const groupIds = overrides?.groupIds ?? filterGroupIds;
      const q = new URLSearchParams();
      if (mode !== 'parent' && recipientSearchDebounced) q.set('search', recipientSearchDebounced);

      if (mode === 'manager' && composeSection === 'teachers') {
        q.set('audience', 'teachers');
        return q;
      }

      if (mode === 'manager') {
        const hasBulk =
          groupIds.length > 0 || locationIds.length > 0 || filterRenewalNoResponse;
        if (!hasBulk) q.set('all', 'true');
        else {
          if (groupIds.length > 0) q.set('groupIds', groupIds.join(','));
          if (locationIds.length > 0) q.set('locationIds', locationIds.join(','));
          if (filterRenewalNoResponse) q.set('renewalNoResponse', 'true');
        }
      } else if (mode === 'teacher') {
        if (groupIds.length > 0) q.set('groupIds', groupIds.join(','));
        if (locationIds.length > 0) q.set('locationIds', locationIds.join(','));
      }
      return q;
    },
    [mode, composeSection, recipientSearchDebounced, filterGroupIds, filterLocationIds, filterRenewalNoResponse]
  );

  const fetchRecipientsList = useCallback(
    async (overrides?: {
      locationIds?: string[];
      groupIds?: string[];
    }): Promise<RecipientOption[]> => {
      const res = await fetch(`/api/messages/recipients?${buildRecipientsQuery(overrides)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd odbiorców');
      const parents: RecipientOption[] = (data.parents ?? []).map(
        (p: {
          id: string;
          firstName: string;
          lastName: string;
          email?: string;
          childNames?: string | null;
          role: string;
        }) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          childNames: p.childNames,
          role: p.role,
        })
      );
      const teachers: RecipientOption[] = (data.teachers ?? []).map(
        (t: { id: string; firstName: string; lastName: string; email?: string; role: string }) => ({
          id: t.id,
          firstName: t.firstName,
          lastName: t.lastName,
          email: t.email,
          role: t.role,
        })
      );
      if (mode === 'parent') return teachers;
      if (mode === 'manager' && composeSection === 'teachers') return teachers;
      return parents;
    },
    [buildRecipientsQuery, mode, composeSection]
  );

  const loadRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    try {
      setRecipients(await fetchRecipientsList());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd odbiorców');
      setRecipients([]);
    } finally {
      setRecipientsLoading(false);
    }
  }, [fetchRecipientsList]);

  useEffect(() => {
    if (composeOpen && !isExternalEmailComposeSection(composeSection)) void loadRecipients();
  }, [
    composeOpen,
    composeSection,
    loadRecipients,
    recipientsReloadToken,
    filterGroupIds,
    filterLocationIds,
    filterRenewalNoResponse,
  ]);

  const handleComposeSectionChange = useCallback((section: ComposeSection) => {
    setComposeSection(section);
    setSendPreviewOpen(false);
    setError(null);

    if (isExternalEmailComposeSection(section)) {
      setSelectedRecipientIds([]);
      setSelectedRecipientLabels({});
      setSingleRecipientId('');
      setFilterGroupIds([]);
      setFilterLocationIds([]);
      setFilterRenewalNoResponse(false);
      setShowGroupFilters(false);
      setExternalEmailRecipients([]);
      setExternalEmailBulkPaste('');
      setEnrollmentEmailLocationId('');
      setEnrollmentEmailAddLoading(false);
      return;
    }

    setExternalEmailRecipients([]);
    setExternalEmailBulkPaste('');
    setEnrollmentEmailLocationId('');
    setEnrollmentEmailAddLoading(false);
    setSelectedRecipientIds([]);
    setSelectedRecipientLabels({});
    setFilterGroupIds([]);
    setFilterLocationIds([]);
    setFilterRenewalNoResponse(false);
    setShowGroupFilters(false);
    setRecipientsReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!composeOpen) return;
    fetch('/api/messages/templates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setMessageTemplates(data.templates ?? []))
      .catch(() => setMessageTemplates([]));
  }, [composeOpen, mode]);

  useEffect(() => {
    if (composeOpen && (mode === 'manager' || mode === 'teacher')) {
      fetch('/api/messages/recipients', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.groups) setFilterMeta(data);
        })
        .catch(() => {});
    }
  }, [composeOpen, mode]);

  useEffect(() => {
    if (!filterMeta || filterGroupIds.length === 0) return;
    const visibleGroupIds = new Set(
      (filterLocationIds.length === 0
        ? filterMeta.groups
        : filterMeta.groups.filter(
            (g) => g.locationId && filterLocationIds.includes(g.locationId)
          )
      ).map((g) => g.id)
    );
    const valid = filterGroupIds.filter((id) => visibleGroupIds.has(id));
    if (valid.length !== filterGroupIds.length) setFilterGroupIds(valid);
  }, [filterMeta, filterGroupIds, filterLocationIds]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const counterpart = (thread: ThreadSummary) =>
    thread.senderId === currentUserId ? thread.recipient : thread.sender;

  const handleSendReply = async () => {
    if (!selectedThreadId || !replyText.trim()) return;
    const root = threadMessages[0];
    if (!root) return;
    setSendingReply(true);
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientIds: [],
          subject: root.subject ?? 'Odpowiedź',
          content: replyText.trim(),
          parentMessageId: selectedThreadId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd wysyłania');
      setReplyText('');
      await loadThread(selectedThreadId);
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd wysyłania');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendCompose = async (meta?: {
    templateKey?: string;
    templateFieldValues?: Record<string, string>;
  }) => {
    if (meta) pendingComposeMetaRef.current = meta;
    const composeMeta = meta ?? pendingComposeMetaRef.current;

    const isEmailSection = isExternalEmailComposeSection(composeSection);
    const recipientIds = isEmailSection
      ? []
      : canPickIndividuals
        ? selectedRecipientIds
        : singleRecipientId
          ? [singleRecipientId]
          : [];
    const emailsToSend = isEmailSection
      ? uniqueEmailsFromRecipients(externalEmailRecipients)
      : [];
    if (
      (recipientIds.length === 0 && emailsToSend.length === 0) ||
      !composeSubject.trim() ||
      !composeContent.trim()
    ) {
      setError(
        isEmailSection
          ? 'Uzupełnij adresy e-mail, temat i treść'
          : 'Uzupełnij odbiorców, temat i treść'
      );
      return;
    }
    const totalRecipients = isEmailSection ? emailsToSend.length : recipientIds.length;
    if (totalRecipients > 1 && !sendPreviewOpen) {
      setSendPreviewOpen(true);
      return;
    }
    setSendingCompose(true);
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientIds,
          ...(isEmailSection && canUseExternalEmails
            ? { externalEmails: emailsToSend }
            : {}),
          subject: composeSubject.trim(),
          content: composeContent.trim(),
          ...(composeMeta?.templateKey
            ? {
                templateKey: composeMeta.templateKey,
                templateFields: composeMeta.templateFieldValues ?? {},
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        emailsSent?: number;
        emailsFailed?: number;
        externalEmailsCount?: number;
      };
      if (!res.ok) throw new Error(data.message ?? 'Błąd wysyłania');
      if ((data.emailsFailed ?? 0) > 0) {
        setError(
          `Wysłano, ale ${data.emailsFailed} powiadomień e-mail nie powiodło się (wysłano: ${data.emailsSent ?? 0}).`
        );
      }
      pendingComposeMetaRef.current = null;
      closeCompose();
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd wysyłania');
    } finally {
      setSendingCompose(false);
      setSendPreviewOpen(false);
    }
  };

  const recipientLabel = (r: RecipientOption) => {
    const name = `${r.firstName} ${r.lastName}`.trim();
    if (r.childNames) return `${name} (${r.childNames})`;
    if (r.role === 'MANAGER') return `${name} (zarządca szkoły)`;
    if (r.role === 'TEACHER') return `${name} (nauczyciel)`;
    return name;
  };

  const parseExternalEmailBulk = () => {
    const parsed = parseEmailList(externalEmailBulkPaste);
    if (parsed.length === 0) {
      setError('Nie znaleziono poprawnych adresów e-mail na liście');
      return;
    }
    setExternalEmailRecipients((prev) => {
      const existingKeys = new Set(prev.map((r) => r.key));
      const next = [...prev];
      for (const email of parsed) {
        const key = `manual:${email}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push({ key, email });
      }
      return next;
    });
    setExternalEmailBulkPaste('');
    setError(null);
  };

  const loadEnrollmentEmailRecipients = useCallback(async (locationId: string) => {
    // Zachowaj tylko ręczne adresy; zgłoszenia podmieniamy pod wybraną lokalizację.
    setExternalEmailRecipients((prev) => prev.filter((r) => r.key.startsWith('manual:')));
    if (!locationId) {
      setEnrollmentEmailAddLoading(false);
      return;
    }
    setEnrollmentEmailAddLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ locationId });
      const res = await fetch(`/api/messages/enrollment-email-recipients?${q}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd pobierania zgłoszeń');
      const list = (data.recipients ?? []) as Array<{
        requestId: string;
        email: string;
        parentFirstName: string;
        parentLastName: string;
        childFirstName: string;
        childLastName: string;
      }>;
      const fromEnrollment: ComposeExternalEmailRecipient[] = list.map((row) => ({
        key: row.requestId,
        email: row.email,
        parentName: `${row.parentFirstName} ${row.parentLastName}`.trim(),
        childName: `${row.childFirstName} ${row.childLastName}`.trim(),
      }));
      setExternalEmailRecipients((prev) => [
        ...prev.filter((r) => r.key.startsWith('manual:')),
        ...fromEnrollment,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania zgłoszeń');
    } finally {
      setEnrollmentEmailAddLoading(false);
    }
  }, []);

  const handleEnrollmentEmailLocationChange = useCallback(
    (locationId: string) => {
      setEnrollmentEmailLocationId(locationId);
      void loadEnrollmentEmailRecipients(locationId);
    },
    [loadEnrollmentEmailRecipients]
  );

  const addRecipient = (r: RecipientOption) => {
    setSelectedRecipientIds((prev) => (prev.includes(r.id) ? prev : [...prev, r.id]));
    setSelectedRecipientLabels((prev) => ({
      ...prev,
      [r.id]: recipientLabel(r),
    }));
  };

  const addRecipientsToSelection = useCallback(
    (list: RecipientOption[]) => {
      if (list.length === 0) return;
      setSelectedRecipientIds((prev) => {
        const ids = new Set(prev);
        for (const r of list) ids.add(r.id);
        return [...ids];
      });
      setSelectedRecipientLabels((prev) => {
        const next = { ...prev };
        for (const r of list) {
          next[r.id] = recipientLabel(r);
        }
        return next;
      });
    },
    [recipientLabel]
  );

  const fetchBulkParents = useCallback(
    async (bulkParents: 'active' | 'all') => {
      if (mode !== 'manager' || composeSection !== 'parents') return;
      setBulkAddLoading(bulkParents);
      setError(null);
      try {
        const q = new URLSearchParams();
        q.set('bulkParents', bulkParents);
        const res = await fetch(`/api/messages/recipients?${q}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Błąd odbiorców');
        const list: RecipientOption[] = (data.parents ?? []).map(
          (p: {
            id: string;
            firstName: string;
            lastName: string;
            email?: string;
            childNames?: string | null;
            role: string;
          }) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            childNames: p.childNames,
            role: p.role,
          })
        );
        addRecipientsToSelection(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd odbiorców');
      } finally {
        setBulkAddLoading(null);
      }
    },
    [mode, composeSection, addRecipientsToSelection]
  );

  const addParentsFromFilter = useCallback(
    async (opts: { locationIds?: string[]; groupIds?: string[] }) => {
      const locationIds = opts.locationIds;
      const groupIds = opts.groupIds;
      if (composeSection !== 'parents') return;
      if ((locationIds?.length ?? 0) === 0 && (groupIds?.length ?? 0) === 0) return;

      if (locationIds) setFilterLocationIds(locationIds);
      if (groupIds) setFilterGroupIds(groupIds);

      setRecipientsLoading(true);
      setError(null);
      try {
        const list = await fetchRecipientsList({
          ...(locationIds ? { locationIds } : {}),
          ...(groupIds ? { groupIds } : {}),
        });
        setRecipients(list);
        setSelectedRecipientIds((prev) => {
          const ids = new Set(prev);
          for (const r of list) ids.add(r.id);
          return [...ids];
        });
        setSelectedRecipientLabels((prev) => {
          const next = { ...prev };
          for (const r of list) {
            next[r.id] = recipientLabel(r);
          }
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Błąd odbiorców');
        setRecipients([]);
      } finally {
        setRecipientsLoading(false);
      }
    },
    [composeSection, fetchRecipientsList, recipientLabel]
  );

  const addParentsFromLocations = useCallback(
    (locationIds: string[]) => addParentsFromFilter({ locationIds }),
    [addParentsFromFilter]
  );

  const addParentsFromGroups = useCallback(
    (groupIds: string[]) => addParentsFromFilter({ groupIds }),
    [addParentsFromFilter]
  );

  const removeRecipient = (id: string) => {
    setSelectedRecipientIds((prev) => prev.filter((x) => x !== id));
    setSelectedRecipientLabels((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const selectSingleRecipient = (r: RecipientOption) => {
    setSingleRecipientId(r.id);
    setSelectedRecipientLabels({ [r.id]: recipientLabel(r) });
  };

  const clearSingleRecipient = () => {
    setSingleRecipientId('');
    setSelectedRecipientLabels({});
  };

  if (selectedThreadId) {
    if (!selectedThread) {
      return (
        <section className="rounded-3xl border border-emerald-100 bg-white p-6">
          <button
            type="button"
            onClick={() => void closeThread()}
            className="text-sm font-semibold text-[#0f6e56] hover:underline"
          >
            ← Wróć do listy
          </button>
          <p className="mt-4 text-sm text-zinc-500">Ładowanie…</p>
        </section>
      );
    }
    const rootSubject = threadMessages[0]?.subject ?? selectedThread.subject ?? '(bez tematu)';
    const showParentPhoneInThread = isEnrollmentScheduleInquiry(rootSubject);
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 text-zinc-900 md:p-6 [color-scheme:light]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void closeThread()}
            className="text-sm font-semibold text-[#0f6e56] hover:underline"
          >
            ← Wróć do listy
          </button>
          <h2 className="text-lg font-bold text-zinc-900 md:text-xl">{rootSubject}</h2>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {threadLoading ? (
          <p className="text-sm text-zinc-500">Ładowanie wątku…</p>
        ) : (
          <div className="space-y-4 border-t border-zinc-100 pt-4">
            {threadMessages.map((msg) => {
              const parentPhone =
                showParentPhoneInThread && msg.sender.role === 'PARENT'
                  ? formatPhoneDisplay(msg.sender.phone)
                  : null;
              return (
              <article
                key={msg.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4"
              >
                <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2">
                  <div>
                    <span className="font-semibold text-zinc-900">
                      {msg.sender.firstName} {msg.sender.lastName}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {msg.sender.roleLabel ?? roleLabel(msg.sender.role)}
                    </span>
                    {parentPhone && (
                      <span className="ml-2 text-xs text-zinc-600">
                        · tel. {parentPhone}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-zinc-500">{formatDate(msg.createdAt)}</time>
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                  {msg.content}
                </p>
              </article>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-zinc-100 pt-4">
          <label htmlFor="reply-text" className="text-sm font-medium text-zinc-800">
            Odpowiedz
          </label>
          <textarea
            id="reply-text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ring-[#0f6e56]/30 focus:border-[#0f6e56] focus:ring-2 [color-scheme:light]"
            placeholder="Napisz odpowiedź…"
          />
          <button
            type="button"
            disabled={sendingReply || !replyText.trim()}
            onClick={() => void handleSendReply()}
            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:opacity-50"
          >
            {sendingReply ? 'Wysyłanie…' : 'Odpowiedz'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 text-zinc-900 md:p-6 [color-scheme:light]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Wiadomości</h2>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46]"
        >
          Nowa wiadomość
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Szukaj po temacie lub treści…"
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ring-[#0f6e56]/30 focus:border-[#0f6e56] focus:ring-2 [color-scheme:light]"
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Ładowanie…</p>
      ) : threads.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          Brak wiadomości.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
          {threads.map((thread) => {
            const other = counterpart(thread);
            const isUnread = thread.unreadCount > 0;
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`flex w-full gap-3 border-l-4 px-4 py-3 text-left transition hover:bg-emerald-50/50 ${
                    isUnread
                      ? 'border-[#0f6e56] bg-emerald-50/60'
                      : 'border-transparent'
                  }`}
                >
                  <span
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                      isUnread ? 'bg-[#0b5a46]' : 'bg-[#0f6e56]'
                    }`}
                  >
                    {initials(other.firstName, other.lastName)}
                    {isUnread && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#ffc94a]"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={isUnread ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-900'}>
                        {other.firstName} {other.lastName}
                      </span>
                      {isUnread && (
                        <span className="rounded-full bg-[#0f6e56] px-2 py-0.5 text-xs font-bold text-white">
                          {thread.unreadCount === 1 ? 'Nowa' : `${thread.unreadCount} nowe`}
                        </span>
                      )}
                      {thread.replyCount > 0 && (
                        <span className="text-xs text-zinc-500">
                          {thread.replyCount}{' '}
                          {thread.replyCount === 1 ? 'odpowiedź' : 'odpowiedzi'}
                        </span>
                      )}
                      <span className={`ml-auto text-xs ${isUnread ? 'font-semibold text-[#0f6e56]' : 'text-zinc-500'}`}>
                        {formatDate(thread.lastReplyAt ?? thread.createdAt)}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-sm ${
                        isUnread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800'
                      }`}
                    >
                      {thread.subject ?? '(bez tematu)'}
                    </span>
                    <span className={`mt-0.5 block truncate text-xs ${isUnread ? 'text-zinc-700' : 'text-zinc-500'}`}>
                      {previewText(thread.content)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ComposeMessageModal
        open={composeOpen}
        onClose={closeCompose}
        mode={mode}
        canPickIndividuals={canPickIndividuals}
        recipientsLoading={recipientsLoading}
        recipients={recipients}
        recipientSearch={recipientSearch}
        onRecipientSearchChange={setRecipientSearch}
        recipientSearchDebounced={recipientSearchDebounced}
        selectedRecipientIds={selectedRecipientIds}
        selectedRecipientLabels={selectedRecipientLabels}
        singleRecipientId={singleRecipientId}
        onAddRecipient={addRecipient}
        onRemoveRecipient={removeRecipient}
        onSelectSingleRecipient={selectSingleRecipient}
        onClearSingleRecipient={clearSingleRecipient}
        recipientLabel={recipientLabel}
        showGroupFilters={showGroupFilters}
        onToggleGroupFilters={() => setShowGroupFilters((v) => !v)}
        filterMeta={filterMeta}
        filterGroupIds={filterGroupIds}
        onGroupFilterChange={setFilterGroupIds}
        onConfirmGroupFilter={addParentsFromGroups}
        filterLocationIds={filterLocationIds}
        onLocationFilterChange={setFilterLocationIds}
        onConfirmLocationFilter={addParentsFromLocations}
        onAddAllFromList={() => addRecipientsToSelection(recipients)}
        showBulkParentAddButtons={mode === 'manager' && composeSection === 'parents'}
        onAddAllFromDatabase={() => void fetchBulkParents('all')}
        onAddAllActiveClients={() => void fetchBulkParents('active')}
        bulkAddLoading={bulkAddLoading}
        composeSubject={composeSubject}
        onComposeSubjectChange={setComposeSubject}
        composeContent={composeContent}
        onComposeContentChange={setComposeContent}
        sendingCompose={sendingCompose}
        onSend={(meta) => void handleSendCompose(meta)}
        onClearForm={resetComposeForm}
        composeSection={composeSection}
        onComposeSectionChange={handleComposeSectionChange}
        showSectionTabs={canUseExternalEmails}
        showTeachersTab={mode === 'manager'}
        externalEmailRecipients={externalEmailRecipients}
        externalEmailBulkPaste={externalEmailBulkPaste}
        onExternalEmailBulkPasteChange={setExternalEmailBulkPaste}
        onParseExternalEmailBulk={parseExternalEmailBulk}
        onRemoveExternalEmailRecipient={(key) =>
          setExternalEmailRecipients((prev) => prev.filter((r) => r.key !== key))
        }
        enrollmentEmailLocationId={enrollmentEmailLocationId}
        onEnrollmentEmailLocationIdChange={handleEnrollmentEmailLocationChange}
        enrollmentEmailAddLoading={enrollmentEmailAddLoading}
        messageTemplates={messageTemplates}
        onApplyTemplate={(subject, content) => {
          setComposeSubject(subject);
          setComposeContent(content);
        }}
        parentChildren={parentChildren}
        filterRenewalNoResponse={filterRenewalNoResponse}
        onFilterRenewalNoResponseChange={setFilterRenewalNoResponse}
      />

      {sendPreviewOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3 className="text-lg font-bold text-zinc-900">Podgląd wysyłki</h3>
              <p className="mt-1 text-sm text-zinc-600">
                {isExternalEmailComposeSection(composeSection)
                  ? `Wyślesz e-mail do ${uniqueEmailsFromRecipients(externalEmailRecipients).length} adresów`
                  : `Wyślesz wiadomość do ${selectedRecipientIds.length} odbiorców`}
              </p>
            </div>
            <ul className="max-h-64 overflow-y-auto px-5 py-3 text-sm">
              {isExternalEmailComposeSection(composeSection)
                ? externalEmailRecipients.map((r) => (
                    <li key={r.key} className="border-b border-zinc-100 py-2">
                      {r.parentName || r.childName ? (
                        <>
                          <span className="font-medium">{r.parentName || 'Rodzic'}</span>
                          {r.childName ? (
                            <span className="text-zinc-600"> · dziecko: {r.childName}</span>
                          ) : null}
                          <span className="mt-0.5 block text-xs text-zinc-500">{r.email}</span>
                        </>
                      ) : (
                        r.email
                      )}
                    </li>
                  ))
                : selectedRecipientIds.map((id) => (
                    <li key={id} className="border-b border-zinc-100 py-2">
                      {selectedRecipientLabels[id] ?? id}
                    </li>
                  ))}
            </ul>
            <div className="flex gap-2 border-t border-zinc-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setSendPreviewOpen(false)}
                className="flex-1 rounded-full border border-zinc-300 py-2 text-sm font-semibold text-zinc-700"
              >
                Wróć
              </button>
              <button
                type="button"
                disabled={sendingCompose}
                onClick={() => void handleSendCompose()}
                className="flex-1 rounded-full bg-[#0f6e56] py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sendingCompose ? 'Wysyłanie…' : 'Potwierdź i wyślij'}
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
