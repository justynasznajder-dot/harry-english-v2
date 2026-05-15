'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accessLevel?: 'PENDING' | 'PROPOSED' | 'CONTRACT_SENT' | 'ACTIVE';
  children?: Array<{
    childId?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    active?: boolean;
    resignationRequested?: boolean;
    resignationReason?: string | null;
  }>;
}

interface UserPortalProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updatedInfo: UserInfo) => void;
}

interface EnrollmentProposal {
  request_id: string;
  request_status: 'PROPOSED' | 'NEGOTIATING' | 'ACCEPTED' | 'SIGNED';
  child_first_name: string;
  child_last_name: string;
  group_name: string | null;
  location_name: string;
  schedule: string;
  proposed_at?: string | null;
}

type ProposalHistoryRow = {
  id: string;
  proposed_at: string;
  responded_at: string | null;
  status: string;
  rejection_comment: string | null;
  group_name: string;
  location_name: string;
  schedule: string;
  proposed_by_first_name: string;
  proposed_by_last_name: string;
};

type FlashKind = 'success' | 'error' | 'info';
interface Flash {
  kind: FlashKind;
  message: string;
}

type PortalTab = 'enrollment' | 'messages' | 'group' | 'attendance' | 'payments';
type EnrollmentStepKey = 'pending' | 'proposed' | 'contractSent' | 'active';

interface EnrollmentStep {
  key: EnrollmentStepKey;
  label: string;
}

const topTabs: Array<{ key: PortalTab; label: string }> = [
  { key: 'enrollment', label: 'Proces zapisu' },
  { key: 'messages', label: 'Wiadomości' },
  { key: 'group', label: 'Moja grupa' },
  { key: 'attendance', label: 'Obecności' },
  { key: 'payments', label: 'Płatności' },
];

const enrollmentSteps: EnrollmentStep[] = [
  { key: 'pending', label: 'Zgłoszenie' },
  { key: 'proposed', label: 'Propozycja grupy' },
  { key: 'contractSent', label: 'Umowa' },
  { key: 'active', label: 'Podsumowanie' },
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
      {message}
    </div>
  );
}

