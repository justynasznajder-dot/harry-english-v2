'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ContractPortal from '@/src/components/ContractPortal';
import RenewalParentFlowSection from '@/src/components/parent/RenewalParentFlowSection';
import { computeContractPreviewAmount, type ContractPricingContext } from '@/lib/contract-pricing-preview';
import { resolveChildBaseAmount, sumChildrenBaseAmounts } from '@/lib/enrollment-pricing';
import { resolveLessonUnitPrice } from '@/lib/lesson-pricing';
import { paymentTypePeriodLabel, paymentTypeShortLabel } from '@/lib/payment-labels';
import { validateParentContractProfileInput } from '@/lib/parent-contract-profile';

type ChildEnrollmentLevel = 'NEW' | 'PROPOSED' | 'NEGOTIATING' | 'ACCEPTED' | 'SIGNED' | 'COMPLETED' | 'REJECTED';

export interface UserInfo {
  id: string;
  email: string;
  phone?: string | null;
  firstName: string;
  lastName: string;
  accessLevel?: 'PENDING' | 'ACTIVE';
  complimentaryAccess?: boolean;
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
interface EnrollmentProposal {
  child_id?: string;
  request_id: string;
  access_level: ChildEnrollmentLevel;
  child_first_name: string;
  child_last_name: string;
  group_name: string | null;
  location_name: string;
  schedule: string;
  proposed_at?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
  price_per_lesson?: number | null;
  lesson_unit_price?: number | null;
  monthly_unit_price?: number | null;
  yearly_unit_price?: number | null;
}

interface ParentContractDocument {
  id: string;
  status: string;
  content_html: string | null;
  child_attachments: Array<{
    child_id: string;
    request_id?: string;
    first_name: string;
    last_name: string;
    attachment_1_html: string | null;
    attachment_2_html: string | null;
  }>;
  include_attachment_2?: boolean;
  payment_type?: string | null;
  amount?: number | null;
  signed_at?: string | null;
  included_children?: Array<{
    child_id: string;
    request_id: string;
    first_name: string;
    last_name: string;
  }>;
}

interface ContractReadiness {
  hasPendingDecisions: boolean;
  allDecisionsResolved: boolean;
  acceptedCount: number;
  rejectedCount: number;
  canPrepareContract: boolean;
  complimentaryEnrollment?: boolean;
}

type ContractPricing = ContractPricingContext;

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

function validateContractProfile(profile: ParentProfileForm): string | null {
  return validateParentContractProfileInput({
    billingType: profile.billingType,
    address: profile.address,
    city: profile.city,
    zipCode: profile.zipCode,
    pesel: profile.pesel,
    companyName: profile.companyName,
    nip: profile.nip,
  });
}

function resolveProposalLessonUnitPrice(p: EnrollmentProposal): number | null {
  return resolveLessonUnitPrice({
    groupPricePerLesson: p.price_per_lesson,
    enrollmentOverride: p.lesson_unit_price,
  });
}

function sumIncludedProposalAmounts(
  proposals: EnrollmentProposal[],
  includedRequestIds: Set<string>,
  paymentType: 'MONTHLY' | 'YEARLY' | 'PER_LESSON',
): number | null {
  if (paymentType === 'PER_LESSON') {
    const included = proposals.filter((p) => includedRequestIds.has(p.request_id));
    if (included.length === 0) return null;
    for (const p of included) {
      const price = resolveProposalLessonUnitPrice(p);
      if (price == null || price <= 0) return null;
    }
    return 0;
  }
  return sumChildrenBaseAmounts(
    proposals.filter((p) => includedRequestIds.has(p.request_id)),
    paymentType,
  );
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
  return p.access_level ?? 'NEW';
}

function sortProposalsByStableOrder(
  proposals: EnrollmentProposal[],
  order: string[],
): EnrollmentProposal[] {
  if (order.length === 0) return proposals;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...proposals].sort((a, b) => {
    const rankA = rank.get(a.request_id);
    const rankB = rank.get(b.request_id);
    if (rankA != null && rankB != null) return rankA - rankB;
    if (rankA != null) return -1;
    if (rankB != null) return 1;
    return a.request_id.localeCompare(b.request_id);
  });
}

