'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ContractPortal from '@/src/components/ContractPortal';
import ParentAddChildSection from '@/src/components/parent/ParentAddChildSection';
import RenewalParentFlowSection from '@/src/components/parent/RenewalParentFlowSection';
import { computeContractPreviewAmount, type ContractPricingContext } from '@/lib/contract-pricing-preview';
import { hasIndividualPriceOverride } from '@/lib/discount-math';
import { resolveChildBaseAmount, sumChildrenBaseAmounts } from '@/lib/enrollment-pricing';
import { resolveLessonUnitPrice } from '@/lib/lesson-pricing';
import { paymentTypePeriodLabel, paymentTypeShortLabel } from '@/lib/payment-labels';
import { validateParentContractProfileInput } from '@/lib/parent-contract-profile';
import { PICKUP_CONSENT_PRINT_INSTRUCTIONS } from '@/lib/pickup-consent-notice';

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
  teacher_pickup_consent?: boolean;
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
  firstName: string;
  lastName: string;
  phone: string;
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

function collectEnrollmentLevels(
  proposals: EnrollmentProposal[],
  children: UserInfo['children'],
): ChildEnrollmentLevel[] {
  return [
    ...proposals.map((p) => childAccessLevel(p)),
    ...(children ?? [])
      .filter((c) => c.active !== false)
      .map((c) => c.accessLevel)
      .filter((v): v is ChildEnrollmentLevel => Boolean(v)),
  ];
}

/**
 * Aktywny krok procesu: niedokończone zgłoszenia/propozycje mają pierwszeństwo
 * przed kontem ACTIVE / rodzeństwem COMPLETED (kolejne dziecko po zakończonym zapisie).
 */
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
  const levels = collectEnrollmentLevels(proposals, children);
  const steps = getEnrollmentStepsForUser(complimentaryAccess);
  const summaryIndex = steps.length - 1;
  const proposedIndex = steps.findIndex((s) => s.key === 'proposed');
  const contractIndex = steps.findIndex((s) => s.key === 'contractSent');

  const hasPendingDecisions =
    contractReadiness?.hasPendingDecisions ??
    levels.some((s) => s === 'PROPOSED' || s === 'NEGOTIATING' || s === 'NEW');

  const hasActionableProposal = levels.some(
    (s) => s === 'PROPOSED' || s === 'NEGOTIATING',
  );

  const hasFinishedChild =
    levels.some((s) => s === 'COMPLETED' || s === 'SIGNED') || accountAccessLevel === 'ACTIVE';

  // 1) Otwarty proces (kolejne dziecko / nowa propozycja) — zawsze przed podsumowaniem.
  if (complimentaryAccess) {
    if (hasActionableProposal) {
      return proposedIndex >= 0 ? proposedIndex : 0;
    }
    if (hasPendingDecisions) {
      // NEW bez children/propozycji — pokaż zgłoszenie (w tym kolejne dziecko).
      return 0;
    }
    if (hasFinishedChild || levels.some((s) => s === 'COMPLETED')) {
      return summaryIndex;
    }
    return proposedIndex >= 0 ? proposedIndex : 0;
  }

  if (hasActionableProposal) {
    return proposedIndex >= 0 ? proposedIndex : 0;
  }

  if (hasPendingDecisions) {
    return 0;
  }

  if (contractReadiness?.canPrepareContract || levels.some((s) => s === 'ACCEPTED')) {
    return contractIndex >= 0 ? contractIndex : summaryIndex;
  }

  if (levels.some((s) => s === 'SIGNED')) {
    return contractIndex >= 0 ? contractIndex : summaryIndex;
  }

  if (hasFinishedChild) {
    return summaryIndex;
  }

  return 0;
}

/** Najdalszy osiągalny krok — zachowuje dostęp do Podsumowania przy równoległym nowym zapisie. */
function deriveEnrollmentMaxReachableIndex(
  activeStepIndex: number,
  proposals: EnrollmentProposal[],
  children: UserInfo['children'],
  accountAccessLevel: UserInfo['accessLevel'],
  complimentaryAccess?: boolean,
): number {
  const levels = collectEnrollmentLevels(proposals, children);
  const steps = getEnrollmentStepsForUser(complimentaryAccess);
  const summaryIndex = steps.length - 1;
  const hasFinishedChild =
    levels.some((s) => s === 'COMPLETED' || s === 'SIGNED') || accountAccessLevel === 'ACTIVE';
  if (hasFinishedChild) {
    return Math.max(activeStepIndex, summaryIndex);
  }
  return activeStepIndex;
}

type FlashKind = 'success' | 'error' | 'info';
interface Flash {
  kind: FlashKind;
  message: string;
}

type EnrollmentStepKey = 'pending' | 'proposed' | 'contractSent' | 'active';

interface EnrollmentStep {
  key: EnrollmentStepKey;
  label: string;
}

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
  onNavigateToDocuments?: () => void;
}

