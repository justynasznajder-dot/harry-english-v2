'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ComposeMessageModal from '@/src/components/messages/ComposeMessageModal';

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

interface MessagesPanelProps {
  mode: PanelMode;
  currentUserId?: string;
  /** Inkrementuj przy ponownym kliknięciu zakładki „Wiadomości” — wraca do listy. */
  listResetToken?: number;
  /** Wywołaj po zmianie skrzynki (odśwież licznik na zakładce). */
  onInboxChange?: () => void;
}

export default function MessagesPanel({
  mode,
  currentUserId: currentUserIdProp,
  listResetToken = 0,
  onInboxChange,
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
  const [recipientsReloadToken, setRecipientsReloadToken] = useState(0);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [composeAudience, setComposeAudience] = useState<'parents' | 'teachers'>('parents');
  const [bulkAddLoading, setBulkAddLoading] = useState<'all' | 'active' | null>(null);

  const canPickIndividuals = mode === 'manager' || mode === 'teacher' || mode === 'parent';

  const resetComposeForm = useCallback(() => {
    setSelectedRecipientIds([]);
    setSelectedRecipientLabels({});
    setSingleRecipientId('');
    setRecipientSearch('');
    setRecipientSearchDebounced('');
    setFilterGroupIds([]);
    setFilterLocationIds([]);
    setShowGroupFilters(false);
    setComposeAudience('parents');
    setBulkAddLoading(null);
    setComposeSubject('');
    setComposeContent('');
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
      if (recipientSearchDebounced) q.set('search', recipientSearchDebounced);

      if (mode === 'manager' && composeAudience === 'teachers') {
        q.set('audience', 'teachers');
        return q;
      }

      if (mode === 'manager') {
        const hasBulk = groupIds.length > 0 || locationIds.length > 0;
        if (!hasBulk) q.set('all', 'true');
        else {
          if (groupIds.length > 0) q.set('groupIds', groupIds.join(','));
          if (locationIds.length > 0) q.set('locationIds', locationIds.join(','));
        }
      } else if (mode === 'teacher') {
        if (groupIds.length > 0) q.set('groupIds', groupIds.join(','));
        if (locationIds.length > 0) q.set('locationIds', locationIds.join(','));
      }
      return q;
    },
    [mode, composeAudience, recipientSearchDebounced, filterGroupIds, filterLocationIds]
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
      if (mode === 'manager' && composeAudience === 'teachers') return teachers;
      return parents;
    },
    [buildRecipientsQuery, mode, composeAudience]
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
    if (composeOpen) void loadRecipients();
  }, [
    composeOpen,
    loadRecipients,
    recipientsReloadToken,
    filterGroupIds,
    filterLocationIds,
    composeAudience,
  ]);

  const handleComposeAudienceChange = useCallback((audience: 'parents' | 'teachers') => {
    setComposeAudience(audience);
    setSelectedRecipientIds([]);
    setSelectedRecipientLabels({});
    setFilterGroupIds([]);
    setFilterLocationIds([]);
    setShowGroupFilters(false);
    setRecipientsReloadToken((t) => t + 1);
  }, []);

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

  const handleSendCompose = async () => {
    const recipientIds = canPickIndividuals
      ? selectedRecipientIds
      : singleRecipientId
        ? [singleRecipientId]
        : [];
    if (recipientIds.length === 0 || !composeSubject.trim() || !composeContent.trim()) {
      setError('Uzupełnij odbiorców, temat i treść');
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
          subject: composeSubject.trim(),
          content: composeContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Błąd wysyłania');
      closeCompose();
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd wysyłania');
    } finally {
      setSendingCompose(false);
    }
  };

  const recipientLabel = (r: RecipientOption) => {
    const name = `${r.firstName} ${r.lastName}`.trim();
    if (r.childNames) return `${name} (${r.childNames})`;
    if (r.role === 'MANAGER') return `${name} (zarządca szkoły)`;
    if (r.role === 'TEACHER') return `${name} (nauczyciel)`;
    return name;
  };

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
      if (mode !== 'manager' || composeAudience !== 'parents') return;
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
    [mode, composeAudience, addRecipientsToSelection]
  );

  const addParentsFromFilter = useCallback(
    async (opts: { locationIds?: string[]; groupIds?: string[] }) => {
      const locationIds = opts.locationIds;
      const groupIds = opts.groupIds;
      if (composeAudience !== 'parents') return;
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
    [composeAudience, fetchRecipientsList, recipientLabel]
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
    return (
      <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
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
            {threadMessages.map((msg) => (
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
                  </div>
                  <time className="text-xs text-zinc-500">{formatDate(msg.createdAt)}</time>
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                  {msg.content}
                </p>
              </article>
            ))}
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
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-[#0f6e56]/30 focus:border-[#0f6e56] focus:ring-2"
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
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
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
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-[#0f6e56]/30 focus:border-[#0f6e56] focus:ring-2"
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
        showBulkParentAddButtons={mode === 'manager' && composeAudience === 'parents'}
        onAddAllFromDatabase={() => void fetchBulkParents('all')}
        onAddAllActiveClients={() => void fetchBulkParents('active')}
        bulkAddLoading={bulkAddLoading}
        composeSubject={composeSubject}
        onComposeSubjectChange={setComposeSubject}
        composeContent={composeContent}
        onComposeContentChange={setComposeContent}
        sendingCompose={sendingCompose}
        onSend={() => void handleSendCompose()}
        onClearForm={resetComposeForm}
        composeAudience={composeAudience}
        onComposeAudienceChange={handleComposeAudienceChange}
        showAudienceToggle={mode === 'manager'}
      />

    </section>
  );
}