function getEnrollmentStepsForUser(complimentaryAccess?: boolean): EnrollmentStep[] {
  if (complimentaryAccess) {
    return enrollmentSteps.filter((step) => step.key !== 'contractSent');
  }
  return enrollmentSteps;
}

function deriveEnrollmentStepIndex(
  proposals: EnrollmentProposal[],
  children: UserInfo['children'],
  accountAccessLevel: UserInfo['accessLevel'],
  complimentaryAccess?: boolean,
  contractReadiness?: Pick<
    ContractReadiness,
    'hasPendingDecisions' | 'allDecisionsResolved' | 'canPrepareContract'
  >
): number {
  const levels = [
    ...proposals.map((p) => childAccessLevel(p)),
    ...(children ?? [])
      .filter((c) => c.active !== false)
      .map((c) => c.accessLevel)
      .filter((v): v is ChildEnrollmentLevel => Boolean(v)),
  ];

  const steps = getEnrollmentStepsForUser(complimentaryAccess);
  const summaryIndex = steps.length - 1;
  const proposedIndex = steps.findIndex((s) => s.key === 'proposed');
  const contractIndex = steps.findIndex((s) => s.key === 'contractSent');

  const hasPendingDecisions =
    contractReadiness?.hasPendingDecisions ??
    levels.some((s) => s === 'PROPOSED' || s === 'NEGOTIATING' || s === 'NEW');

  if (levels.some((s) => s === 'COMPLETED') || accountAccessLevel === 'ACTIVE') {
    return summaryIndex;
  }

  if (complimentaryAccess) {
    if (hasPendingDecisions) {
      return proposedIndex >= 0 ? proposedIndex : 0;
    }
    if (levels.some((s) => s === 'COMPLETED')) {
      return summaryIndex;
    }
    return proposedIndex >= 0 ? proposedIndex : 0;
  }

  if (levels.some((s) => s === 'SIGNED')) {
    return contractIndex >= 0 ? contractIndex : summaryIndex;
  }

  if (contractReadiness?.canPrepareContract) {
    return contractIndex >= 0 ? contractIndex : summaryIndex;
  }

  if (
    hasPendingDecisions ||
    levels.some((s) => s === 'PROPOSED' || s === 'NEGOTIATING' || s === 'ACCEPTED')
  ) {
    return proposedIndex >= 0 ? proposedIndex : 0;
  }

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
export interface EnrollmentParentFlowProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updated: UserInfo) => void;
}

