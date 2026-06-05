'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ContractPortal from '@/src/components/ContractPortal';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import RenewalsBanner from '@/src/components/RenewalsBanner';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';

type ChildEnrollmentLevel = 'NEW' | 'PROPOSED' | 'NEGOTIATING' | 'ACCEPTED' | 'SIGNED' | 'COMPLETED' | 'REJECTED';

interface UserInfo {
  id: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  accessLevel?: 'PENDING' | 'ACTIVE';
  children?: Array<{
    childId?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    active?: boolean;
    accessLevel?: ChildEnrollmentLevel;
    resignationRequested?: boolean;
    resignationReason?: string | null;
  }>;
}

interface UserPortalProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updatedInfo: UserInfo) => void;
}

interface EnrollmentProposal {
  child_id?: string;
  request_id: string;
  access_level: ChildEnrollmentLevel;
  /** @deprecated alias — użyj `access_level` */
  request_status?: ChildEnrollmentLevel;
  child_first_name: string;
  child_last_name: string;
  group_name: string | null;
  location_name: string;
  schedule: string;
  proposed_at?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
  contract?: {
    id: string;
    status: string | null;
    amount: number | null;
    price_override: boolean;
    payment_type: string | null;
    content_html?: string | null;
    attachment_1_html?: string | null;
    attachment_2_html?: string | null;
    include_attachment_2?: boolean;
  } | null;
}

interface ParentProfileForm {
  address: string;
  city: string;
  zipCode: string;
  billingType: 'private' | 'company';
  pesel: string;
  companyName: string;
  nip: string;
}

function formatPlnAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;
}

function isExactDigits(value: string, length: number): boolean {
  return new RegExp(`^\\d{${length}}$`).test(value.trim());
}

function validateContractProfile(profile: ParentProfileForm): string | null {
  if (!profile.address.trim() || !profile.city.trim() || !profile.zipCode.trim()) {
    return 'Uzupełnij adres, miasto i kod pocztowy.';
  }
  if (profile.billingType === 'private') {
    if (!profile.pesel.trim()) return 'Podaj numer PESEL.';
    if (!isExactDigits(profile.pesel, 11)) return 'PESEL musi składać się z dokładnie 11 cyfr.';
  } else {
    if (!profile.companyName.trim() || !profile.nip.trim()) {
      return 'Dla faktury na firmę podaj nazwę firmy i NIP.';
    }
    if (!isExactDigits(profile.nip, 10)) return 'NIP musi składać się z dokładnie 10 cyfr.';
  }
  return null;
}

function resolveContractAmount(
  proposal: EnrollmentProposal,
  paymentType: 'MONTHLY' | 'YEARLY',
): number | null {
  if (proposal.contract?.price_override && proposal.contract.amount != null) {
    return proposal.contract.amount;
  }
  const fromGroup =
    paymentType === 'YEARLY' ? proposal.price_yearly : proposal.price_monthly;
  return fromGroup != null ? Number(fromGroup) : null;
}

interface EnrollmentRequestSummary {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string | null;
  submittedAt: string;
  children: Array<{
    requestId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    preferredLocation: string;
    submittedAt: string;
  }>;
}

function childAccessLevel(p: EnrollmentProposal): ChildEnrollmentLevel {
  return p.access_level ?? p.request_status ?? 'NEW';
}