export default function EnrollmentParentFlow({
  userInfo,
  onUserInfoUpdate,
  onNavigateToDocuments,
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
  const userInfoRef = useRef(userInfo);
  userInfoRef.current = userInfo;
  const [flash, setFlash] = useState<Flash | null>(null);
  const [pickupConsentModal, setPickupConsentModal] = useState<{
    previewHtml: string;
    childName: string;
    downloadUrl: string | null;
  } | null>(null);
  const [contractProfile, setContractProfile] = useState<ParentProfileForm>({
    firstName: userInfo.firstName ?? '',
    lastName: userInfo.lastName ?? '',
    phone: userInfo.phone?.trim() ?? '',
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
  const [discountLargeFamily, setDiscountLargeFamily] = useState(false);
  const [savedDiscountLargeFamily, setSavedDiscountLargeFamily] = useState(false);
  const [includedInContract, setIncludedInContract] = useState<Record<string, boolean>>({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [profileLocked, setProfileLocked] = useState(false);
  const [savingContractProfile, setSavingContractProfile] = useState(false);
  /** Po zapisie pola są zablokowane — odblokowanie tylko przez „Edytuj dane”. */
  const [isEditingContractProfile, setIsEditingContractProfile] = useState(true);
  /**
   * Po wygenerowaniu (SENT) przycisk generowania jest nieaktywny, aż rodzic
   * ponownie zapisze dane (lub zmieni kolejkę / sposób rozliczeń).
   */
  const [allowContractRegenerate, setAllowContractRegenerate] = useState(false);
  /** Rodzic musi zapisać dane i potwierdzić ich aktualność przed generowaniem umowy. */
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [schoolYearName, setSchoolYearName] = useState<string | null>(null);
  const enrollmentStepsForUser = getEnrollmentStepsForUser(userInfo.complimentaryAccess);
  const currentStepIndex = deriveEnrollmentStepIndex(
    proposals,
    userInfo.children,
    userInfo.accessLevel,
    userInfo.complimentaryAccess,
    contractReadiness
  );
  const maxReachableStepIndex = deriveEnrollmentMaxReachableIndex(
    currentStepIndex,
    proposals,
    userInfo.children,
    userInfo.accessLevel,
    userInfo.complimentaryAccess
  );
  const [selectedStepIndex, setSelectedStepIndex] = useState(currentStepIndex);
  const [manualStepSelection, setManualStepSelection] = useState(false);

  useEffect(() => {
    if (!manualStepSelection) {
      setSelectedStepIndex(currentStepIndex);
      return;
    }
    setSelectedStepIndex((prev) => Math.min(prev, maxReachableStepIndex));
  }, [currentStepIndex, maxReachableStepIndex, manualStepSelection]);

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
        setSchoolYearName(null);
        return;
      }
      const data = (await r.json()) as {
        proposals?: EnrollmentProposal[];
        parentContract?: ParentContractDocument | null;
        contractReadiness?: ContractReadiness;
        contractPricing?: ContractPricing | null;
        enrollmentRequestSummary?: EnrollmentRequestSummary | null;
        parentIdentity?: {
          firstName: string;
          lastName: string;
          phone: string | null;
        } | null;
        schoolYearName?: string | null;
      };
      const incoming = Array.isArray(data.proposals) ? data.proposals : [];
      setSchoolYearName(data.schoolYearName?.trim() ? data.schoolYearName.trim() : null);
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
      if (data.contractPricing && !data.contractPricing.billingExempt) {
        const kdr = Boolean(data.contractPricing.discountLargeFamily);
        setDiscountLargeFamily(kdr);
        setSavedDiscountLargeFamily(kdr);
      } else if (data.contractPricing?.billingExempt) {
        setDiscountLargeFamily(false);
        setSavedDiscountLargeFamily(false);
      }
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
      if (data.parentIdentity) {
        onUserInfoUpdate({
          ...userInfoRef.current,
          firstName: data.parentIdentity.firstName,
          lastName: data.parentIdentity.lastName,
          phone: data.parentIdentity.phone,
        });
        setContractProfile((prev) => ({
          ...prev,
          firstName: data.parentIdentity!.firstName,
          lastName: data.parentIdentity!.lastName,
          phone: data.parentIdentity!.phone?.trim() ?? prev.phone,
        }));
      } else if (data.enrollmentRequestSummary) {
        setContractProfile((prev) => ({
          ...prev,
          firstName: prev.firstName || data.enrollmentRequestSummary!.parentFirstName,
          lastName: prev.lastName || data.enrollmentRequestSummary!.parentLastName,
          phone:
            prev.phone ||
            data.enrollmentRequestSummary!.parentPhone?.trim() ||
            '',
        }));
      }
    } catch (err) {
      console.error('Nie udało się pobrać statusu propozycji', err);
      setProposals([]);
      setEnrollmentRequestSummary(null);
    } finally {
      setProposalsLoading(false);
    }
  }, [onUserInfoUpdate]);

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
          discountLargeFamily?: boolean;
          complete?: boolean;
        } | null;
        profileLocked?: boolean;
        user?: { firstName?: string; lastName?: string };
      };
      const p = data.profile;
      setProfileLocked(Boolean(data.profileLocked));
      if (!p) {
        setProfileComplete(false);
        setProfileLoaded((loaded) => {
          if (!loaded) setIsEditingContractProfile(true);
          return true;
        });
        return;
      }
      const kdr = Boolean(p.discountLargeFamily);
      setDiscountLargeFamily(kdr);
      setSavedDiscountLargeFamily(kdr);
      setContractPricing((prev) =>
        prev ? { ...prev, discountLargeFamily: kdr } : prev,
      );
      setContractProfile((prev) => ({
        firstName: data.user?.firstName ?? prev.firstName,
        lastName: data.user?.lastName ?? prev.lastName,
        phone: prev.phone,
        address: p.address ?? prev.address,
        city: p.city ?? prev.city,
        zipCode: p.zipCode ?? prev.zipCode,
        billingType: p.billingType ?? (p.companyName || p.nip ? 'company' : 'private'),
        pesel: p.pesel ?? prev.pesel,
        companyName: p.companyName ?? prev.companyName,
        nip: p.nip ?? prev.nip,
      }));
      const complete = Boolean(p.complete);
      setProfileComplete(complete);
      setProfileLoaded((loaded) => {
        if (!loaded) setIsEditingContractProfile(!complete);
        return true;
      });
    } catch (err) {
      console.error('Nie udało się pobrać profilu rodzica', err);
      setProfileLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadParentProfile();
  }, [loadParentProfile]);

  const patchContractProfile = useCallback((patch: Partial<ParentProfileForm>) => {
    setDataConfirmed(false);
    setContractProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSaveContractProfile = useCallback(async (opts?: { silent?: boolean }) => {
    if (profileLocked) {
      setFlash({
        kind: 'error',
        message: 'Nie można zmienić danych — w tym roku szkolnym umowa została już podpisana.',
      });
      return false;
    }
    const validationError = validateContractProfile(contractProfile);
    if (validationError) {
      setFlash({ kind: 'error', message: validationError });
      return false;
    }
    if (!contractProfile.firstName.trim() || !contractProfile.lastName.trim()) {
      setFlash({ kind: 'error', message: 'Podaj imię i nazwisko rodzica.' });
      return false;
    }
    setSavingContractProfile(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: contractProfile.firstName,
          lastName: contractProfile.lastName,
          phone: contractProfile.phone,
          billingType: contractProfile.billingType,
          address: contractProfile.address,
          city: contractProfile.city,
          zipCode: contractProfile.zipCode,
          pesel: contractProfile.billingType === 'private' ? contractProfile.pesel : null,
          companyName:
            contractProfile.billingType === 'company' ? contractProfile.companyName : null,
          nip: contractProfile.billingType === 'company' ? contractProfile.nip : null,
          discountLargeFamily,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        message?: string;
        profile?: { complete?: boolean; discountLargeFamily?: boolean };
        profileLocked?: boolean;
        user?: { firstName?: string; lastName?: string; phone?: string | null };
      };
      if (!r.ok) {
        setFlash({ kind: 'error', message: data.message ?? 'Nie udało się zapisać danych do umowy' });
        return false;
      }
      setProfileComplete(Boolean(data.profile?.complete));
      setProfileLocked(Boolean(data.profileLocked));
      setIsEditingContractProfile(false);
      setAllowContractRegenerate(true);
      const savedKdr = Boolean(data.profile?.discountLargeFamily ?? discountLargeFamily);
      setDiscountLargeFamily(savedKdr);
      setSavedDiscountLargeFamily(savedKdr);
      setContractPricing((prev) =>
        prev ? { ...prev, discountLargeFamily: savedKdr } : prev,
      );
      if (data.user) {
        onUserInfoUpdate({
          ...userInfoRef.current,
          firstName: data.user.firstName ?? contractProfile.firstName,
          lastName: data.user.lastName ?? contractProfile.lastName,
          phone: data.user.phone ?? contractProfile.phone,
        });
      }
      if (!opts?.silent) {
        setFlash({
          kind: 'success',
          message: dataConfirmed
            ? 'Dane zapisane. Możesz wygenerować umowę poniżej.'
            : 'Dane zapisane. Zaznacz potwierdzenie aktualności danych, aby wygenerować umowę.',
        });
      }
      return true;
    } catch {
      setFlash({ kind: 'error', message: 'Nie udało się zapisać danych do umowy' });
      return false;
    } finally {
      setSavingContractProfile(false);
    }
  }, [contractProfile, discountLargeFamily, profileLocked, onUserInfoUpdate, dataConfirmed]);

  const handleGenerateParentContract = useCallback(async () => {
    if (!profileComplete) {
      setFlash({
        kind: 'error',
        message: 'Najpierw zapisz dane do umowy.',
      });
      return;
    }
    if (!dataConfirmed) {
      setFlash({
        kind: 'error',
        message: 'Potwierdź, że dane do umowy i faktury są aktualne.',
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

    if (discountLargeFamily !== savedDiscountLargeFamily) {
      const saved = await handleSaveContractProfile({ silent: true });
      if (!saved) return;
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
      const next = (data as { nextChildToContract?: { first_name?: string; last_name?: string } | null })
        .nextChildToContract;
      setAllowContractRegenerate(false);
      setFlash({
        kind: 'success',
        message: next
          ? `Umowa wygenerowana dla jednego dziecka. Podpisz ją, a potem wygenerujesz umowę dla: ${next.first_name ?? ''} ${next.last_name ?? ''}`.trim()
          : 'Umowa wygenerowana. Zapoznaj się z dokumentami i podpisz. Aby wygenerować ponownie przed podpisem: Edytuj dane → Zapisz dane.',
      });
      await Promise.all([loadProposals(), loadParentProfile()]);
    } catch {
      setFlash({ kind: 'error', message: 'Nie udało się wygenerować umowy' });
    } finally {
      setSavingContract(false);
    }
  }, [
    contractReadiness.canPrepareContract,
    dataConfirmed,
    discountLargeFamily,
    handleSaveContractProfile,
    includedInContract,
    loadParentProfile,
    loadProposals,
    paymentType,
    profileComplete,
    proposals,
    savedDiscountLargeFamily,
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
          pickupConsentGenerated?: boolean;
          pickupConsentPreviewHtml?: string | null;
          pickupConsentChildName?: string | null;
          pickupConsentDownloadUrl?: string | null;
        };
        if (!r.ok) {
          setFlash({ kind: 'error', message: data?.message ?? 'Nie udało się zaakceptować propozycji.' });
          return;
        }
        if (data.pickupConsentGenerated && data.pickupConsentPreviewHtml) {
          setPickupConsentModal({
            previewHtml: data.pickupConsentPreviewHtml,
            childName: data.pickupConsentChildName?.trim() || 'dziecko',
            downloadUrl: data.pickupConsentDownloadUrl?.trim() || null,
          });
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
    const pendingProposalCount = proposals.filter((p) => {
      const level = childAccessLevel(p);
      return level === 'PROPOSED' || level === 'NEGOTIATING';
    }).length;
    const finishedProposalCount = proposals.filter((p) => {
      const level = childAccessLevel(p);
      return level === 'COMPLETED' || level === 'SIGNED';
    }).length;
    const isReadOnlyPreview =
      selectedStepIndex < currentStepIndex &&
      !(currentStep.key === 'proposed' && hasPendingProposalDecisions);

    if (currentStep.key === 'pending') {
      const openRequestIds = new Set(
        proposals
          .filter((p) => {
            const level = childAccessLevel(p);
            return level === 'PROPOSED' || level === 'NEGOTIATING' || level === 'ACCEPTED';
          })
          .map((p) => p.request_id),
      );
      const finishedRequestIds = new Set(
        proposals
          .filter((p) => {
            const level = childAccessLevel(p);
            return level === 'COMPLETED' || level === 'SIGNED';
          })
          .map((p) => p.request_id),
      );
      const hasWaitingNewChild =
        contractReadiness.hasPendingDecisions &&
        (enrollmentRequestSummary?.children.some((c) => !finishedRequestIds.has(c.requestId)) ??
          false);

      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Zgłoszenie</h3>
          {hasWaitingNewChild ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Masz otwarte zgłoszenie kolejnego dziecka. Po stronie szkoły trwa dobór grupy — gdy
              propozycja będzie gotowa, automatycznie przejdziesz do kroku „Propozycja grupy”.
            </div>
          ) : null}
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
                {enrollmentRequestSummary.children.map((child, index) => {
                  const isFinished = finishedRequestIds.has(child.requestId);
                  const isInProposal = openRequestIds.has(child.requestId);
                  const isAwaitingProposal =
                    !isFinished && !isInProposal && contractReadiness.hasPendingDecisions;
                  return (
                  <div key={child.requestId} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold text-zinc-900">Dziecko {index + 1}</p>
                      {isFinished ? (
                        <span className="inline-block rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                          Zapis zakończony
                        </span>
                      ) : isInProposal ? (
                        <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                          W trakcie procesu
                        </span>
                      ) : isAwaitingProposal ? (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          Oczekuje na propozycję
                        </span>
                      ) : null}
                    </div>
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
                  );
                })}
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
                  {pendingProposalCount > 0 && finishedProposalCount > 0
                    ? `Trwa zapis kolejnego dziecka (${pendingProposalCount}). Wcześniej zakończone zapisy (${finishedProposalCount}) pozostają widoczne poniżej — zaakceptuj nową propozycję, aby kontynuować.`
                    : `Mamy propozycje dla ${proposals.length} dzieci. Każde dziecko ma jedną przypisaną grupę — zaakceptuj propozycję, aby przejść dalej w procesie zapisu.`}
                </p>
              )}
                  {proposals.some((p) => childAccessLevel(p) === 'PROPOSED') && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  Szkoła przygotowała{' '}
                  {pendingProposalCount > 1
                    ? 'propozycje grup'
                    : 'propozycję grupy'}
                  {finishedProposalCount > 0 && pendingProposalCount > 0
                    ? ' dla kolejnego dziecka'
                    : proposals.length > 1 && pendingProposalCount === proposals.length
                      ? ' dla każdego dziecka'
                      : ' dla Twojego dziecka'}
                  . Zaakceptuj{' '}
                  {pendingProposalCount > 1 ? 'je' : 'ją'}, aby
                  {userInfo.complimentaryAccess
                    ? ' zakończyć zapis (tryb bez opłat — bez umowy).'
                    : ' przejść dalej w procesie zapisu.'}
                  {!userInfo.complimentaryAccess &&
                    proposals.some((p) => childAccessLevel(p) === 'ACCEPTED') &&
                    contractReadiness.hasPendingDecisions && (
                      <>
                        {' '}
                        Część dzieci ma już zaakceptowaną propozycję — krok „Umowa” odblokuje się,
                        gdy wszystkie otwarte zgłoszenia będą zaakceptowane.
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

                    {Boolean(p.teacher_pickup_consent) ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                        <p className="font-semibold">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.required}</p>
                        <p className="mt-1 text-amber-900">
                          Po akceptacji otrzymasz zgodę do pobrania w Dokumentach. Nie podpisuje się
                          jej elektronicznie — trzeba przynieść wydruk z podpisem ręcznym na pierwsze
                          zajęcia.
                        </p>
                      </div>
                    ) : null}

                    {isActionable && (
                      <div className="mt-4 flex flex-wrap gap-3">
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
      const includedProposals = proposals.filter((p) => includedRequestIds.has(p.request_id));
      const siblingEligible =
        proposals.filter((p) => {
          const level = childAccessLevel(p);
          return level === 'ACCEPTED' || level === 'SIGNED';
        }).length >= 2;
      const childAmountBreakdown = includedProposals.map((p) => {
        const base =
          paymentType === 'PER_LESSON'
            ? resolveProposalLessonUnitPrice(p)
            : resolveChildBaseAmount(p, paymentType);
        const preview = computeContractPreviewAmount(
          paymentType === 'PER_LESSON' ? null : base,
          siblingEligible,
          contractPricing
            ? {
                ...contractPricing,
                hasIndividualPricing: hasIndividualPriceOverride(p),
              }
            : null,
        );
        return {
          requestId: p.request_id,
          name: `${p.child_first_name} ${p.child_last_name}`.trim(),
          groupName: p.group_name,
          amount: paymentType === 'PER_LESSON' ? base : preview.finalTotal,
          baseAmount: base,
          discountLabels: preview.discountLabels,
        };
      });
      const baseTotal = sumIncludedProposalAmounts(proposals, includedRequestIds, paymentType);
      const pricingPreview = (() => {
        if (paymentType === 'PER_LESSON' || baseTotal == null || !contractPricing) {
          return computeContractPreviewAmount(
            paymentType === 'PER_LESSON' ? null : baseTotal,
            siblingEligible,
            contractPricing,
          );
        }
        // Zniżki per dziecko (cena indywidualna wyłącza rabat tylko dla tego dziecka).
        let finalTotal = 0;
        const labels = new Set<string>();
        const keys: string[] = [];
        for (const p of includedProposals) {
          const base = resolveChildBaseAmount(p, paymentType);
          if (base == null) continue;
          const preview = computeContractPreviewAmount(base, siblingEligible, {
            ...(contractPricing as ContractPricingContext),
            hasIndividualPricing: hasIndividualPriceOverride(p),
          });
          if (preview.finalTotal != null) finalTotal += preview.finalTotal;
          for (const label of preview.discountLabels) labels.add(label);
          for (const key of preview.discountKeys) {
            if (!keys.includes(key)) keys.push(key);
          }
        }
        return {
          finalTotal: Math.round(finalTotal * 100) / 100,
          discountKeys: keys as ReturnType<typeof computeContractPreviewAmount>['discountKeys'],
          discountLabels: [...labels],
        };
      })();
      const paymentTypeLabel = paymentTypePeriodLabel(paymentType);
      const canGenerateContract =
        paymentType === 'PER_LESSON' ? baseTotal != null : baseTotal != null;
      const hasSentContract = parentContract?.status === 'SENT';
      const nextGenerateHint = hasSentContract
        ? 'Najpierw podpisz wygenerowaną umowę — dopiero potem pojawi się generowanie dla kolejnego dziecka.'
        : includedProposals.length > 1
          ? 'Umowy generują się po kolei: jedno dziecko = jedna umowa. Po podpisaniu pierwszej wygenerujesz kolejną.'
          : null;
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
      const hasUnsignedGeneratedContract = parentContract?.status === 'SENT';
      const profileFieldsLocked =
        profileLocked || isReadOnlyPreview || isContractSigned || !isEditingContractProfile;
      const commonProfileLocked = profileLocked || isReadOnlyPreview || isContractSigned;
      const formLocked = isReadOnlyPreview || isContractSigned || !contractReadiness.canPrepareContract;
      const generateDisabledByExistingContract =
        hasUnsignedGeneratedContract && !allowContractRegenerate;

      return (
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900">Umowa</h3>
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
          {isReadOnlyPreview && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Podgląd wcześniejszego etapu. Zmiany są zablokowane.
            </div>
          )}
          <p className="text-sm text-zinc-600">
            Każde dziecko ma osobną umowę. Zaznacz dzieci w kolejce, a umowy wygenerujesz po kolei
            (po podpisaniu jednej pojawi się kolejna). Rabat rodzeństwa naliczany jest na każdej
            umowie, gdy masz co najmniej dwoje dzieci zaakceptowanych lub z podpisaną umową.
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
                        Te informacje trafią do każdej umowy generowanej dla Twoich dzieci.
                      </p>
                    </div>
                    {profileLocked && (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
                        Dane w tym kroku są zablokowane — umowa w tym roku została już podpisana.
                        Aktualizację danych na przyszłe dokumenty znajdziesz w zakładce{' '}
                        <strong>Profil i dane do faktury</strong>.
                      </div>
                    )}
                    {!profileLocked && !isContractSigned && (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                        1) Sprawdź i zapisz dane. 2) Potwierdź, że są aktualne. 3) Dopiero potem
                        wygenerujesz umowę. Po zapisie możesz użyć „Edytuj dane”, żeby zmienić dane
                        i zapisać ponownie — wtedy generowanie umowy znów będzie dostępne.
                      </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-800">Imię</label>
                        <input
                          type="text"
                          disabled={profileFieldsLocked}
                          value={contractProfile.firstName}
                          onChange={(e) => patchContractProfile({ firstName: e.target.value })}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-800">Nazwisko</label>
                        <input
                          type="text"
                          disabled={profileFieldsLocked}
                          value={contractProfile.lastName}
                          onChange={(e) => patchContractProfile({ lastName: e.target.value })}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
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
                          disabled={profileFieldsLocked}
                          value={contractProfile.phone}
                          onChange={(e) => patchContractProfile({ phone: e.target.value })}
                          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
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
                            disabled={profileFieldsLocked}
                            checked={contractProfile.billingType === 'private'}
                            onChange={() => patchContractProfile({ billingType: 'private' })}
                          />
                          Osoba prywatna (PESEL)
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                          <input
                            type="radio"
                            name="billingType-shared"
                            className="accent-[#0f6e56]"
                            disabled={profileFieldsLocked}
                            checked={contractProfile.billingType === 'company'}
                            onChange={() => patchContractProfile({ billingType: 'company' })}
                          />
                          Firma (faktura)
                        </label>
                      </div>
                    </div>

                    {contractProfile.billingType === 'private' ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1 md:col-span-2 max-w-sm">
                          <label className="text-sm font-medium text-zinc-800">PESEL</label>
                          <input
                            type="text"
                            maxLength={11}
                            disabled={profileFieldsLocked}
                            value={contractProfile.pesel}
                            onChange={(e) => patchContractProfile({ pesel: e.target.value })}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-sm font-medium text-zinc-800">Adres</label>
                          <input
                            type="text"
                            disabled={profileFieldsLocked}
                            value={contractProfile.address}
                            onChange={(e) => patchContractProfile({ address: e.target.value })}
                            placeholder="ul. Przykładowa 1"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-zinc-800">Miasto</label>
                          <input
                            type="text"
                            disabled={profileFieldsLocked}
                            value={contractProfile.city}
                            onChange={(e) => patchContractProfile({ city: e.target.value })}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
                          <input
                            type="text"
                            disabled={profileFieldsLocked}
                            value={contractProfile.zipCode}
                            onChange={(e) => patchContractProfile({ zipCode: e.target.value })}
                            placeholder="00-000"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                        <p className="text-sm font-semibold text-zinc-900">Dane firmy do faktury</p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium text-zinc-800">Nazwa firmy</label>
                            <input
                              type="text"
                              disabled={profileFieldsLocked}
                              value={contractProfile.companyName}
                              onChange={(e) => patchContractProfile({ companyName: e.target.value })}
                              placeholder="Pełna nazwa firmy"
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2 max-w-sm">
                            <label className="text-sm font-medium text-zinc-800">NIP</label>
                            <input
                              type="text"
                              maxLength={10}
                              inputMode="numeric"
                              disabled={profileFieldsLocked}
                              value={contractProfile.nip}
                              onChange={(e) => patchContractProfile({ nip: e.target.value })}
                              placeholder="10 cyfr"
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium text-zinc-800">
                              Adres siedziby firmy
                            </label>
                            <input
                              type="text"
                              disabled={profileFieldsLocked}
                              value={contractProfile.address}
                              onChange={(e) => patchContractProfile({ address: e.target.value })}
                              placeholder="ul. Przykładowa 1"
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Miasto</label>
                            <input
                              type="text"
                              disabled={profileFieldsLocked}
                              value={contractProfile.city}
                              onChange={(e) => patchContractProfile({ city: e.target.value })}
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-medium text-zinc-800">Kod pocztowy</label>
                            <input
                              type="text"
                              disabled={profileFieldsLocked}
                              value={contractProfile.zipCode}
                              onChange={(e) => patchContractProfile({ zipCode: e.target.value })}
                              placeholder="00-000"
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f6e56]/30 transition focus:border-[#0f6e56] focus:ring-2 disabled:bg-zinc-100"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {!commonProfileLocked && (
                      <div className="space-y-3">
                        <label
                          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                            dataConfirmed
                              ? 'border-zinc-200 bg-zinc-100 text-zinc-500'
                              : 'border-amber-200 bg-amber-50 text-amber-950'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className={`mt-0.5 ${dataConfirmed ? 'accent-zinc-400' : 'accent-[#0f6e56]'}`}
                            checked={dataConfirmed}
                            disabled={!isEditingContractProfile && dataConfirmed}
                            onChange={(e) => setDataConfirmed(e.target.checked)}
                          />
                          <span>
                            Potwierdzam, że powyższe dane do umowy i faktury są{' '}
                            <strong className={dataConfirmed ? 'text-zinc-600' : undefined}>
                              aktualne i poprawne
                            </strong>
                            . Dopiero po tym potwierdzeniu mogę wygenerować umowę.
                          </span>
                        </label>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={
                              savingContractProfile || !isEditingContractProfile || profileLocked
                            }
                            onClick={() => void handleSaveContractProfile()}
                            className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingContractProfile ? 'Zapisywanie…' : 'Zapisz dane do umowy'}
                          </button>
                          {!isEditingContractProfile && profileComplete ? (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingContractProfile(true);
                                setDataConfirmed(false);
                              }}
                              className="rounded-full border border-[#0f6e56] bg-white px-5 py-2.5 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50"
                            >
                              Edytuj dane
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  {(profileComplete || profileLocked) && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-4">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">Kolejka umów</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Oznacz dzieci, dla których mają powstać osobne umowy (generowanie po
                        kolei).
                      </p>
                      {nextGenerateHint ? (
                        <p className="mt-2 text-sm text-sky-900">{nextGenerateHint}</p>
                      ) : null}
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
                                onChange={(e) => {
                                  setAllowContractRegenerate(true);
                                  setIncludedInContract((prev) => ({
                                    ...prev,
                                    [p.request_id]: e.target.checked,
                                  }));
                                }}
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
                                    Brak akceptacji — nie można jeszcze wygenerować umowy dla tego
                                    dziecka
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
                                onChange={() => {
                                  setAllowContractRegenerate(true);
                                  setPaymentType('MONTHLY');
                                }}
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
                                onChange={() => {
                                  setAllowContractRegenerate(true);
                                  setPaymentType('YEARLY');
                                }}
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
                                onChange={() => {
                                  setAllowContractRegenerate(true);
                                  setPaymentType('PER_LESSON');
                                }}
                              />
                              {paymentTypeShortLabel('PER_LESSON')}
                            </label>
                          </div>
                          {contractPricing && !contractPricing.billingExempt ? (
                            <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                              <input
                                type="checkbox"
                                className="accent-[#0f6e56]"
                                disabled={formLocked}
                                checked={discountLargeFamily}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setDiscountLargeFamily(checked);
                                  setAllowContractRegenerate(true);
                                  setContractPricing((prev) =>
                                    prev ? { ...prev, discountLargeFamily: checked } : prev,
                                  );
                                }}
                              />
                              Posiadam Kartę Dużej Rodziny (
                              {contractPricing.discountSettings.LARGE_FAMILY_CARD ?? 0}%)
                            </label>
                          ) : null}
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
                            {includedProposals.length > 1 ? (
                              <>
                                Suma podglądowa (osobne umowy):{' '}
                                <span className="font-semibold text-zinc-900">
                                  {formatPlnAmount(pricingPreview.finalTotal)}
                                </span>
                                {pricingPreview.discountLabels.length > 0 && !formLocked && (
                                  <span className="ml-1 text-xs text-emerald-700">
                                    (zniżki na każdej umowie: {pricingPreview.discountLabels.join(', ')})
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                Kwota umowy:{' '}
                                {pricingPreview.discountKeys.length > 0 &&
                                  !formLocked &&
                                  baseTotal != null && (
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
                              </>
                            )}
                          </p>
                          )}
                          {paymentType === 'PER_LESSON' && !formLocked && (
                            <p className="text-sm text-zinc-600">
                              Rozliczenie za pojedyncze zajęcia następuje co miesiąc na podstawie liczby odbytych zajęć.
                            </p>
                          )}
                        </div>

                        {!formLocked && (
                          <div className="space-y-2">
                            {!dataConfirmed && !contractPreview && (
                              <p className="text-sm text-amber-800">
                                Aby wygenerować umowę, zaznacz potwierdzenie aktualności danych
                                powyżej.
                              </p>
                            )}
                            {generateDisabledByExistingContract && dataConfirmed && (
                              <p className="text-sm text-zinc-600">
                                Umowa jest już wygenerowana. Aby wygenerować ponownie ze zmienionymi
                                danymi: Edytuj dane → Zapisz dane.
                              </p>
                            )}
                            <button
                              type="button"
                              disabled={
                                savingContract ||
                                !profileLoaded ||
                                !profileComplete ||
                                !dataConfirmed ||
                                includedProposals.length === 0 ||
                                !canGenerateContract ||
                                generateDisabledByExistingContract ||
                                isEditingContractProfile
                              }
                              onClick={() => void handleGenerateParentContract()}
                              className="rounded-full bg-[#0f6e56] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b5a46] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingContract ? 'Generowanie…' : 'Wygeneruj umowę'}
                            </button>
                          </div>
                        )}
                        {contractPreview && !isContractSigned ? (
                          <div className="space-y-4 border-t border-emerald-200 pt-4">
                            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                              Umowa dotyczy jednego dziecka. Zaakceptuj umowę i pozostałe dokumenty, a
                              następnie podpisz. Jeśli w kolejce są kolejne dzieci — po podpisie
                              wygenerujesz następną umowę.
                            </div>
                            <ContractPortal
                              contract={contractPreview}
                              onSigned={async (result) => {
                                const next = result?.nextChildToContract;
                                const pdfOk = result?.pdfGenerated !== false;
                                const base = next
                                  ? `Umowa podpisana. Wygeneruj teraz umowę dla: ${next.first_name} ${next.last_name}`.trim()
                                  : 'Umowa podpisana. Dziękujemy!';
                                setFlash({
                                  kind: pdfOk ? 'success' : 'error',
                                  message: pdfOk
                                    ? base
                                    : `${base} Uwaga: nie udało się wygenerować PDF — skontaktuj się ze szkołą.`,
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
        </section>
      );
    }

    const enrolledChildren = proposals.filter((p) => {
      const level = childAccessLevel(p);
      return level === 'COMPLETED' || level === 'SIGNED';
    });
    const hasOpenEnrollment =
      contractReadiness.hasPendingDecisions ||
      proposals.some((p) => {
        const level = childAccessLevel(p);
        return level === 'PROPOSED' || level === 'NEGOTIATING' || level === 'ACCEPTED';
      });

    return (
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-zinc-900">Podsumowanie</h3>
        {hasOpenEnrollment ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Trwa zapis kolejnego dziecka. Zakończone zapisy poniżej pozostają bez zmian — wróć do
            kroku „Propozycja grupy” (lub „Umowa”), aby kontynuować nowy proces.
          </div>
        ) : null}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          {userInfo.complimentaryAccess
            ? `Zapis został zakończony (tryb bez opłat). ${
                enrolledChildren.length > 1 ? 'Dzieci są aktywnymi uczestnikami' : 'Dziecko jest aktywnym uczestnikiem'
              } zajęć${
                schoolYearName ? ` w roku szkolnym ${schoolYearName}` : ''
              } — umowa nie była wymagana.`
            : `Zapis został zakończony i ${
                enrolledChildren.length > 1 ? 'dzieci są aktywnymi uczestnikami' : 'dziecko jest aktywnym uczestnikiem'
              } zajęć${
                schoolYearName ? ` w roku szkolnym ${schoolYearName}` : ''
              }.`}
        </div>
        {enrolledChildren.some((p) => p.teacher_pickup_consent) ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="font-semibold text-amber-950">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.title}</p>
            <p className="mt-2">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.required}</p>
            <p className="mt-2">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.noESign}</p>
            <p className="mt-2">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.downloadInDocuments}</p>
            <p className="mt-2">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.teacherBlankForms}</p>
            {onNavigateToDocuments ? (
              <button
                type="button"
                onClick={onNavigateToDocuments}
                className="mt-3 rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b5a46]"
              >
                Przejdź do Dokumentów
              </button>
            ) : null}
          </div>
        ) : null}
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
      <ParentAddChildSection
        onSuccess={async () => {
          setManualStepSelection(false);
          await Promise.all([loadProposals(), refreshUserAccessLevel()]);
        }}
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
            const isReachable = index <= maxReachableStepIndex;
            const isActiveProcessStep = index === currentStepIndex;
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
                      : isActiveProcessStep
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
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

  return (
    <>
      {renderEnrollmentTab()}
      {pickupConsentModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
              <h3 className="text-lg font-semibold text-amber-950">
                {PICKUP_CONSENT_PRINT_INSTRUCTIONS.title}
              </h3>
              {pickupConsentModal.childName ? (
                <p className="mt-1 text-sm text-amber-900">Dziecko: {pickupConsentModal.childName}</p>
              ) : null}
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm text-zinc-800">
              <p className="font-medium text-zinc-900">{PICKUP_CONSENT_PRINT_INSTRUCTIONS.required}</p>
              <p>{PICKUP_CONSENT_PRINT_INSTRUCTIONS.noESign}</p>
              <p>{PICKUP_CONSENT_PRINT_INSTRUCTIONS.downloadInDocuments}</p>
              <p>{PICKUP_CONSENT_PRINT_INSTRUCTIONS.teacherBlankForms}</p>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
                  <p className="text-sm font-semibold text-zinc-800">Podgląd zgody</p>
                  <p className="text-xs text-zinc-500">Dokument do wydruku — bez podpisu elektronicznego.</p>
                </div>
                <iframe
                  srcDoc={pickupConsentModal.previewHtml}
                  title="Podgląd zgody na odebranie dziecka"
                  className="block w-full border-0 bg-white"
                  style={{ height: 'min(50vh, 480px)' }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-5 py-4">
              <button
                type="button"
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setPickupConsentModal(null)}
              >
                Zamknij
              </button>
              {pickupConsentModal.downloadUrl ? (
                <a
                  href={pickupConsentModal.downloadUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b5a46]"
                >
                  Pobierz
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