export default function EnrollmentParentFlow({
  userInfo,
  onUserInfoUpdate,
}: EnrollmentParentFlowProps) {
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
  const [cancellingContactId, setCancellingContactId] = useState<string | null>(null);
  const enrollmentActionBusyRef = useRef(false);
  const proposalOrderRef = useRef<string[]>([]);
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
  const [paymentType, setPaymentType] = useState<'MONTHLY' | 'YEARLY' | 'PER_LESSON'>('MONTHLY');
  const [savingContract, setSavingContract] = useState(false);
  const [parentContract, setParentContract] = useState<ParentContractDocument | null>(null);
  const [contractReadiness, setContractReadiness] = useState<ContractReadiness>({
    hasPendingDecisions: true,
    allDecisionsResolved: false,
    acceptedCount: 0,
    rejectedCount: 0,
    canPrepareContract: false,
  });
  const [contractPricing, setContractPricing] = useState<ContractPricing | null>(null);
  const [includedInContract, setIncludedInContract] = useState<Record<string, boolean>>({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [profileLocked, setProfileLocked] = useState(false);
  const [savingContractProfile, setSavingContractProfile] = useState(false);
  const enrollmentStepsForUser = getEnrollmentStepsForUser(userInfo.complimentaryAccess);
  const currentStepIndex = deriveEnrollmentStepIndex(
    proposals,
    userInfo.children,
    userInfo.accessLevel,
    userInfo.complimentaryAccess,
    contractReadiness
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
        parentContract?: ParentContractDocument | null;
        contractReadiness?: ContractReadiness;
        contractPricing?: ContractPricing | null;
        enrollmentRequestSummary?: EnrollmentRequestSummary | null;
      };
      const incoming = Array.isArray(data.proposals) ? data.proposals : [];
      if (proposalOrderRef.current.length === 0) {
        proposalOrderRef.current = incoming.map((p) => p.request_id);
      } else {
        const known = new Set(proposalOrderRef.current);
        for (const proposal of incoming) {
          if (!known.has(proposal.request_id)) {
            proposalOrderRef.current.push(proposal.request_id);
          }
        }
        const incomingIds = new Set(incoming.map((p) => p.request_id));
        proposalOrderRef.current = proposalOrderRef.current.filter((id) => incomingIds.has(id));
      }
      setProposals(sortProposalsByStableOrder(incoming, proposalOrderRef.current));
      setParentContract(data.parentContract ?? null);
      setContractPricing(data.contractPricing ?? null);
      setContractReadiness(
        data.contractReadiness ?? {
          hasPendingDecisions: true,
          allDecisionsResolved: false,
          acceptedCount: 0,
          rejectedCount: 0,
          canPrepareContract: false,
        },
      );
      if (data.parentContract?.payment_type === 'YEARLY') {
        setPaymentType('YEARLY');
      } else if (data.parentContract?.payment_type === 'PER_LESSON') {
        setPaymentType('PER_LESSON');
      }
      setIncludedInContract((prev) => {
        const next = { ...prev };
        for (const p of incoming) {
          const level = childAccessLevel(p);
          if (next[p.request_id] === undefined) {
            next[p.request_id] = level === 'ACCEPTED';
          }
        }
        if (data.parentContract?.included_children?.length) {
          for (const p of incoming) {
            next[p.request_id] =
              data.parentContract!.included_children!.some(
                (c) => c.request_id === p.request_id,
              ) ?? false;
          }
        }
        return next;
      });
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

  const loadParentProfile = useCallback(async () => {
    try {
      const r = await fetch('/api/user/profile', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return;
      const data = (await r.json()) as {
        profile?: {
          address?: string | null;
          city?: string | null;
          zipCode?: string | null;
          billingType?: 'private' | 'company';
          companyName?: string | null;
          nip?: string | null;
          pesel?: string | null;
          complete?: boolean;
        } | null;
        profileLocked?: boolean;
      };
      const p = data.profile;
      setProfileLocked(Boolean(data.profileLocked));
      if (!p) {
        setProfileComplete(false);
        setProfileLoaded(true);
        return;
      }
      setContractProfile((prev) => ({
        address: p.address ?? prev.address,
        city: p.city ?? prev.city,
        zipCode: p.zipCode ?? prev.zipCode,
        billingType: p.billingType ?? (p.companyName || p.nip ? 'company' : 'private'),
        pesel: p.pesel ?? prev.pesel,
        companyName: p.companyName ?? prev.companyName,
        nip: p.nip ?? prev.nip,
      }));
      setProfileComplete(Boolean(p.complete));
      setProfileLoaded(true);
    } catch (err) {
      console.error('Nie udało się pobrać profilu rodzica', err);
      setProfileLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadParentProfile();
  }, [loadParentProfile]);

  const handleSaveContractProfile = useCallback(async () => {
    if (profileLocked) {
      setFlash({
        kind: 'error',
        message:
          'Nie można zmienić danych — umowa została już wygenerowana.',
      });
      return;
    }
    const validationError = validateContractProfile(contractProfile);
    if (validationError) {
      setFlash({ kind: 'error', message: validationError });
      return;
    }
    setSavingContractProfile(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
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
        profile?: { complete?: boolean };
      };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zapisać danych do umowy' });
        return;
      }
      setProfileComplete(Boolean(data.profile?.complete));
      setFlash({
        kind: 'success',
        message:
          'Wspólne dane do umowy zostały zapisane. Teraz wybierz dzieci i wygeneruj umowę.',
      });
    } catch {
      setFlash({ kind: 'error', message: 'Nie udało się zapisać danych do umowy' });
    } finally {
      setSavingContractProfile(false);
    }
  }, [contractProfile, profileLocked]);

  const handleGenerateParentContract = useCallback(async () => {
    if (!profileComplete) {
      setFlash({
        kind: 'error',
        message: 'Najpierw zapisz wspólne dane do umowy powyżej.',
      });
      return;
    }
    if (!contractReadiness.canPrepareContract) {
      setFlash({
        kind: 'error',
        message:
          'Umowę można wygenerować dopiero gdy wszystkie dzieci mają rozstrzygniętą propozycję grupy.',
      });
      return;
    }

    const includedRequestIds = proposals
      .filter(
        (p) =>
          childAccessLevel(p) === 'ACCEPTED' && includedInContract[p.request_id] !== false,
      )
      .map((p) => p.request_id);

    if (includedRequestIds.length === 0) {
      setFlash({ kind: 'error', message: 'Wybierz co najmniej jedno dziecko do umowy.' });
      return;
    }

    const includedSet = new Set(includedRequestIds);
    const baseTotal = sumIncludedProposalAmounts(proposals, includedSet, paymentType);
    if (baseTotal == null) {
      setFlash({
        kind: 'error',
        message:
          'Brak stawki dla wybranych dzieci — skontaktuj się ze szkołą, aby ustalić kwotę w umowie.',
      });
      return;
    }

    setSavingContract(true);
    try {
      const r = await fetch('/api/parent/contract/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          includedRequestIds,
          paymentType,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        message?: string;
        contract?: {
          id: string;
          content_html: string;
          child_attachments: ParentContractDocument['child_attachments'];
          status: string;
        };
      };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się wygenerować umowy' });
        return;
      }
      setFlash({
        kind: 'success',
        message:
          'Umowa wygenerowana. Zapoznaj się z umową, następnie z załącznikami dla każdego dziecka, a na końcu podpisz wszystkie dokumenty.',
      });
      setProfileLocked(true);
      await Promise.all([loadProposals(), loadParentProfile()]);
    } catch {
      setFlash({ kind: 'error', message: 'Nie udało się wygenerować umowy' });
    } finally {
      setSavingContract(false);
    }
  }, [
    contractReadiness.canPrepareContract,
    includedInContract,
    loadParentProfile,
    loadProposals,
    paymentType,
    profileComplete,
    proposals,
  ]);

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
          complimentaryEnrollment?: boolean;
        };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data?.message ?? 'Nie udało się zaakceptować propozycji.' });
          return;
        }
        setFlash({
          kind: 'success',
          message:
            data.message ??
            ((data.remainingProposed ?? 0) > 0
              ? 'Propozycja zaakceptowana — uzupełnij dane do umowy dla tego dziecka. Pozostałe propozycje czekają na decyzję.'
              : 'Propozycja zaakceptowana — przejdź do uzupełnienia danych do umowy.'),
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
            'Proszę o informację czy jest możliwe zapisanie dziecka na zajęcia w innym terminie',
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

  const handleCancelContact = useCallback(
    async (requestId: string) => {
      if (enrollmentActionBusyRef.current) {
        setFlash({
          kind: 'info',
          message: 'Trwa już inna akcja — poczekaj chwilę i spróbuj ponownie.',
        });
        return;
      }
      enrollmentActionBusyRef.current = true;
      setCancellingContactId(requestId);
      try {
        const r = await fetch('/api/enrollment/negotiate', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId }),
          credentials: 'include',
        });
        const data = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) {
          setFlash({
            kind: 'error',
            message: data?.message ?? 'Nie udało się anulować kontaktu ze szkołą.',
          });
          return;
        }
        setContactOpenFor((prev) => ({ ...prev, [requestId]: false }));
        setFlash({
          kind: 'success',
          message: data?.message ?? 'Anulowano kontakt ze szkołą.',
        });
        await Promise.all([loadProposals(), refreshUserAccessLevel()]);
      } catch (err) {
        console.error('Cancel contact error:', err);
        setFlash({ kind: 'error', message: 'Nie udało się anulować kontaktu ze szkołą.' });
      } finally {
        enrollmentActionBusyRef.current = false;
        setCancellingContactId(null);
      }
    },
    [loadProposals, refreshUserAccessLevel],
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
          message:
            'Wiadomość wysłana. Oczekuj na kontakt ze strony szkoły — gdy pojawi się nowa propozycja grupy, damy Ci znać w portalu i mailu.',
        });
        setContactOpenFor((prev) => ({ ...prev, [requestId]: false }));
        
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
      schoolRecipientIds,
    ],
  );

  const renderEnrollmentStepContent = () => {
    const currentStep = enrollmentStepsForUser[selectedStepIndex];
    const hasPendingProposalDecisions = proposals.some((p) => {
      const level = childAccessLevel(p);
      return level === 'PROPOSED' || level === 'NEGOTIATING';
    });
    const isReadOnlyPreview =
      selectedStepIndex < currentStepIndex &&
      !(currentStep.key === 'proposed' && hasPendingProposalDecisions);

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
        </section>
      );
    }

    if (currentStep.key === 'proposed') {
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
                  {userInfo.complimentaryAccess
                    ? ' zakończyć zapis (tryb bez opłat — bez umowy).'
                    : ' przejść dalej w procesie zapisu.'}
                  {!userInfo.complimentaryAccess &&
                    proposals.some((p) => childAccessLevel(p) === 'ACCEPTED') &&
                    contractReadiness.hasPendingDecisions && (
                      <>
                        {' '}
                        Część dzieci ma już zaakceptowaną propozycję — krok „Umowa” odblokuje się,
                        gdy wszystkie dzieci będą zaakceptowane.
                      </>
                    )}
                </p>
              )}
              {!userInfo.complimentaryAccess &&
                contractReadiness.allDecisionsResolved &&
                contractReadiness.acceptedCount === 0 && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    Wszystkie zgłoszenia zostały odrzucone — umowa nie jest wymagana.
                  </p>
                )}
              {proposals.map((p) => {
                const isAccepting = acceptingId === p.request_id;
                const isContactStarting = negotiatingId === p.request_id;
                const isSendingMessage = sendingContactMessageId === p.request_id;
                const isCancellingContact = cancellingContactId === p.request_id;
                const level = childAccessLevel(p);
                const isActionable = level === 'PROPOSED';
                const isNegotiating = level === 'NEGOTIATING';
                const showContactForm = contactOpenFor[p.request_id] === true;
                const thisChildBusy =
                  isAccepting ||
                  isContactStarting ||
                  isSendingMessage ||
                  isCancellingContact;
                const buttonsDisabled = thisChildBusy || isReadOnlyPreview;
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
                                : level === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-200 text-emerald-900'
                        }`}
                      >
                        {level === 'PROPOSED'
                          ? 'Do decyzji'
                          : level === 'NEGOTIATING'
                            ? 'Oczekiwanie na szkołę'
                            : level === 'ACCEPTED'
                              ? userInfo.complimentaryAccess
                                ? 'Zaakceptowana'
                                : 'Zaakceptowana'
                              : level === 'REJECTED'
                                ? 'Odrzucone przez szkołę'
                              : level === 'COMPLETED'
                                ? 'Zapis zakończony'
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

                    {isNegotiating && !showContactForm && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        <p className="font-semibold">Oczekuj na kontakt ze szkoły</p>
                        <p className="mt-1 text-amber-900">
                          Twoja wiadomość została przekazana. Szkoła skontaktuje się z Tobą
                          telefonicznie albo przez moduł wiadomości. Gdy szkoła przygotuje nową
                          propozycję grupy, pojawi się ona tutaj.
                        </p>
                      </div>
                    )}

                    {showContactForm && (
                      <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleSendContactMessage(p.request_id)}
                            disabled={
                              buttonsDisabled || isReadOnlyPreview || isCancellingContact
                            }
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSendingMessage ? 'Wysyłanie…' : 'Wyślij wiadomość'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelContact(p.request_id)}
                            disabled={
                              buttonsDisabled || isReadOnlyPreview || isSendingMessage
                            }
                            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isCancellingContact ? 'Anulowanie…' : 'Anuluj'}
                          </button>
                        </div>
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
      const includedRequestIds = new Set(
        proposals
          .filter(
            (p) =>
              childAccessLevel(p) === 'ACCEPTED' && includedInContract[p.request_id] !== false,
          )
          .map((p) => p.request_id),
      );
      const includedCount = includedRequestIds.size;
      const includedProposals = proposals.filter((p) => includedRequestIds.has(p.request_id));
      const childAmountBreakdown = includedProposals.map((p) => ({
        requestId: p.request_id,
        name: `${p.child_first_name} ${p.child_last_name}`.trim(),
        groupName: p.group_name,
        amount:
          paymentType === 'PER_LESSON'
            ? resolveProposalLessonUnitPrice(p)
            : resolveChildBaseAmount(p, paymentType),
      }));
      const baseTotal = sumIncludedProposalAmounts(proposals, includedRequestIds, paymentType);
      const pricingPreview = computeContractPreviewAmount(
        paymentType === 'PER_LESSON' ? null : baseTotal,
        includedCount,
        contractPricing,
      );
      const paymentTypeLabel = paymentTypePeriodLabel(paymentType);
      const canGenerateContract =
        paymentType === 'PER_LESSON' ? baseTotal != null : baseTotal != null;
      const contractPreview =
        parentContract?.content_html &&
        (parentContract.status === 'SENT' || parentContract.status === 'SIGNED')
          ? {
              id: parentContract.id,
              content_html: parentContract.content_html,
              child_attachments: parentContract.child_attachments ?? [],
              status: parentContract.status,
              signed_at: parentContract.signed_at ?? null,
            }
          : null;
      const isContractSigned = parentContract?.status === 'SIGNED';
      const commonProfileLocked = profileLocked || isReadOnlyPreview || isContractSigned;
      const formLocked = isReadOnlyPreview || isContractSigned || !contractReadiness.canPrepareContract;

      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Umowa</h3>
          {isReadOnlyPreview && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Podgląd wcześniejszego etapu. Zmiany są zablokowane.
            </div>
          )}
          <p className="text-sm text-zinc-600">
            Jedna umowa obejmuje wybrane dzieci. Wygeneruj ją dopiero gdy każde dziecko ma status
            zaakceptowane lub odrzucone — w umowie zaznacz tylko te zaakceptowane.
          </p>
          {contractReadiness.hasPendingDecisions && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Część dzieci wciąż czeka na decyzję w kroku <strong>Propozycja grupy</strong>. Umowę
              wygenerujesz, gdy wszystkie dzieci będą zaakceptowane lub odrzucone przez szkołę.
            </div>
          )}
          {contractReadiness.allDecisionsResolved && contractReadiness.acceptedCount === 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              Wszystkie zgłoszenia zostały odrzucone — umowa nie jest wymagana.
            </div>
          )}

          {proposalsLoading && proposals.length === 0 ? (
            <EmptyState message="Ładujemy dane umowy…" />
          ) : proposals.length === 0 ? (
            <EmptyState message="Brak dzieci w procesie zapisu." />
          ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">Dane rodzica do umowy</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Te informacje zostaną użyte w jednej wspólnej umowie.
                      </p>
                    </div>
                    {profileLocked && (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
                        Dane są zablokowane — umowa została już wygenerowana.
                      </div>
                    )}
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
                          disabled={commonProfileLocked}
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
                          disabled={commonProfileLocked}
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
                          disabled={commonProfileLocked}
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
                            name="billingType-shared"
                            className="accent-[#0f6e56]"
                            disabled={commonProfileLocked}
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
                            name="billingType-shared"
                            className="accent-[#0f6e56]"
                            disabled={commonProfileLocked}
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
                          disabled={commonProfileLocked}
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
                            disabled={commonProfileLocked}
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
                            disabled={commonProfileLocked}
                            value={contractProfile.nip}
                            onChange={(e) =>
                              setContractProfile((prev) => ({ ...prev, nip: e.target.value }))
                            }
                            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                          />
                        </div>
                      </div>
                    )}

                    {!commonProfileLocked && (
                      <button
                        type="button"
                        disabled={savingContractProfile}
                        onClick={() => void handleSaveContractProfile()}
                        className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingContractProfile ? 'Zapisywanie…' : 'Zapisz dane do umowy'}
                      </button>
                    )}
                    {profileComplete && !profileLocked && (
                      <p className="text-sm text-emerald-800">
                        Dane zapisane — wybierz dzieci i wygeneruj umowę poniżej.
                      </p>
                    )}
                  </div>

                  {(profileComplete || profileLocked) && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">Dzieci w umowie</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Oznacz dzieci, dla których ma zostać wygenerowana umowa.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {proposals.map((p) => {
                        const level = childAccessLevel(p);
                        const isAccepted = level === 'ACCEPTED';
                        const isPending = level === 'PROPOSED' || level === 'NEGOTIATING';
                        const included = includedInContract[p.request_id] !== false;
                        return (
                          <div
                            key={p.request_id}
                            className="rounded-xl border border-white bg-white px-4 py-3"
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 accent-[#0f6e56]"
                                disabled={formLocked || !isAccepted}
                                checked={isAccepted && included}
                                onChange={(e) =>
                                  setIncludedInContract((prev) => ({
                                    ...prev,
                                    [p.request_id]: e.target.checked,
                                  }))
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-semibold text-zinc-900">
                                  {p.child_first_name} {p.child_last_name}
                                </span>
                                {p.group_name ? (
                                  <span className="mt-1 block text-sm text-zinc-600">
                                    {p.group_name}
                                    {p.location_name ? ` · ${p.location_name}` : ''}
                                    {p.schedule ? ` · ${p.schedule}` : ''}
                                  </span>
                                ) : null}
                                {isPending && (
                                  <span className="mt-1 block text-xs text-amber-800">
                                    Brak akceptacji — zostanie pominięte i odrzucone przy generowaniu
                                    umowy
                                  </span>
                                )}
                                {!isAccepted && !isPending && (
                                  <span className="mt-1 block text-xs text-zinc-500">
                                    Status: {level}
                                  </span>
                                )}
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>

                    {isContractSigned && contractPreview ? (
                      <ContractPortal contract={contractPreview} readOnly />
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-zinc-800">Sposób rozliczeń</p>
                          <div className="flex flex-wrap gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name="paymentType-parent"
                                className="accent-[#0f6e56]"
                                disabled={formLocked}
                                checked={paymentType === 'MONTHLY'}
                                onChange={() => setPaymentType('MONTHLY')}
                              />
                              {paymentTypeShortLabel('MONTHLY')}
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name="paymentType-parent"
                                className="accent-[#0f6e56]"
                                disabled={formLocked}
                                checked={paymentType === 'YEARLY'}
                                onChange={() => setPaymentType('YEARLY')}
                              />
                              {paymentTypeShortLabel('YEARLY')}
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="radio"
                                name="paymentType-parent"
                                className="accent-[#0f6e56]"
                                disabled={formLocked}
                                checked={paymentType === 'PER_LESSON'}
                                onChange={() => setPaymentType('PER_LESSON')}
                              />
                              {paymentTypeShortLabel('PER_LESSON')}
                            </label>
                          </div>
                          {childAmountBreakdown.length > 0 && (
                            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                              <p className="font-medium text-zinc-800">
                                {paymentType === 'PER_LESSON'
                                  ? 'Stawka za pojedyncze zajęcia'
                                  : `Składniki kwoty (${paymentTypeLabel})`}
                              </p>
                              <ul className="mt-2 space-y-1.5">
                                {childAmountBreakdown.map((line) => (
                                  <li
                                    key={line.requestId}
                                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                                  >
                                    <span>
                                      <span className="font-medium text-zinc-900">{line.name}</span>
                                      {line.groupName ? (
                                        <span className="text-zinc-500"> · {line.groupName}</span>
                                      ) : null}
                                    </span>
                                    <span className="font-medium text-zinc-900">
                                      {formatPlnAmount(line.amount)}
                                      {paymentType === 'PER_LESSON' && line.amount != null
                                        ? ' / zajęcie'
                                        : ''}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {paymentType !== 'PER_LESSON' && (
                          <p className="text-sm text-zinc-700">
                            Łączna kwota:{' '}
                            {pricingPreview.discountKeys.length > 0 && !formLocked && baseTotal != null && (
                              <span className="mr-1 text-zinc-500 line-through">
                                {formatPlnAmount(baseTotal)}
                              </span>
                            )}
                            <span className="font-semibold text-zinc-900">
                              {formatPlnAmount(
                                formLocked && parentContract?.amount != null
                                  ? Number(parentContract.amount)
                                  : pricingPreview.finalTotal,
                              )}
                            </span>
                            {pricingPreview.discountLabels.length > 0 && !formLocked && (
                              <span className="ml-1 text-xs text-emerald-700">
                                (zniżki: {pricingPreview.discountLabels.join(', ')})
                              </span>
                            )}
                          </p>
                          )}
                          {paymentType === 'PER_LESSON' && !formLocked && (
                            <p className="text-sm text-zinc-600">
                              Rozliczenie za pojedyncze zajęcia następuje co miesiąc na podstawie liczby odbytych zajęć —
                              kwota faktury zostanie ustalona przez szkołę.
                            </p>
                          )}
                        </div>

                        {!formLocked && (
                          <button
                            type="button"
                            disabled={
                              savingContract ||
                              !profileLoaded ||
                              !profileComplete ||
                              includedCount === 0 ||
                              !canGenerateContract
                            }
                            onClick={() => void handleGenerateParentContract()}
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingContract
                              ? 'Generowanie…'
                              : contractPreview
                                ? 'Wygeneruj ponownie'
                                : 'Wygeneruj umowę'}
                          </button>
                        )}
                        {contractPreview && !isContractSigned ? (
                          <div className="space-y-4 border-t border-emerald-200 pt-4">
                            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                              Umowa została wygenerowana wraz z osobnymi załącznikami dla każdego
                              dziecka. Najpierw zaakceptuj umowę, potem każdy załącznik, a na końcu
                              podpisz wszystkie dokumenty jednym przyciskiem.
                            </div>
                            <ContractPortal
                              contract={contractPreview}
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
                    )}
                  </div>
                  )}
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

    const enrolledChildren = proposals.filter((p) => {
      const level = childAccessLevel(p);
      return level === 'COMPLETED' || level === 'SIGNED';
    });

    return (
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Podsumowanie</h3>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          {userInfo.complimentaryAccess
            ? 'Zapis został zakończony (tryb bez opłat). Dziecko jest aktywnym uczestnikiem zajęć — umowa nie była wymagana.'
            : 'Zapis został zakończony i dziecko jest aktywnym uczestnikiem zajęć.'}
        </div>
        {enrolledChildren.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              {enrolledChildren.length === 1
                ? 'Twoje dziecko uczęszcza do grupy:'
                : 'Twoje dzieci uczęszczają do grup:'}
            </p>
            {enrolledChildren.map((p) => (
              <div
                key={p.request_id}
                className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
              >
                <p className="text-base font-semibold text-zinc-900">
                  {p.child_first_name} {p.child_last_name}
                </p>
                <div className="mt-3 grid gap-1.5 text-sm text-zinc-800 sm:grid-cols-[max-content_1fr]">
                  <span className="font-semibold text-zinc-900">Grupa:</span>
                  <span>{p.group_name ?? 'Do ustalenia'}</span>
                  <span className="font-semibold text-zinc-900">Lokalizacja:</span>
                  <span>{p.location_name}</span>
                  <span className="font-semibold text-zinc-900">Termin zajęć:</span>
                  <span>{p.schedule}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="Brak szczegółów grupy. Jeśli informacje się nie pojawią, skontaktuj się ze szkołą." />
        )}
      </section>
    );
  };

  const renderEnrollmentTab = () => (
    <div className="space-y-4">
      <RenewalParentFlowSection
        onFlash={setFlash}
        onUpdated={refreshUserAccessLevel}
      />
      <section className="space-y-6 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header>
        <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Proces zapisu</h2>
        <p className="mt-1 text-sm text-zinc-600">Śledź kolejne etapy od zgłoszenia do aktywacji dziecka.</p>
      </header>

      <div className="no-scrollbar overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {enrollmentStepsForUser.map((step, index) => {
            const isSelected = index === selectedStepIndex;
            const isReachable = index <= currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isReachable) return;
                    setManualStepSelection(true);
                    setSelectedStepIndex(index);
                  }}
                  disabled={!isReachable}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                    isSelected
                      ? 'border-[#ffc94a] bg-[#fff6dd] text-[#3b2a10]'
                      : isReachable
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-zinc-200 bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {step.label}
                </button>
                {index < enrollmentStepsForUser.length - 1 && (
                  <span className="text-zinc-300">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 md:p-5">{renderEnrollmentStepContent()}</div>
      </section>
    </div>
  );

  return renderEnrollmentTab();
}