function deriveEnrollmentStepIndex(
  proposals: EnrollmentProposal[],
  children: UserInfo['children'],
  accountAccessLevel: UserInfo['accessLevel']
): number {
  const levels = [
    ...proposals.map((p) => childAccessLevel(p)),
    ...(children ?? [])
      .filter((c) => c.active !== false)
      .map((c) => c.accessLevel)
      .filter((v): v is ChildEnrollmentLevel => Boolean(v)),
  ];

  if (levels.some((s) => s === 'SIGNED' || s === 'COMPLETED') || accountAccessLevel === 'ACTIVE') {
    return 3;
  }
  if (levels.some((s) => s === 'ACCEPTED')) return 2;
  if (levels.some((s) => s === 'PROPOSED' || s === 'NEGOTIATING')) return 1;
  return 0;
}

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
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);
  const [contactOpenFor, setContactOpenFor] = useState<Record<string, boolean>>({});
  const [contactSubjects, setContactSubjects] = useState<Record<string, string>>({});
  const [contactMessages, setContactMessages] = useState<Record<string, string>>({});
  const [schoolRecipientIds, setSchoolRecipientIds] = useState<string[]>([]);
  const schoolRecipientsLoadedRef = useRef(false);
  const [proposals, setProposals] = useState<EnrollmentProposal[]>([]);
  const [enrollmentRequestSummary, setEnrollmentRequestSummary] = useState<EnrollmentRequestSummary | null>(null);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [negotiatingId, setNegotiatingId] = useState<string | null>(null);
  const [sendingContactMessageId, setSendingContactMessageId] = useState<string | null>(null);
  const enrollmentActionBusyRef = useRef(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [contractProfile, setContractProfile] = useState<ParentProfileForm>({
    address: '',
    city: '',
    zipCode: '',
    billingType: 'private',
    pesel: '',
    companyName: '',
    nip: '',
  });
  const [paymentTypeByChild, setPaymentTypeByChild] = useState<
    Record<string, 'MONTHLY' | 'YEARLY'>
  >({});
  const [includeAttachment2ByChild, setIncludeAttachment2ByChild] = useState<
    Record<string, boolean>
  >({});
  const [savingContractChildId, setSavingContractChildId] = useState<string | null>(null);
  const [generatedContracts, setGeneratedContracts] = useState<
    Record<
      string,
      {
        id: string;
        content_html: string;
        attachment_1_html?: string | null;
        attachment_2_html?: string | null;
        status: string;
      }
    >
  >({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const currentStepIndex = deriveEnrollmentStepIndex(
    proposals,
    userInfo.children,
    userInfo.accessLevel
  );
  const [selectedStepIndex, setSelectedStepIndex] = useState(currentStepIndex);
  const [manualStepSelection, setManualStepSelection] = useState(false);

  useEffect(() => {
    if (!manualStepSelection) {
      setSelectedStepIndex(currentStepIndex);
      return;
    }
    setSelectedStepIndex((prev) => Math.min(prev, currentStepIndex));
  }, [currentStepIndex, manualStepSelection]);

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
        enrollmentRequestSummary?: EnrollmentRequestSummary | null;
      };
      if (Array.isArray(data.proposals)) {
        setProposals(data.proposals);
      } else if (data.proposal) {
        setProposals([data.proposal]);
      } else {
        setProposals([]);
      }
      setEnrollmentRequestSummary(data.enrollmentRequestSummary ?? null);
    } catch (err) {
      console.error('Nie udało się pobrać statusu propozycji', err);
      setProposals([]);
      setEnrollmentRequestSummary(null);
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    setIncludeAttachment2ByChild((prev) => {
      const next = { ...prev };
      for (const p of proposals) {
        const childId = p.child_id ?? p.request_id;
        if (p.contract?.include_attachment_2 && next[childId] === undefined) {
          next[childId] = true;
        }
      }
      return next;
    });
  }, [proposals]);

  const loadParentProfile = useCallback(async () => {
    try {
      const r = await fetch('/api/user/profile', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return;
      const data = (await r.json()) as {
        profile?: {
          address?: string | null;
          city?: string | null;
          zipCode?: string | null;
          companyName?: string | null;
          nip?: string | null;
          pesel?: string | null;
        } | null;
      };
      const p = data.profile;
      if (!p) {
        setProfileLoaded(true);
        return;
      }
      setContractProfile((prev) => ({
        address: p.address ?? prev.address,
        city: p.city ?? prev.city,
        zipCode: p.zipCode ?? prev.zipCode,
        billingType: p.companyName || p.nip ? 'company' : 'private',
        pesel: p.pesel ?? prev.pesel,
        companyName: p.companyName ?? prev.companyName,
        nip: p.nip ?? prev.nip,
      }));
      setProfileLoaded(true);
    } catch (err) {
      console.error('Nie udało się pobrać profilu rodzica', err);
      setProfileLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'enrollment') {
      void loadParentProfile();
    }
  }, [activeTab, loadParentProfile]);

  const handleSaveContractData = useCallback(
    async (childId: string, enrollmentRequestId: string) => {
      const validationError = validateContractProfile(contractProfile);
      if (validationError) {
        setFlash({ kind: 'error', message: validationError });
        return;
      }

      setSavingContractChildId(childId);
      try {
        const paymentType = paymentTypeByChild[childId] ?? 'MONTHLY';
        const includeAttachment2 = includeAttachment2ByChild[childId] ?? false;
        const r = await fetch('/api/parent/contract/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            childId,
            enrollmentRequestId,
            paymentType,
            includeAttachment2,
            billingType: contractProfile.billingType,
            address: contractProfile.address,
            city: contractProfile.city,
            zipCode: contractProfile.zipCode,
            pesel: contractProfile.billingType === 'private' ? contractProfile.pesel : null,
            companyName:
              contractProfile.billingType === 'company' ? contractProfile.companyName : null,
            nip: contractProfile.billingType === 'company' ? contractProfile.nip : null,
          }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          message?: string;
          contract?: {
            id: string;
            content_html: string;
            attachment_1_html?: string | null;
            attachment_2_html?: string | null;
            status: string;
          };
        };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zapisać danych umowy' });
          return;
        }
        if (data.contract) {
          setGeneratedContracts((prev) => ({
            ...prev,
            [childId]: data.contract!,
          }));
        }
        setFlash({
          kind: 'success',
          message: 'Dane zapisane. Zapoznaj się z umową i załącznikami, a następnie podpisz dokumenty poniżej.',
        });
        await loadProposals();
      } catch {
        setFlash({ kind: 'error', message: 'Nie udało się zapisać danych umowy' });
      } finally {
        setSavingContractChildId(null);
      }
    },
    [contractProfile, paymentTypeByChild, includeAttachment2ByChild, loadProposals],
  );

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [flash]);

  const loadSchoolRecipients = useCallback(async (): Promise<string[]> => {
    if (schoolRecipientsLoadedRef.current && schoolRecipientIds.length > 0) {
      return schoolRecipientIds;
    }
    try {
      const r = await fetch('/api/messages/recipients', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return [];
      const data = (await r.json()) as {
        teachers?: Array<{ id: string; role: string }>;
      };
      const ids = (data.teachers ?? []).map((t) => t.id).filter(Boolean);
      setSchoolRecipientIds(ids);
      schoolRecipientsLoadedRef.current = ids.length > 0;
      return ids;
    } catch {
      return [];
    }
  }, [schoolRecipientIds.length]);

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
              ? 'Propozycja zaakceptowana — uzupełnij dane do umowy dla tego dziecka. Pozostałe propozycje czekają na decyzję.'
              : 'Propozycja zaakceptowana — przejdź do uzupełnienia danych do umowy.',
        });
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

  const handleContactSchool = useCallback(
    async (p: EnrollmentProposal) => {
      if (enrollmentActionBusyRef.current) {
        setFlash({
          kind: 'info',
          message: 'Trwa już inna akcja — poczekaj chwilę i spróbuj ponownie.',
        });
        return;
      }
      enrollmentActionBusyRef.current = true;
      setNegotiatingId(p.request_id);
      try {
        const r = await fetch('/api/enrollment/negotiate', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: p.request_id }),
          credentials: 'include',
        });
        const data = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) {
          setFlash({
            kind: 'error',
            message: data?.message ?? 'Nie udało się zaktualizować statusu zgłoszenia.',
          });
          return;
        }
        const childName = `${p.child_first_name} ${p.child_last_name}`.trim();
        const groupLabel = p.group_name ?? 'propozycja grupy';
        setContactSubjects((prev) => ({
          ...prev,
          [p.request_id]: `Zgłoszenie — ${childName} (${groupLabel})`,
        }));
        setContactMessages((prev) => ({
          ...prev,
          [p.request_id]:
            prev[p.request_id] ??
            `Dzień dobry,\n\nPropozycja grupy (${groupLabel}, ${p.schedule}) nie pasuje nam w obecnej formie. Prosimy o kontakt w sprawie dalszych kroków.\n\nPozdrawiam`,
        }));
        setContactOpenFor((prev) => ({ ...prev, [p.request_id]: true }));
        await loadSchoolRecipients();
        await Promise.all([loadProposals(), refreshUserAccessLevel()]);
        setFlash({
          kind: 'success',
          message: 'Wyślij wiadomość do szkoły w formularzu poniżej.',
        });
      } catch (err) {
        console.error('Contact school error:', err);
        setFlash({ kind: 'error', message: 'Nie udało się rozpocząć kontaktu ze szkołą.' });
      } finally {
        enrollmentActionBusyRef.current = false;
        setNegotiatingId(null);
      }
    },
    [loadProposals, loadSchoolRecipients, refreshUserAccessLevel],
  );

  const handleSendContactMessage = useCallback(
    async (requestId: string) => {
      const subject = (contactSubjects[requestId] ?? '').trim();
      const content = (contactMessages[requestId] ?? '').trim();
      if (!subject || !content) {
        setFlash({ kind: 'error', message: 'Uzupełnij temat i treść wiadomości.' });
        return;
      }
      const recipientIds =
        schoolRecipientIds.length > 0 ? schoolRecipientIds : await loadSchoolRecipients();
      if (recipientIds.length === 0) {
        setFlash({
          kind: 'error',
          message: 'Nie udało się ustalić odbiorcy wiadomości — skontaktuj się telefonicznie ze szkołą.',
        });
        return;
      }
      setSendingContactMessageId(requestId);
      try {
        const r = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientIds, subject, content }),
          credentials: 'include',
        });
        const data = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data?.message ?? 'Nie udało się wysłać wiadomości.' });
          return;
        }
        setFlash({
          kind: 'success',
          message: 'Wiadomość wysłana. Szkoła odpowie w module Wiadomości w portalu.',
        });
        refreshMessagesUnreadCount();
      } catch (err) {
        console.error('Send contact message error:', err);
        setFlash({ kind: 'error', message: 'Nie udało się wysłać wiadomości.' });
      } finally {
        setSendingContactMessageId(null);
      }
    },
    [
      contactMessages,
      contactSubjects,
      loadSchoolRecipients,
      refreshMessagesUnreadCount,
      schoolRecipientIds,
    ],
  );

  const renderEnrollmentStepContent = () => {
    const currentStep = enrollmentSteps[selectedStepIndex];
    const isReadOnlyPreview = selectedStepIndex < currentStepIndex;

    if (currentStep.key === 'pending') {
      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Zgłoszenie</h3>
          {enrollmentRequestSummary ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-base font-semibold text-zinc-900">Dane rodzica</p>
                <div className="mt-2 grid gap-1.5 text-sm text-zinc-800 sm:grid-cols-[max-content_1fr]">
                  <span className="font-semibold text-zinc-900">Imię:</span>
                  <span>{enrollmentRequestSummary.parentFirstName}</span>
                  <span className="font-semibold text-zinc-900">Nazwisko:</span>
                  <span>{enrollmentRequestSummary.parentLastName}</span>
                  <span className="font-semibold text-zinc-900">Email:</span>
                  <span>{enrollmentRequestSummary.parentEmail}</span>
                  <span className="font-semibold text-zinc-900">Telefon:</span>
                  <span>{enrollmentRequestSummary.parentPhone ?? '— (nie podano)'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-base font-semibold text-zinc-900">Lista dzieci</p>
                {enrollmentRequestSummary.children.map((child, index) => (
                  <div key={child.requestId} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <p className="text-base font-semibold text-zinc-900">Dziecko {index + 1}</p>
                    <div className="mt-2 grid gap-1.5 text-sm text-zinc-800 sm:grid-cols-[max-content_1fr]">
                      <span className="font-semibold text-zinc-900">Imię:</span>
                      <span>{child.firstName}</span>
                      <span className="font-semibold text-zinc-900">Nazwisko:</span>
                      <span>{child.lastName}</span>
                      <span className="font-semibold text-zinc-900">Data urodzenia:</span>
                      <span>
                        {new Date(child.birthDate).toLocaleDateString('pl-PL', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                      <span className="font-semibold text-zinc-900">Preferowana lokalizacja:</span>
                      <span>{child.preferredLocation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState message="Brak szczegółów zgłoszenia (dziecko, lokalizacja, data zgłoszenia)." />
          )}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Zgłoszenie dotarło do szkoły. Czekamy na propozycję grupy.
          </div>
        </section>
      );
    }

    if (currentStep.key === 'proposed') {
      const anyActionInFlight =
        acceptingId != null || negotiatingId != null || sendingContactMessageId != null;
      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Propozycja grupy</h3>
          {isReadOnlyPreview && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Podgląd wcześniejszego etapu. Zmiany są zablokowane.
            </div>
          )}

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
                  Mamy propozycje dla {proposals.length} dzieci. Każde dziecko ma jedną przypisaną
                  grupę — zaakceptuj propozycję, aby przejść dalej w procesie zapisu.
                </p>
              )}
              {proposals.some((p) => childAccessLevel(p) === 'PROPOSED') && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Szkoła przygotowała propozycję grupy dla{' '}
                  {proposals.length > 1 ? 'każdego dziecka' : 'Twojego dziecka'}. Zaakceptuj ją, aby
                  przejść do uzupełnienia danych do umowy.
                </p>
              )}
              {proposals.map((p) => {
                const isAccepting = acceptingId === p.request_id;
                const isContactStarting = negotiatingId === p.request_id;
                const isSendingMessage = sendingContactMessageId === p.request_id;
                const level = childAccessLevel(p);
                const isActionable = level === 'PROPOSED';
                const isNegotiating = level === 'NEGOTIATING';
                const showContactForm =
                  contactOpenFor[p.request_id] === true || isNegotiating;
                const buttonsDisabled = anyActionInFlight || isReadOnlyPreview;
                const contactSubject = contactSubjects[p.request_id] ?? '';
                const contactMessage = contactMessages[p.request_id] ?? '';
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
                          level === 'PROPOSED'
                            ? 'bg-sky-100 text-sky-800'
                            : level === 'NEGOTIATING'
                              ? 'bg-amber-100 text-amber-900'
                              : level === 'ACCEPTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-emerald-200 text-emerald-900'
                        }`}
                      >
                        {level === 'PROPOSED'
                          ? 'Do decyzji'
                          : level === 'NEGOTIATING'
                            ? 'Kontakt ze szkołą'
                            : level === 'ACCEPTED'
                              ? 'Zaakceptowana — uzupełnij dane do umowy'
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

                    {isActionable && (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm text-zinc-600">
                          W niektórych sytuacjach możliwa jest zmiana terminu zajęć — wymaga to
                          kontaktu ze szkołą.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleAcceptProposal(p.request_id)}
                            disabled={buttonsDisabled}
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isAccepting ? 'Akceptowanie…' : 'Akceptuję propozycję'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleContactSchool(p)}
                            disabled={buttonsDisabled}
                            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isContactStarting ? 'Przygotowanie…' : 'Kontakt ze szkołą'}
                          </button>
                        </div>
                      </div>
                    )}

                    {showContactForm && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
                        {isNegotiating && (
                          <p className="text-sm text-amber-900">
                            Status zgłoszenia: kontakt ze szkołą. Wyślij wiadomość poniżej — odpowiedź
                            znajdziesz też w zakładce Wiadomości.
                          </p>
                        )}
                        <p className="text-sm font-medium text-zinc-800">
                          Wiadomość do szkoły
                        </p>
                        <p className="text-sm text-zinc-600">
                          Opisz swoją sytuację — odpowiedź otrzymasz w zakładce Wiadomości w portalu.
                        </p>
                        <label
                          htmlFor={`contact-subject-${p.request_id}`}
                          className="text-sm font-medium text-zinc-800"
                        >
                          Temat
                        </label>
                        <input
                          id={`contact-subject-${p.request_id}`}
                          type="text"
                          value={contactSubject}
                          onChange={(event) =>
                            setContactSubjects((prev) => ({
                              ...prev,
                              [p.request_id]: event.target.value,
                            }))
                          }
                          maxLength={255}
                          disabled={isReadOnlyPreview}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
                        />
                        <label
                          htmlFor={`contact-message-${p.request_id}`}
                          className="text-sm font-medium text-zinc-800"
                        >
                          Treść
                        </label>
                        <textarea
                          id={`contact-message-${p.request_id}`}
                          value={contactMessage}
                          onChange={(event) =>
                            setContactMessages((prev) => ({
                              ...prev,
                              [p.request_id]: event.target.value,
                            }))
                          }
                          maxLength={5000}
                          disabled={isReadOnlyPreview}
                          className="min-h-32 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendContactMessage(p.request_id)}
                          disabled={buttonsDisabled || isReadOnlyPreview}
                          className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSendingMessage ? 'Wysyłanie…' : 'Wyślij wiadomość'}
                        </button>
                      </div>
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
      const acceptedProposals = proposals.filter((p) => childAccessLevel(p) === 'ACCEPTED');

      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Umowa</h3>
          {isReadOnlyPreview && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Podgląd wcześniejszego etapu. Zmiany są zablokowane.
            </div>
          )}
          <p className="text-sm text-zinc-600">
            Uzupełnij dane potrzebne do przygotowania umowy. Każde dziecko ma osobną umowę —
            wypełnij formularz i zapisz dane dla każdego dziecka z osobna.
          </p>

          {proposalsLoading && acceptedProposals.length === 0 ? (
            <EmptyState message="Ładujemy dane umowy…" />
          ) : acceptedProposals.length === 0 ? (
            <EmptyState message="Brak dzieci oczekujących na uzupełnienie danych do umowy." />
          ) : (
            <div className="space-y-6">
              {acceptedProposals.map((p) => {
                const childId = p.child_id ?? p.request_id;
                const paymentType =
                  paymentTypeByChild[childId] ??
                  (p.contract?.payment_type === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
                const displayAmount = resolveContractAmount(p, paymentType);
                const generated = generatedContracts[childId];
                const includeAttachment2 =
                  includeAttachment2ByChild[childId] ?? p.contract?.include_attachment_2 ?? false;
                const sentContract =
                  generated ??
                  (p.contract?.status === 'SENT' && p.contract.content_html
                    ? {
                        id: p.contract.id,
                        content_html: p.contract.content_html,
                        attachment_1_html: p.contract.attachment_1_html,
                        attachment_2_html: p.contract.attachment_2_html,
                        status: p.contract.status,
                      }
                    : null);
                const isSaving = savingContractChildId === childId;

                return (
                  <div
                    key={p.request_id}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4"
                  >
                    <p className="text-base font-semibold text-zinc-900">
                      {p.child_first_name} {p.child_last_name}
                      {p.group_name ? (
                        <span className="ml-2 text-sm font-normal text-zinc-600">
                          · {p.group_name}
                        </span>
                      ) : null}
                    </p>

                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Imię</label>
                            <input
                              type="text"
                              readOnly
                              value={userInfo.firstName}
                              className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Nazwisko</label>
                            <input
                              type="text"
                              readOnly
                              value={userInfo.lastName}
                              className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">E-mail</label>
                            <input
                              type="email"
                              readOnly
                              value={userInfo.email}
                              className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Telefon</label>
                            <input
                              type="text"
                              readOnly
                              value={
                                userInfo.phone?.trim() ||
                                enrollmentRequestSummary?.parentPhone?.trim() ||
                                '—'
                              }
                              className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-700"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium text-zinc-800">Adres</label>
                            <input
                              type="text"
                              disabled={isReadOnlyPreview}
                              value={contractProfile.address}
                              onChange={(e) =>
                                setContractProfile((prev) => ({ ...prev, address: e.target.value }))
                              }
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Miasto</label>
                            <input
                              type="text"
                              disabled={isReadOnlyPreview}
                              value={contractProfile.city}
                              onChange={(e) =>
                                setContractProfile((prev) => ({ ...prev, city: e.target.value }))
                              }
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
                            <input
                              type="text"
                              disabled={isReadOnlyPreview}
                              value={contractProfile.zipCode}
                              onChange={(e) =>
                                setContractProfile((prev) => ({ ...prev, zipCode: e.target.value }))
                              }
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-800">Rozliczenie</p>
                          <div className="flex flex-wrap gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name={`billingType-${childId}`}
                                className="accent-[#0f6e56]"
                                disabled={isReadOnlyPreview}
                                checked={contractProfile.billingType === 'private'}
                                onChange={() =>
                                  setContractProfile((prev) => ({ ...prev, billingType: 'private' }))
                                }
                              />
                              Osoba prywatna (PESEL)
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name={`billingType-${childId}`}
                                className="accent-[#0f6e56]"
                                disabled={isReadOnlyPreview}
                                checked={contractProfile.billingType === 'company'}
                                onChange={() =>
                                  setContractProfile((prev) => ({ ...prev, billingType: 'company' }))
                                }
                              />
                              Firma (faktura)
                            </label>
                          </div>
                        </div>

                        {contractProfile.billingType === 'private' ? (
                          <div className="space-y-1 max-w-sm">
                            <label className="text-sm font-medium text-zinc-800">PESEL</label>
                            <input
                              type="text"
                              maxLength={11}
                              disabled={isReadOnlyPreview}
                              value={contractProfile.pesel}
                              onChange={(e) =>
                                setContractProfile((prev) => ({ ...prev, pesel: e.target.value }))
                              }
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                        ) : (
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-zinc-800">Nazwa firmy</label>
                              <input
                                type="text"
                                disabled={isReadOnlyPreview}
                                value={contractProfile.companyName}
                                onChange={(e) =>
                                  setContractProfile((prev) => ({
                                    ...prev,
                                    companyName: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-medium text-zinc-800">NIP</label>
                              <input
                                type="text"
                                disabled={isReadOnlyPreview}
                                value={contractProfile.nip}
                                onChange={(e) =>
                                  setContractProfile((prev) => ({ ...prev, nip: e.target.value }))
                                }
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-800">Sposób rozliczeń</p>
                          <div className="flex flex-wrap gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name={`paymentType-${childId}`}
                                className="accent-[#0f6e56]"
                                disabled={isReadOnlyPreview}
                                checked={paymentType === 'MONTHLY'}
                                onChange={() =>
                                  setPaymentTypeByChild((prev) => ({
                                    ...prev,
                                    [childId]: 'MONTHLY',
                                  }))
                                }
                              />
                              Miesięczny
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name={`paymentType-${childId}`}
                                className="accent-[#0f6e56]"
                                disabled={isReadOnlyPreview}
                                checked={paymentType === 'YEARLY'}
                                onChange={() =>
                                  setPaymentTypeByChild((prev) => ({
                                    ...prev,
                                    [childId]: 'YEARLY',
                                  }))
                                }
                              />
                              Roczny
                            </label>
                          </div>
                          <p className="text-sm text-zinc-700">
                            Kwota:{' '}
                            <span className="font-semibold text-zinc-900">
                              {formatPlnAmount(displayAmount)}
                            </span>
                            {p.contract?.price_override ? (
                              <span className="ml-1 text-xs text-zinc-500">(ustalona przez szkołę)</span>
                            ) : null}
                          </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-[#0f6e56]"
                              disabled={isReadOnlyPreview}
                              checked={includeAttachment2}
                              onChange={(e) =>
                                setIncludeAttachment2ByChild((prev) => ({
                                  ...prev,
                                  [childId]: e.target.checked,
                                }))
                              }
                            />
                            <span className="text-sm text-zinc-800">
                              Zajęcia Harry English odbywają się bezpośrednio po zajęciach
                              szkolnych/przedszkolnych — wygeneruj{' '}
                              <strong>Załącznik nr 2</strong> (upoważnienie lektora do odbioru
                              dziecka).
                            </span>
                          </label>
                        </div>

                        {!isReadOnlyPreview && (
                          <button
                            type="button"
                            disabled={isSaving || !profileLoaded}
                            onClick={() => void handleSaveContractData(childId, p.request_id)}
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving
                              ? 'Zapisywanie…'
                              : sentContract
                                ? 'Wygeneruj ponownie'
                                : 'Zapisz i wygeneruj umowę'}
                          </button>
                        )}

                        {sentContract ? (
                          <div className="space-y-4 border-t border-emerald-200 pt-4">
                            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                              Umowa i załączniki zostały wygenerowane. Zapoznaj się z treścią poniżej
                              i podpisz dokumenty.
                            </div>
                            <ContractPortal
                              contract={sentContract}
                              onSigned={async () => {
                                setFlash({
                                  kind: 'success',
                                  message: 'Umowa podpisana. Dziękujemy!',
                                });
                                await loadProposals();
                                await refreshUserAccessLevel();
                              }}
                            />
                          </div>
                        ) : null}
                    </div>
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
            const isSelected = index === selectedStepIndex;
            const isAvailable = index <= currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isAvailable) return;
                    setManualStepSelection(true);
                    setSelectedStepIndex(index);
                  }}
                  disabled={!isAvailable}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                    isSelected
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
    <MessagesPanel
      mode="parent"
      currentUserId={userInfo.id}
      listResetToken={messagesListResetToken}
      onInboxChange={refreshMessagesUnreadCount}
    />
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
      <RenewalsBanner onFlash={setFlash} onUpdated={refreshUserAccessLevel} />
      <div className="rounded-3xl border border-emerald-100 bg-white">
        <nav className="no-scrollbar overflow-x-auto border-b border-emerald-100">
          <div className="flex min-w-max gap-2 p-2">
            {topTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (tab.key === 'messages' && activeTab === 'messages') {
                    setMessagesListResetToken((t) => t + 1);
                  }
                  setActiveTab(tab.key);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-transparent bg-emerald-50/60 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                {tab.key === 'messages' ? (
                  <MessagesTabLabel
                    label={tab.label}
                    unreadCount={messagesUnreadCount}
                    isActive={activeTab === 'messages'}
                  />
                ) : (
                  tab.label
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {renderContent()}
    </div>
  );
}