export default function UserPortal({ userInfo, onUserInfoUpdate }: UserPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('enrollment');
  /** Multi-child: który `request_id` ma rozwiniętą textarea odrzucenia. */
  const [rejectOpenFor, setRejectOpenFor] = useState<Record<string, boolean>>({});
  /** Multi-child: komentarz odrzucenia per `request_id`. */
  const [rejectComments, setRejectComments] = useState<Record<string, string>>({});
  const [newMessage, setNewMessage] = useState('');
  const [proposals, setProposals] = useState<EnrollmentProposal[]>([]);
  const [proposalHistoryByRequestId, setProposalHistoryByRequestId] = useState<
    Record<string, ProposalHistoryRow[]>
  >({});
  const [proposalsLoading, setProposalsLoading] = useState(false);
  /** Trwa akceptacja konkretnego zgłoszenia (po `request_id`). */
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  /** Trwa odrzucenie konkretnego zgłoszenia. */
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  /**
   * Synchroniczna blokada zapisu (accept/reject) — stan React (`acceptingId` /
   * `rejectingId`) aktualizuje się dopiero po re-renderze, więc przy dwójce
   * dzieci drugie kliknięcie mogło „przejść” przez `if (acceptingId ||
   * rejectingId) return` z przestarzałym closure albo bez komunikatu dla
   * użytkownika.
   */
  const enrollmentActionBusyRef = useRef(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const currentStepIndexByAccessLevel: Record<'PENDING' | 'PROPOSED' | 'CONTRACT_SENT' | 'ACTIVE', number> = {
    PENDING: 0,
    PROPOSED: 1,
    CONTRACT_SENT: 2,
    ACTIVE: 3,
  };
  const currentStepIndex = currentStepIndexByAccessLevel[userInfo.accessLevel ?? 'PENDING'];

  const refreshUserAccessLevel = useCallback(async () => {
    try {
      const r = await fetch('/api/user/me', { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as { user?: UserInfo };
      if (data.user) onUserInfoUpdate(data.user);
    } catch (err) {
      console.error('Nie udało się odświeżyć profilu rodzica', err);
    }
  }, [onUserInfoUpdate]);

  const loadProposals = useCallback(async () => {
    setProposalsLoading(true);
    try {
      const r = await fetch('/api/enrollment/status', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) {
        setProposals([]);
        return;
      }
      const data = (await r.json()) as {
        proposals?: EnrollmentProposal[];
        proposal?: EnrollmentProposal | null;
      };
      if (Array.isArray(data.proposals)) {
        setProposals(data.proposals);
      } else if (data.proposal) {
        setProposals([data.proposal]);
      } else {
        setProposals([]);
      }
    } catch (err) {
      console.error('Nie udało się pobrać statusu propozycji', err);
      setProposals([]);
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    if (proposals.length === 0) {
      setProposalHistoryByRequestId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        proposals.map(async (p) => {
          const r = await fetch(
            `/api/user/enrollment/proposals?enrollmentRequestId=${encodeURIComponent(p.request_id)}`,
            { cache: 'no-store', credentials: 'include' },
          );
          if (!r.ok) return [p.request_id, []] as const;
          const d = (await r.json()) as { proposals?: ProposalHistoryRow[] };
          return [p.request_id, d.proposals ?? []] as const;
        }),
      );
      if (!cancelled) setProposalHistoryByRequestId(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [proposals]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [flash]);

  const handleAcceptProposal = useCallback(
    async (requestId: string) => {
      if (enrollmentActionBusyRef.current) {
        setFlash({
          kind: 'info',
          message: 'Trwa już inna akcja zapisu — poczekaj chwilę i spróbuj ponownie.',
        });
        return;
      }
      enrollmentActionBusyRef.current = true;
      setAcceptingId(requestId);
      try {
        const r = await fetch('/api/enrollment/accept', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
          credentials: 'include',
        });
        const data = (await r.json().catch(() => ({}))) as {
          message?: string;
          remainingProposed?: number;
        };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data?.message ?? 'Nie udało się zaakceptować propozycji.' });
          return;
        }
        setFlash({
          kind: 'success',
          message:
            (data.remainingProposed ?? 0) > 0
              ? 'Propozycja zaakceptowana. Umowa dla tego dziecka jest gotowa — pozostałe propozycje czekają na decyzję.'
              : 'Propozycja zaakceptowana. Sprawdź skrzynkę — wysłaliśmy umowę.',
        });
        setRejectOpenFor((prev) => ({ ...prev, [requestId]: false }));
        await Promise.all([loadProposals(), refreshUserAccessLevel()]);
      } catch (err) {
        console.error('Accept proposal error:', err);
        setFlash({ kind: 'error', message: 'Nie udało się zaakceptować propozycji. Spróbuj ponownie.' });
      } finally {
        enrollmentActionBusyRef.current = false;
        setAcceptingId(null);
      }
    },
    [loadProposals, refreshUserAccessLevel]
  );

  const handleRejectProposal = useCallback(
    async (requestId: string) => {
      if (enrollmentActionBusyRef.current) {
        setFlash({
          kind: 'info',
          message: 'Trwa już inna akcja zapisu — poczekaj chwilę i spróbuj ponownie.',
        });
        return;
      }
      enrollmentActionBusyRef.current = true;
      setRejectingId(requestId);
      try {
        const reason = (rejectComments[requestId] ?? '').trim();
        const r = await fetch('/api/enrollment/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrollmentRequestId: requestId,
            rejectionComment: reason.length > 0 ? reason : undefined,
          }),
          credentials: 'include',
        });
        const data = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data?.message ?? 'Nie udało się odrzucić propozycji.' });
          return;
        }
        setFlash({
          kind: 'success',
          message:
            'Propozycja odrzucona. Szkoła została powiadomiona — czekaj na nową propozycję.',
        });
        setRejectOpenFor((prev) => ({ ...prev, [requestId]: false }));
        setRejectComments((prev) => ({ ...prev, [requestId]: '' }));
        await loadProposals();
        await refreshUserAccessLevel();
      } catch (err) {
        console.error('Reject proposal error:', err);
        setFlash({ kind: 'error', message: 'Nie udało się odrzucić propozycji. Spróbuj ponownie.' });
      } finally {
        enrollmentActionBusyRef.current = false;
        setRejectingId(null);
      }
    },
    [rejectComments, loadProposals, refreshUserAccessLevel]
  );

  const renderEnrollmentStepContent = () => {
    const currentStep = enrollmentSteps[currentStepIndex];

    if (currentStep.key === 'pending') {
      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Zgłoszenie</h3>
          <EmptyState message="Brak szczegółów zgłoszenia (dziecko, lokalizacja, data zgłoszenia)." />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Zgłoszenie dotarło do szkoły. Czekamy na propozycję grupy.
          </div>
        </section>
      );
    }

    if (currentStep.key === 'proposed') {
      const anyActionInFlight = acceptingId != null || rejectingId != null;
      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Propozycja grupy</h3>

          {proposalsLoading && proposals.length === 0 ? (
            <EmptyState message="Ładujemy szczegóły propozycji…" />
          ) : proposals.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Brak aktywnej propozycji. Po stronie szkoły trwa dobór grupy — wrócimy do Ciebie wkrótce.
            </div>
          ) : (
            <div className="space-y-4">
              {proposals.length > 1 && (
                <p className="text-sm text-zinc-600">
                  Mamy propozycje dla {proposals.length} dzieci. Każdą możesz zaakceptować lub
                  odrzucić niezależnie.
                </p>
              )}
              {proposals.map((p) => {
                const isAccepting = acceptingId === p.request_id;
                const isRejecting = rejectingId === p.request_id;
                const isActionable = p.request_status === 'PROPOSED';
                const isNegotiating = p.request_status === 'NEGOTIATING';
                const history = (proposalHistoryByRequestId[p.request_id] ?? []).filter(
                  (h) => h.status !== 'PENDING',
                );
                const buttonsDisabled = anyActionInFlight;
                const isOpen = rejectOpenFor[p.request_id] === true;
                const comment = rejectComments[p.request_id] ?? '';
                return (
                  <div
                    key={p.request_id}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold text-zinc-900">
                        {p.child_first_name} {p.child_last_name}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.request_status === 'PROPOSED'
                            ? 'bg-sky-100 text-sky-800'
                            : p.request_status === 'NEGOTIATING'
                              ? 'bg-amber-100 text-amber-900'
                              : p.request_status === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-emerald-200 text-emerald-900'
                        }`}
                      >
                        {p.request_status === 'PROPOSED'
                          ? 'Do decyzji'
                          : p.request_status === 'NEGOTIATING'
                            ? 'Oczekuje na nową propozycję szkoły'
                            : p.request_status === 'ACCEPTED'
                              ? 'Zaakceptowana — czekaj na umowę'
                              : 'Umowa podpisana'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1.5 text-sm text-zinc-800 sm:grid-cols-[max-content_1fr]">
                      <span className="font-semibold text-zinc-900">Grupa:</span>
                      <span>{p.group_name ?? 'Do ustalenia'}</span>
                      <span className="font-semibold text-zinc-900">Lokalizacja:</span>
                      <span>{p.location_name}</span>
                      <span className="font-semibold text-zinc-900">Termin:</span>
                      <span>{p.schedule}</span>
                    </div>

                    {isNegotiating && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        Odrzuciłeś(-aś) ostatnią propozycję. Szkoła przygotuje nową propozycję grupy — wrócimy do
                        Ciebie wkrótce.
                      </div>
                    )}

                    {isActionable && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleAcceptProposal(p.request_id)}
                            disabled={buttonsDisabled}
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isAccepting ? 'Akceptowanie…' : 'Akceptuję'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRejectOpenFor((prev) => ({
                                ...prev,
                                [p.request_id]: !prev[p.request_id],
                              }))
                            }
                            disabled={buttonsDisabled}
                            className="rounded-full bg-[#ffc94a] px-5 py-2.5 text-sm font-semibold text-[#3b2a10] transition hover:bg-[#ffd76f] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Odrzucam
                          </button>
                        </div>
                        {isOpen && (
                          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
                            <label
                              htmlFor={`reject-comment-${p.request_id}`}
                              className="text-sm font-medium text-zinc-800"
                            >
                              Komentarz do odrzucenia{' '}
                              <span className="text-zinc-500">(opcjonalnie)</span>
                            </label>
                            <textarea
                              id={`reject-comment-${p.request_id}`}
                              value={comment}
                              onChange={(event) =>
                                setRejectComments((prev) => ({
                                  ...prev,
                                  [p.request_id]: event.target.value,
                                }))
                              }
                              placeholder="Np. nie pasuje mi termin / wolimy inną lokalizację…"
                              maxLength={2000}
                              className="min-h-24 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
                            />
                            <button
                              type="button"
                              onClick={() => handleRejectProposal(p.request_id)}
                              disabled={buttonsDisabled}
                              className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isRejecting ? 'Wysyłanie…' : 'Wyślij odrzucenie'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {history.length > 0 && (
                      <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/90">
                        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-zinc-800">
                          Historia wcześniejszych propozycji grup ({history.length})
                        </summary>
                        <div className="space-y-2 border-t border-zinc-200 px-4 py-3 text-sm">
                          {history.map((h) => (
                            <div key={h.id} className="rounded-lg border border-white bg-white p-2">
                              <p className="font-semibold text-zinc-900">{h.group_name}</p>
                              <p className="text-xs text-zinc-600">
                                {h.location_name} · {h.schedule}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {new Date(h.proposed_at).toLocaleString('pl-PL', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}{' '}
                                · {h.status}
                                {h.responded_at
                                  ? ` · ${new Date(h.responded_at).toLocaleString('pl-PL', {
                                      dateStyle: 'short',
                                      timeStyle: 'short',
                                    })}`
                                  : ''}
                              </p>
                              {h.status === 'REJECTED' && h.rejection_comment && (
                                <p className="mt-1 text-xs text-rose-800">Twój komentarz: {h.rejection_comment}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {flash && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                flash.kind === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : flash.kind === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : 'border-sky-200 bg-sky-50 text-sky-900'
              }`}
            >
              {flash.message}
            </div>
          )}
        </section>
      );
    }

    if (currentStep.key === 'contractSent') {
      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Umowa</h3>
          <p className="text-sm text-zinc-600">
            Uzupełnij dane do umowy i podpisz dokument w tym samym kroku.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Imię"
              className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
            />
            <input
              type="text"
              placeholder="Nazwisko"
              className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
            />
            <input
              type="text"
              placeholder="Adres"
              className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 md:col-span-2"
            />
            <input
              type="text"
              placeholder="Miasto"
              className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
            />
            <input
              type="text"
              placeholder="Kod pocztowy"
              className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800">Sposób rozliczeń</p>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input type="radio" name="billingType" className="accent-[#0f6e56]" />
                Miesięczny
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input type="radio" name="billingType" className="accent-[#0f6e56]" />
                Jednorazowy
              </label>
            </div>
          </div>
          <button
            type="button"
            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46]"
          >
            Zapisz
          </button>
          <EmptyState message="Brak dostępnego podglądu umowy do podpisania." />
          <button
            type="button"
            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46]"
          >
            Podpisz umowę
          </button>
        </section>
      );
    }

    return (
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Podsumowanie</h3>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Zapis został zakończony i dziecko jest aktywnym uczestnikiem zajęć.
        </div>
        <EmptyState message="Brak szczegółów grupy i dalszych kroków. Informacje pojawią się po stronie szkoły." />
      </section>
    );
  };

  const renderEnrollmentTab = () => (
    <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Proces zapisu</h2>
        <p className="mt-1 text-sm text-zinc-600">Śledź kolejne etapy od zgłoszenia do aktywacji dziecka.</p>
      </header>

      <div className="no-scrollbar overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {enrollmentSteps.map((step, index) => {
            const isDone = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                    isCurrent
                      ? 'border-[#ffc94a] bg-[#fff6dd] text-[#3b2a10]'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {step.label}
                </button>
                {index < enrollmentSteps.length - 1 && <span className="text-zinc-300">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5">{renderEnrollmentStepContent()}</div>
    </section>
  );

  const renderMessagesTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Wiadomości</h2>
      <EmptyState message="Brak wiadomości." />
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <label htmlFor="new-message" className="text-sm font-medium text-zinc-800">
          Nowa wiadomość
        </label>
        <textarea
          id="new-message"
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          placeholder="Wpisz wiadomość do managera szkoły..."
          className="min-h-28 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
        />
        <div>
          <button
            type="button"
            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46]"
          >
            Wyślij
          </button>
        </div>
      </div>
    </section>
  );

  const renderGroupTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
      <EmptyState message="Nie przypisano jeszcze do grupy." />
    </section>
  );

  const renderAttendanceTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Obecności</h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Data</th>
              <th className="px-4 py-3 font-semibold">Obecność dziecka</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-zinc-600">
                Brak danych o obecnościach.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderPaymentsTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Płatności</h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Miesiąc</th>
              <th className="px-4 py-3 font-semibold">Kwota</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-zinc-600">
                Brak danych o płatnościach.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderContent = () => {
    if (activeTab === 'enrollment') return renderEnrollmentTab();
    if (activeTab === 'messages') return renderMessagesTab();
    if (activeTab === 'group') return renderGroupTab();
    if (activeTab === 'attendance') return renderAttendanceTab();
    return renderPaymentsTab();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      <div className="rounded-3xl border border-emerald-100 bg-white">
        <nav className="no-scrollbar overflow-x-auto border-b border-emerald-100">
          <div className="flex min-w-max gap-2 p-2">
            {topTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-transparent bg-emerald-50/60 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {renderContent()}
    </div>
  );
}
