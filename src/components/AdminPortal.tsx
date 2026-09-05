'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { normalizePolishPhone } from '@/lib/phone';
import ClassesCalendarPanel from '@/src/components/admin/ClassesCalendarPanel';
import RenewalsPanel from '@/src/components/admin/RenewalsPanel';
import EnrollmentAdminPanel from '@/src/components/admin/EnrollmentAdminPanel';
import ManagerDashboardPanel from '@/src/components/admin/ManagerDashboardPanel';
import ResignationsPanel from '@/src/components/admin/ResignationsPanel';
import type { ComplimentaryParentRow, EnrollmentGroupRow, EnrollmentParentRow } from '@/src/components/enrollment/types';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import { useOpenResignationsCount } from '@/src/components/admin/useOpenResignationsCount';
import { usePendingEnrollmentsCount } from '@/src/components/admin/usePendingEnrollmentsCount';
import {
  formatSchoolDateTime,
  periodMonthKey,
  todayYmdSchool,
} from '@/lib/school-timezone';
import {
  detectLevelFromGroupName,
  isHarryEnglishLevelCode,
} from '@/src/data/harryEnglishLevels';
import GroupNamingFields, {
  previewAutoGroupName,
} from '@/src/components/admin/GroupNamingFields';

type TabKey =
  | 'dashboard'
  | 'organization'
  | 'classes'
  | 'enrollments'
  | 'announcements'
  | 'billing'
  | 'settlements';
type MobileTab = 'organization' | 'users' | 'more';
type UsersSubTab = 'parents' | 'children' | 'teachers' | 'managers' | 'accountants' | 'add';
type OrganizationSubTab =
  | 'schoolYear'
  | 'teachers'
  | 'locations'
  | 'discounts'
  | 'groups'
  | 'users'
  | 'history';
type EnrollmentFlowSubTab = 'enrollment' | 'renewals' | 'resignations';
type BillingSubTab = 'summary' | 'invoices' | 'settings';
type BillingSummaryKind = 'monthly' | 'per_lesson';
type TeacherOrgSubTab = 'list' | 'add';
type LocationOrgSubTab = 'list' | 'add' | 'edit' | 'specials';
type GroupsSubTab = 'list' | 'add' | 'organize' | 'yearLessons';

/** Zgodnie z kolumną `users.role` (TEXT): ADMIN, MANAGER, TEACHER, PARENT, CHILD, ACCOUNTANT */
type AdminPortalUserRole = 'ADMIN' | 'MANAGER' | 'TEACHER' | 'PARENT' | 'CHILD' | 'ACCOUNTANT';

interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role?: AdminPortalUserRole;
  confirmed: boolean;
  active: boolean;
  access_level?: 'PENDING' | 'ACTIVE';
  phone?: string | null;
  client_number?: string | null;
  children_count?: number | null;
}

interface ChildRow {
  child_id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  active: boolean;
  confirmed: boolean;
  client_number?: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  parent_client_number?: string | null;
  group_name: string | null;
  access_level?: string | null;
}

interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

interface GroupRow {
  id: string;
  name: string;
  level: string | null;
  teacher_name: string | null;
  location_name: string | null;
  location_id: string | null;
  schedule: string | null;
  students_count: string;
  active: boolean;
  max_students: number;
  teacher_id: string | null;
  price_monthly?: string | number | null;
  price_yearly?: string | number | null;
  price_per_lesson?: string | number | null;
  has_schedule?: boolean;
  future_lessons_count?: number;
  missing_generated_lessons?: boolean;
  schedule_needs_confirmation?: boolean;
}

interface GroupYearLessonsRow {
  id: string;
  name: string;
  level: string | null;
  active: boolean;
  teacher_name: string | null;
  location_name: string | null;
  schedule: string | null;
  lessons_count: number;
  scheduled_count: number;
  completed_count: number;
  cancelled_count: number;
  lessons: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    duration_min: number;
  }>;
}

function priceFieldFromDb(value: unknown): string {
  if (value == null || value === '') return '';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return String(n);
}

/** @deprecated Cennik grupy wyłączony — zostawione na przyszłą automatyzację. */
function formatGroupPricePln(value: unknown): string | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} PLN`;
}

/** Cennik grupy wyłączony — zostawione na przyszłą automatyzację. */
function formatGroupPriceLines(
  group: Pick<GroupRow, 'price_monthly' | 'price_yearly' | 'price_per_lesson'>
): string[] {
  void formatGroupPricePln;
  void group;
  return [];
  /*
  const monthly = formatGroupPricePln(group.price_monthly);
  const yearly = formatGroupPricePln(group.price_yearly);
  const perLesson = formatGroupPricePln(group.price_per_lesson);
  return [
    monthly ? `ratalnie ${monthly}` : null,
    yearly ? `jednorazowo ${yearly}` : null,
    perLesson ? `za zajęcia ${perLesson}` : null,
  ].filter((line): line is string => Boolean(line));
  */
}

function isSchoolYearEndDatePassed(dateTo: string): boolean {
  const end = String(dateTo).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return todayYmdSchool() > end;
}

function formatSchoolYearEndDatePl(dateTo: string): string {
  const end = String(dateTo).slice(0, 10);
  const parsed = new Date(`${end}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return end;
  return parsed.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatSettlementMonthPl(periodMonth: string): string {
  const parsed = new Date(`${periodMonth}-01T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return periodMonth;
  const label = parsed.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface GroupDetail {
  group: {
    id: string;
    school_id?: string | null;
    location_id?: string | null;
    created_at?: string | null;
    name: string;
    level: string | null;
    teacher_id: string | null;
    teacher_name: string | null;
    location_name?: string | null;
    max_students: number;
    active: boolean;
    price_monthly?: string | number | null;
    price_yearly?: string | number | null;
    price_per_lesson?: string | number | null;
    teacher_pickup_consent?: boolean;
  };
  scheduleTemplates: Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    duration_min: number;
    location_id: string;
    location_name: string | null;
    future_lessons_count?: number;
    completed_lessons_count?: number;
  }>;
  students: Array<{
    id: string;
    child_id: string;
    first_name: string;
    last_name: string;
    birth_date: string;
    left_at: string | null;
    confirmed: boolean;
    lesson_unit_price?: string | null;
    monthly_unit_price?: string | null;
    yearly_unit_price?: string | null;
  }>;
  nearestLessons?: Array<{ id: string; scheduled_at: string; status: string }>;
  schoolYearLessons?: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    duration_min?: number;
  }>;
  generatedLessons?: {
    futureCount: number;
    completedCount: number;
    schoolYearCount?: number;
  };
  missingGeneratedLessons?: boolean;
  locations: Array<{ id: string; name: string }>;
  activeSchoolYear?: { id: string; name: string | null } | null;
  lessonsSchoolYear?: { id: string; name: string | null } | null;
  scheduleConfirmedForActiveYear?: boolean;
  scheduleNeedsConfirmation?: boolean;
}

interface SchoolYearRow {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  active?: boolean;
  isActive?: boolean;
}

interface SchoolYearHistoryData {
  year: {
    id: string;
    name: string;
    date_from: string;
    date_to: string;
    isActive: boolean;
    closed_at: string | null;
    closed_by_name: string | null;
  };
  summary: {
    groups_count: number;
    students_count: number;
    lessons_count: number;
    contracts_count: number;
  };
  teachers: Array<{
    id: string;
    name: string;
    groups_count: number;
    students_count: number;
    lessons_scheduled: number;
    lessons_completed: number;
    lessons_cancelled: number;
    total_hours: number;
    attendance_marked_count: number;
  }>;
  groups: Array<{
    id: string;
    name: string;
    level: string | null;
    teacher_name: string;
    active: boolean;
    students_count: number;
  }>;
  students: Array<{
    child_id: string;
    name: string;
    birth_date?: string;
    client_number?: string | null;
    parent_id?: string;
    parent_name?: string;
    parent_client_number?: string | null;
    group_id: string;
    group_name: string;
    teacher_name: string;
    enrolled_at: string;
    left_at: string | null;
  }>;
  parents?: Array<{
    parent_id: string;
    name: string;
    email: string;
    phone: string | null;
    client_number: string | null;
    children_count: number;
    children_names: string;
  }>;
  payments?: Array<{
    id: string;
    amount: number | null;
    status: string | null;
    due_date: string | null;
    paid_at: string | null;
    period_month: string | null;
    description: string | null;
    child_name: string | null;
    parent_name: string | null;
  }>;
  invoices?: Array<{
    id: string;
    invoice_number: string;
    issue_date: string;
    due_date: string;
    buyer_name: string;
    amount: number;
    item_name: string;
    has_pdf: boolean;
    payment_status: string | null;
    period_month: string | null;
    description: string | null;
    parent_name: string | null;
  }>;
  close_log: {
    closed_at: string;
    closed_by_name: string | null;
    lessons_cancelled: number;
    lessons_completed: number;
    groups_deactivated: number;
    memberships_closed: number;
    subscriptions_expired: number;
  } | null;
}

interface TeacherSettlementRow {
  teacher_id: string;
  teacher_name: string;
  group_id: string;
  group_name: string;
  location_id: string;
  location_name: string;
  period_month: string;
  lessons_count: number;
  students_count: number;
  total_duration_min: number;
}

interface LocationSettlementRow {
  location_id: string;
  location_name: string;
  teacher_id: string;
  teacher_name: string;
  period_month: string;
  lessons_count: number;
  total_duration_min: number;
}

interface SchoolHolidayRow {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  type: string;
}

interface SchoolLocationRow {
  id: string;
  name: string;
  town: string | null;
  facility: string | null;
  address: string | null;
  active: boolean;
  sort_order: number;
  is_featured: boolean;
  is_new: boolean;
  is_special: boolean;
}

const topTabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Pulpit' },
  { key: 'organization', label: 'Organizacja szkoły' },
  { key: 'classes', label: 'Zajęcia' },
  { key: 'enrollments', label: 'Zapisy / rezygnacje' },
  { key: 'announcements', label: 'Wiadomości' },
  { key: 'billing', label: 'Rozliczenia' },
  { key: 'settlements', label: 'Podsumowanie miesiąca' },
];

const mobileTabs: Array<{ key: MobileTab; label: string }> = [
  { key: 'organization', label: 'Szkoła' },
  { key: 'users', label: 'Uczniowie' },
  { key: 'more', label: 'Więcej' },
];

const organizationTabs: Array<{ key: OrganizationSubTab; label: string }> = [
  { key: 'schoolYear', label: 'Rok szkolny' },
  { key: 'teachers', label: 'Nauczyciele' },
  { key: 'locations', label: 'Lokalizacje' },
  { key: 'discounts', label: 'Tryb bez opłat' },
  { key: 'groups', label: 'Grupy' },
  { key: 'users', label: 'Użytkownicy' },
  { key: 'history', label: 'Historia' },
];

const enrollmentFlowTabs: Array<{ key: EnrollmentFlowSubTab; label: string }> = [
  { key: 'enrollment', label: 'Zgłoszenia' },
  { key: 'renewals', label: 'Odnowienia' },
  { key: 'resignations', label: 'Rezygnacje' },
];

const billingTabs: Array<{ key: BillingSubTab; label: string }> = [
  { key: 'summary', label: 'Zestawienie' },
  { key: 'invoices', label: 'Faktury' },
  { key: 'settings', label: 'Ustawienia' },
];

const billingSummaryKinds: Array<{ key: BillingSummaryKind; label: string }> = [
  { key: 'monthly', label: 'Ratalne' },
  { key: 'per_lesson', label: 'Za pojedyncze zajęcia' },
];

const teacherOrgSubTabs: Array<{ key: TeacherOrgSubTab; label: string }> = [
  { key: 'list', label: 'Lista nauczycieli' },
  { key: 'add', label: 'Dodaj nauczyciela' },
];

const locationOrgSubTabs: Array<{ key: LocationOrgSubTab; label: string }> = [
  { key: 'list', label: 'Lista lokalizacji' },
  { key: 'add', label: 'Dodaj lokalizację' },
  { key: 'specials', label: 'Pozycje specjalne' },
];
const usersSubTabs: Array<{ key: UsersSubTab; label: string }> = [
  { key: 'parents', label: 'Lista rodziców' },
  { key: 'children', label: 'Lista dzieci' },
  { key: 'teachers', label: 'Lista nauczycieli' },
  { key: 'managers', label: 'Lista managerów' },
  { key: 'accountants', label: 'Lista księgowych' },
  { key: 'add', label: 'Dodaj nowego użytkownika' },
];
const groupsSubTabs: Array<{ key: GroupsSubTab; label: string }> = [
  { key: 'list', label: 'Lista grup' },
  { key: 'add', label: 'Dodaj nową grupę' },
  { key: 'organize', label: 'Organizacja grup' },
  { key: 'yearLessons', label: 'Zajęcia w roku szkolnym' },
];

/** Wartości filtrów listy „Organizacja grup” (select); pusty string = wszystkie. */
const ORGANIZE_FILTER_NO_LOCATION = '__no_location__';
const ORGANIZE_FILTER_NO_TEACHER = '__no_teacher__';

interface AdminPortalProps {
  initialGroupId?: string;
}

function GroupSubTabButtons(props: {
  active: GroupsSubTab;
  setGroupsSubTab: Dispatch<SetStateAction<GroupsSubTab>>;
  onEnterAddTab: () => void;
  onOrganizeStateReset: () => void;
  onEnterListTab?: () => void;
  onEnterYearLessonsTab?: () => void;
}) {
  const {
    active,
    setGroupsSubTab,
    onEnterAddTab,
    onOrganizeStateReset,
    onEnterListTab,
    onEnterYearLessonsTab,
  } = props;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {groupsSubTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => {
            setGroupsSubTab((prev) => {
              const next: GroupsSubTab = tab.key;
              const leftOrganize =
                (prev as GroupsSubTab) === 'organize' && next !== 'organize';
              if (next === 'organize' || leftOrganize) {
                onOrganizeStateReset();
              }
              return next;
            });
            if (tab.key === 'list') {
              onEnterListTab?.();
            }
            if (tab.key === 'add') {
              onEnterAddTab();
            }
            if (tab.key === 'yearLessons') {
              onEnterYearLessonsTab?.();
            }
          }}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            active === tab.key
              ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
              : 'border-transparent bg-emerald-50/70 text-zinc-800 hover:border-emerald-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SkeletonBlock() {
  return <div className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />;
}

/** Brak danych z API — bez treści „placeholder” o przyszłych funkcjach. */
function EmptyDataPanel({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 text-center">
      <h3 className="text-lg font-semibold text-[#0f6e56]">{title}</h3>
      <p className="mt-3 text-sm text-zinc-600">Brak danych.</p>
    </section>
  );
}

export default function AdminPortal({ initialGroupId }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileTab, setMobileTab] = useState<MobileTab>('organization');
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);
  const { openCount: resignationsOpenCount, refresh: refreshResignationsOpenCount } =
    useOpenResignationsCount();
  const { pendingCount: enrollmentsPendingCount, refresh: refreshEnrollmentsPendingCount } =
    usePendingEnrollmentsCount();
  const [organizationSubTab, setOrganizationSubTab] = useState<OrganizationSubTab>(
    initialGroupId ? 'groups' : 'schoolYear',
  );
  const [enrollmentFlowSubTab, setEnrollmentFlowSubTab] =
    useState<EnrollmentFlowSubTab>('enrollment');
  const [billingSubTab, setBillingSubTab] = useState<BillingSubTab>('summary');
  const [billingSummaryKind, setBillingSummaryKind] = useState<BillingSummaryKind>('monthly');
  const [teacherOrgSubTab, setTeacherOrgSubTab] = useState<TeacherOrgSubTab>('list');
  const [locationOrgSubTab, setLocationOrgSubTab] = useState<LocationOrgSubTab>('list');
  const [groupsSubTab, setGroupsSubTab] = useState<GroupsSubTab>('list');
  const [schoolLocations, setSchoolLocations] = useState<SchoolLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [newLocationForm, setNewLocationForm] = useState({
    town: '',
    facility: '',
    address: '',
    sortOrder: '100',
    isNew: false,
    isFeatured: false,
  });
  const [newSpecialForm, setNewSpecialForm] = useState({
    name: '',
    sortOrder: '0',
    isNew: false,
    isFeatured: true,
  });
  const [editLocationId, setEditLocationId] = useState<string | null>(null);
  const [editLocationForm, setEditLocationForm] = useState({
    town: '',
    facility: '',
    name: '',
    address: '',
    isSpecial: false,
    isNew: false,
    isFeatured: false,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generateLessonsCount, setGenerateLessonsCount] = useState('30');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTab>('parents');
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: '' as '' | Exclude<AdminPortalUserRole, 'ADMIN'>,
  });
  const [newParentChildren, setNewParentChildren] = useState<Array<{
    firstName: string;
    lastName: string;
    birthDate: string;
    preferredLocationId: string;
  }>>([{ firstName: '', lastName: '', birthDate: '', preferredLocationId: '' }]);
  const [newTeacherForm, setNewTeacherForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [childModalOpen, setChildModalOpen] = useState(false);
  const [childForm, setChildForm] = useState({
    parentId: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    preferredLocationId: '',
    parentSearch: '',
  });
  const [enrollmentParents, setEnrollmentParents] = useState<EnrollmentParentRow[]>([]);
  const [enrollmentGroups, setEnrollmentGroups] = useState<EnrollmentGroupRow[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsSaving, setDiscountsSaving] = useState(false);
  const [discountPercentsDraft, setDiscountPercentsDraft] = useState({
    LARGE_FAMILY_CARD: '0',
    SIBLING: '0',
  });
  const [discountSettings, setDiscountSettings] = useState({
    LARGE_FAMILY_CARD: 0,
    SIBLING: 0,
    maxPercent: 10,
  });
  const [maxDiscountPercentDraft, setMaxDiscountPercentDraft] = useState('10');
  const [invoiceGenerationDayDraft, setInvoiceGenerationDayDraft] = useState('10');
  const [invoiceGenerationDay, setInvoiceGenerationDay] = useState(10);
  const [invoiceAutoGeneration, setInvoiceAutoGeneration] = useState(false);
  const [invoiceAutoGenerationDraft, setInvoiceAutoGenerationDraft] = useState(false);
  const [monthlyInvoicesGenerating, setMonthlyInvoicesGenerating] = useState(false);
  const [monthlyInvoiceMonth, setMonthlyInvoiceMonth] = useState(() => periodMonthKey());
  const [monthlyInvoicePreviewLoading, setMonthlyInvoicePreviewLoading] = useState(false);
  const [monthlyInvoicePreview, setMonthlyInvoicePreview] = useState<{
    periodMonth: string;
    dueDate: string;
    parents: Array<{
      parentId: string;
      parentFirstName: string;
      parentLastName: string;
      parentEmail: string;
      totalAmount: number;
      alreadyInvoiced: boolean;
      lines: Array<{
        contractId: string;
        childId: string | null;
        childName: string;
        amount: number;
        alreadyInvoiced: boolean;
        signedAt: string | null;
      }>;
    }>;
    heldParents: Array<{
      parentId: string;
      parentFirstName: string;
      parentLastName: string;
      parentEmail: string;
      totalAmount: number;
      alreadyInvoiced: boolean;
      lines: Array<{
        contractId: string;
        childId: string | null;
        childName: string;
        amount: number;
        alreadyInvoiced: boolean;
        signedAt: string | null;
      }>;
    }>;
    totals: {
      parents: number;
      lines: number;
      amount: number;
      pendingAmount: number;
      alreadyInvoicedLines: number;
    };
  } | null>(null);
  const [invoiceHoldBusyContractId, setInvoiceHoldBusyContractId] = useState<string | null>(null);
  const [issuedInvoicesLoading, setIssuedInvoicesLoading] = useState(false);
  const [verifyPaymentsBusy, setVerifyPaymentsBusy] = useState(false);
  const [unmatchedTransfersLoading, setUnmatchedTransfersLoading] = useState(false);
  const [unmatchedTransfers, setUnmatchedTransfers] = useState<
    Array<{
      id: string;
      transactionDate: string;
      bookingDate: string;
      counterparty: string;
      title: string;
      amount: number;
      currency: string;
      bankTransactionId: string | null;
    }>
  >([]);
  const [manualMatchInvoices, setManualMatchInvoices] = useState<
    Array<{
      invoiceId: string;
      paymentId: string;
      invoiceNumber: string;
      buyerName: string;
      amount: number;
      periodMonth: string | null;
      issueDate: string;
    }>
  >([]);
  const [manualMatchSelection, setManualMatchSelection] = useState<Record<string, string>>({});
  const [manualMatchBusyId, setManualMatchBusyId] = useState<string | null>(null);
  const [issuedInvoices, setIssuedInvoices] = useState<
    Array<{
      id: string;
      invoiceNumber: string;
      documentType: string;
      issueDate: string;
      dueDate: string;
      buyerName: string;
      buyerNip: string | null;
      amount: number;
      paymentStatus: string | null;
      kind: string;
      hasPdf: boolean;
      parentEmail: string | null;
      parentName: string;
    }>
  >([]);
  const [complimentaryParents, setComplimentaryParents] = useState<ComplimentaryParentRow[]>([]);
  const [complimentaryCandidates, setComplimentaryCandidates] = useState<
    Array<{
      key: string;
      source: 'USER' | 'ENROLLMENT';
      parentId: string | null;
      parentEmail: string | null;
      firstName: string;
      lastName: string;
      email: string;
    }>
  >([]);
  const [selectedComplimentaryCandidateKey, setSelectedComplimentaryCandidateKey] = useState('');
  const [complimentarySearch, setComplimentarySearch] = useState('');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupForm, setGroupForm] = useState({
    id: '',
    schoolId: '',
    locationId: '',
    name: '',
    level: '',
    teacherId: '',
    maxStudents: 12,
    active: true,
    priceMonthly: '',
    priceYearly: '',
    pricePerLesson: '',
    teacherPickupConsent: false,
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [organizeExpandedGroupId, setOrganizeExpandedGroupId] = useState<string | null>(null);
  const [organizeLoadingGroupId, setOrganizeLoadingGroupId] = useState<string | null>(null);
  const [organizeFilterName, setOrganizeFilterName] = useState('');
  const [organizeFilterLocation, setOrganizeFilterLocation] = useState('');
  const [yearLessonsYearId, setYearLessonsYearId] = useState('');
  const [yearLessonsLoading, setYearLessonsLoading] = useState(false);
  const [yearLessonsGroups, setYearLessonsGroups] = useState<GroupYearLessonsRow[]>([]);
  const [yearLessonsSchoolYear, setYearLessonsSchoolYear] = useState<{
    id: string;
    name: string | null;
    date_from: string;
    date_to: string;
  } | null>(null);
  const [yearLessonsExpandedGroupId, setYearLessonsExpandedGroupId] = useState<string | null>(null);
  const [lessonBillingMonth, setLessonBillingMonth] = useState(() => periodMonthKey());
  const [lessonBillingRows, setLessonBillingRows] = useState<
    Array<{
      childId: string;
      parentId: string;
      contractId: string;
      firstName: string;
      lastName: string;
      parentEmail: string;
      lessonUnitPrice: string | null;
      billing: {
        id: string;
        status: string;
        amount: string | null;
        lessonsCount: number | null;
        paymentId: string | null;
      } | null;
      attendanceSummary: { present: number; absent: number };
    }>
  >([]);
  const [lessonBillingLoading, setLessonBillingLoading] = useState(false);
  const [lessonBillingDrafts, setLessonBillingDrafts] = useState<
    Record<string, { amount: string; lessonsCount: string }>
  >({});
  const [lessonBillingBusyChildId, setLessonBillingBusyChildId] = useState<string | null>(null);
  const [lessonInvoicesGenerating, setLessonInvoicesGenerating] = useState(false);
  const [organizeFilterTeacher, setOrganizeFilterTeacher] = useState('');
  const [groupLoading, setGroupLoading] = useState(false);
  const [initialGroupLoaded, setInitialGroupLoaded] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: 1,
    startTime: '16:00',
    locationId: '',
    durationMin: 60,
  });
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [schoolYearLoading, setSchoolYearLoading] = useState(false);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRow[]>([]);
  const [historyYearId, setHistoryYearId] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<SchoolYearHistoryData | null>(null);
  const [historySection, setHistorySection] = useState<'summary' | 'details'>('summary');
  const [historyDetailsTab, setHistoryDetailsTab] = useState<
    'children' | 'parents' | 'payments' | 'invoices'
  >('children');
  const [settlementYearId, setSettlementYearId] = useState('');
  const [settlementMonth, setSettlementMonth] = useState('');
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [teacherSettlementRows, setTeacherSettlementRows] = useState<TeacherSettlementRow[]>([]);
  const [locationSettlementRows, setLocationSettlementRows] = useState<LocationSettlementRow[]>([]);
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHolidayRow[]>([]);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    type: 'HOLIDAY' as 'HOLIDAY' | 'PUBLIC' | 'SCHOOL' | 'CANCELLED',
    parentMessage: '',
  });
  const [newYearModalOpen, setNewYearModalOpen] = useState(false);
  const [newYearForm, setNewYearForm] = useState({ name: '', dateFrom: '', dateTo: '' });
  const [closeYearModal, setCloseYearModal] = useState<{ id: string; name: string } | null>(null);
  const [editYearModal, setEditYearModal] = useState<SchoolYearRow | null>(null);
  /** `school_id` zalogowanego użytkownika (ADMIN może mieć `null`). */
  const [sessionSchoolId, setSessionSchoolId] = useState<string | null>(null);
  const [isManagerView, setIsManagerView] = useState(false);
  const [classesCalRefreshSignal, setClassesCalRefreshSignal] = useState(0);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const loadEnrollmentData = useCallback(async () => {
    try {
      const eRes = await fetch('/api/admin/enrollment', { cache: 'no-store' });
      if (!eRes.ok) {
        const errBody = (await eRes.json().catch(() => ({}))) as { message?: string };
        pushToast(
          'error',
          `Nie udało się wczytać zgłoszeń (${eRes.status})${errBody.message ? ` — ${errBody.message}` : ''}`,
        );
        return;
      }
      const eJson = await eRes.json();
      setEnrollmentParents(eJson.parents ?? []);
      setEnrollmentGroups(eJson.groups ?? []);
      void refreshEnrollmentsPendingCount();
    } catch {
      pushToast('error', 'Błąd wczytywania zgłoszeń');
    }
  }, [pushToast, refreshEnrollmentsPendingCount]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, cRes, eRes, gRes, dRes, meRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/children'),
        fetch('/api/admin/enrollment'),
        fetch('/api/admin/groups'),
        fetch('/api/admin/discounts'),
        fetch('/api/user/me'),
      ]);
      const failing: string[] = [];
      if (!uRes.ok) failing.push(`users(${uRes.status})`);
      if (!cRes.ok) failing.push(`children(${cRes.status})`);
      if (!eRes.ok) failing.push(`enrollment(${eRes.status})`);
      if (!gRes.ok) failing.push(`groups(${gRes.status})`);

      if (uRes.ok) {
        const uJson = await uRes.json();
        setUsers((uJson.users ?? []) as AdminUser[]);
      }
      if (cRes.ok) {
        const cJson = await cRes.json();
        setChildren((cJson.children ?? []) as ChildRow[]);
      }
      if (eRes.ok) {
        const eJson = await eRes.json();
        setEnrollmentParents(eJson.parents ?? []);
        setEnrollmentGroups(eJson.groups ?? []);
        void refreshEnrollmentsPendingCount();
      }
      if (gRes.ok) {
        const gJson = await gRes.json();
        setGroups((gJson.groups ?? []) as GroupRow[]);
      }

      if (failing.length > 0) {
        let detail = "";
        try {
          const errBody = !eRes.ok ? await eRes.clone().json() : null;
          if (errBody?.message) detail = ` — ${errBody.message}`;
        } catch {
          /* ignore */
        }
        pushToast(
          'error',
          `Część danych panelu nie została wczytana: ${failing.join(', ')}${detail}`,
        );
      }

      if (dRes.ok) {
        const dJson = (await dRes.json()) as {
          discounts?: Array<{ key: string; percent: number }>;
          maxDiscountPercent?: number;
          invoiceGenerationDay?: number;
          invoiceAutoGeneration?: boolean;
          complimentaryParents?: ComplimentaryParentRow[];
        };
        const nextSettings = {
          LARGE_FAMILY_CARD: 0,
          SIBLING: 0,
          maxPercent: Math.min(100, Math.max(0, Number(dJson.maxDiscountPercent) || 10)),
        };
        for (const item of dJson.discounts ?? []) {
          if (item.key === 'LARGE_FAMILY_CARD' || item.key === 'SIBLING') {
            nextSettings[item.key] = Number(item.percent) || 0;
          }
        }
        setDiscountSettings(nextSettings);
        setDiscountPercentsDraft({
          LARGE_FAMILY_CARD: String(nextSettings.LARGE_FAMILY_CARD),
          SIBLING: String(nextSettings.SIBLING),
        });
        setMaxDiscountPercentDraft(String(nextSettings.maxPercent));
        const genDay = Math.min(28, Math.max(1, Number(dJson.invoiceGenerationDay) || 10));
        setInvoiceGenerationDay(genDay);
        setInvoiceGenerationDayDraft(String(genDay));
        const autoGen = Boolean(dJson.invoiceAutoGeneration);
        setInvoiceAutoGeneration(autoGen);
        setInvoiceAutoGenerationDraft(autoGen);
        setComplimentaryParents(
          Array.isArray(dJson.complimentaryParents) ? dJson.complimentaryParents : [],
        );
      }
      if (meRes.ok) {
        const meJson = (await meRes.json()) as { user?: { schoolId?: string | null; role?: string } };
        const sid = meJson.user?.schoolId ?? null;
        setSessionSchoolId(sid);
        setIsManagerView(meJson.user?.role === 'MANAGER');
        if (meJson.user?.role === 'MANAGER' && !sid) {
          pushToast('error', 'Konto zarządcy nie ma przypisanej szkoły — skontaktuj się z administratorem.');
        }
      } else {
        setSessionSchoolId(null);
        setIsManagerView(false);
      }
    } catch (error) {
      console.error(error);
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Błąd pobierania danych panelu',
      );
    } finally {
      setLoading(false);
    }
  }, [pushToast, refreshEnrollmentsPendingCount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadLessonBilling = useCallback(async () => {
    setLessonBillingLoading(true);
    try {
      const res = await fetch(
        `/api/admin/lesson-billing?periodMonth=${encodeURIComponent(lessonBillingMonth)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        rows?: typeof lessonBillingRows;
        message?: string;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się wczytać rozliczeń');
        setLessonBillingRows([]);
        return;
      }
      const rows = data.rows ?? [];
      setLessonBillingRows(rows);
      setLessonBillingDrafts(() => {
        const next: Record<string, { amount: string; lessonsCount: string }> = {};
        for (const row of rows) {
          next[row.childId] = {
            amount: row.billing?.amount ?? '',
            lessonsCount:
              row.billing?.lessonsCount != null ? String(row.billing.lessonsCount) : '',
          };
        }
        return next;
      });
    } catch {
      pushToast('error', 'Błąd wczytywania rozliczeń');
    } finally {
      setLessonBillingLoading(false);
    }
  }, [lessonBillingMonth, pushToast]);

  useEffect(() => {
    if (billingSubTab === 'summary') {
      setLessonBillingMonth(monthlyInvoiceMonth);
    }
  }, [billingSubTab, monthlyInvoiceMonth]);

  useEffect(() => {
    if (
      activeTab === 'billing' &&
      billingSubTab === 'summary' &&
      billingSummaryKind === 'per_lesson'
    ) {
      void loadLessonBilling();
    }
  }, [activeTab, billingSubTab, billingSummaryKind, lessonBillingMonth, loadLessonBilling]);

  useEffect(() => {
    if (activeTab === 'enrollments' && enrollmentFlowSubTab === 'enrollment') {
      void loadEnrollmentData();
    }
  }, [activeTab, enrollmentFlowSubTab, loadEnrollmentData]);

  const loadSchoolYearData = useCallback(async () => {
    setSchoolYearLoading(true);
    try {
      const yRes = await fetch('/api/admin/school-years');
      const yJson = (await yRes.json().catch(() => ({}))) as { years?: SchoolYearRow[]; message?: string };
      if (!yRes.ok) {
        pushToast(
          'error',
          yJson.message ?? `Nie udało się pobrać lat szkolnych (HTTP ${yRes.status}).`,
        );
        return;
      }
      const years = (yJson.years ?? []) as SchoolYearRow[];
      setSchoolYears(years);
      const active = years.find((y) => y.isActive ?? y.active);
      const hRes = await fetch(
        active?.id
          ? `/api/admin/school-holidays?school_year_id=${encodeURIComponent(active.id)}`
          : '/api/admin/school-holidays'
      );
      const hJson = (await hRes.json().catch(() => ({}))) as { holidays?: SchoolHolidayRow[]; message?: string };
      if (!hRes.ok) {
        console.error('school-holidays GET', hRes.status, hJson);
        pushToast(
          'error',
          hJson.message ?? `Nie udało się pobrać dni wolnych (HTTP ${hRes.status}). Lista w roku może być pusta.`,
        );
        setSchoolHolidays([]);
        return;
      }
      setSchoolHolidays((hJson.holidays ?? []) as SchoolHolidayRow[]);
    } catch (e) {
      console.error('loadSchoolYearData', e);
      pushToast(
        'error',
        e instanceof Error ? e.message : 'Nie udało się pobrać roku szkolnego / dni wolnych',
      );
    } finally {
      setSchoolYearLoading(false);
    }
  }, [pushToast]);

  const loadHistoryData = useCallback(async (yearId: string) => {
    if (!yearId) {
      setHistoryData(null);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/school-years/${encodeURIComponent(yearId)}/history`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => ({}))) as SchoolYearHistoryData & { message?: string };
      if (!res.ok) {
        pushToast('error', json.message ?? `Nie udało się pobrać historii (HTTP ${res.status}).`);
        setHistoryData(null);
        return;
      }
      setHistoryData(json);
    } catch (e) {
      console.error('loadHistoryData', e);
      pushToast('error', 'Błąd wczytywania historii roku szkolnego');
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [pushToast]);

  const loadSettlementData = useCallback(async (yearId: string, periodMonth: string) => {
    if (!yearId) {
      setTeacherSettlementRows([]);
      setLocationSettlementRows([]);
      return;
    }
    setSettlementLoading(true);
    try {
      const monthParam = periodMonth ? `&period_month=${encodeURIComponent(periodMonth)}` : '';
      const base = `school_year_id=${encodeURIComponent(yearId)}${monthParam}`;
      const [tRes, lRes] = await Promise.all([
        fetch(`/api/admin/reports/teacher-settlement?${base}`, { cache: 'no-store' }),
        fetch(`/api/admin/reports/location-settlement?${base}`, { cache: 'no-store' }),
      ]);
      const tJson = (await tRes.json().catch(() => ({}))) as {
        rows?: TeacherSettlementRow[];
        message?: string;
      };
      const lJson = (await lRes.json().catch(() => ({}))) as {
        rows?: LocationSettlementRow[];
        message?: string;
      };
      if (!tRes.ok) {
        pushToast('error', tJson.message ?? `Błąd raportu lektorów (HTTP ${tRes.status})`);
        setTeacherSettlementRows([]);
      } else {
        setTeacherSettlementRows(tJson.rows ?? []);
      }
      if (!lRes.ok) {
        pushToast('error', lJson.message ?? `Błąd raportu lokalizacji (HTTP ${lRes.status})`);
        setLocationSettlementRows([]);
      } else {
        setLocationSettlementRows(lJson.rows ?? []);
      }
    } catch (e) {
      console.error('loadSettlementData', e);
      pushToast('error', 'Błąd wczytywania rozliczeń');
      setTeacherSettlementRows([]);
      setLocationSettlementRows([]);
    } finally {
      setSettlementLoading(false);
    }
  }, [pushToast]);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    try {
      const res = await fetch('/api/admin/locations');
      const data = (await res.json().catch(() => ({}))) as {
        locations?: SchoolLocationRow[];
        message?: string;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać lokalizacji');
        setSchoolLocations([]);
        return;
      }
      setSchoolLocations(
        Array.isArray(data.locations)
          ? data.locations.map((loc) => ({
              ...loc,
              town: loc.town ?? null,
              facility: loc.facility ?? null,
              is_new: Boolean(loc.is_new),
              is_special: Boolean(loc.is_special),
              is_featured: Boolean(loc.is_featured),
              sort_order: Number(loc.sort_order) || 100,
            }))
          : [],
      );
    } catch (e) {
      console.error('loadLocations', e);
      pushToast('error', 'Błąd pobierania lokalizacji');
      setSchoolLocations([]);
    } finally {
      setLocationsLoading(false);
    }
  }, [pushToast]);

  const saveLocationDisplay = useCallback(
    async (
      locationId: string,
      patch: { sort_order?: number; is_featured?: boolean; is_new?: boolean },
      options?: { silent?: boolean },
    ) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/locations/${encodeURIComponent(locationId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? 'Nie udało się zapisać ustawień lokalizacji');
        }
        setSchoolLocations((prev) =>
          prev
            .map((loc) =>
              loc.id === locationId
                ? {
                    ...loc,
                    ...(patch.sort_order !== undefined ? { sort_order: patch.sort_order } : {}),
                    ...(patch.is_featured !== undefined ? { is_featured: patch.is_featured } : {}),
                    ...(patch.is_new !== undefined ? { is_new: patch.is_new } : {}),
                  }
                : loc,
            )
            .sort((a, b) => {
              if (a.is_special !== b.is_special) return a.is_special ? 1 : -1;
              if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
              if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
              return a.name.localeCompare(b.name, 'pl');
            }),
        );
        if (!options?.silent) {
          pushToast('success', 'Zapisano ustawienia wyświetlania');
        }
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'Błąd zapisu');
        await loadLocations();
      } finally {
        setBusy(false);
      }
    },
    [loadLocations, pushToast],
  );

  const loadDiscounts = useCallback(async () => {
    setDiscountsLoading(true);
    try {
      const res = await fetch('/api/admin/discounts');
      const data = (await res.json().catch(() => ({}))) as {
        discounts?: Array<{ key: string; label: string; percent: number }>;
        maxDiscountPercent?: number;
        invoiceGenerationDay?: number;
        invoiceAutoGeneration?: boolean;
        complimentaryParents?: typeof complimentaryParents;
        complimentaryCandidates?: typeof complimentaryCandidates;
        message?: string;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać ustawień zniżek');
        return;
      }
      const nextSettings = {
        LARGE_FAMILY_CARD: 0,
        SIBLING: 0,
        maxPercent: Math.min(100, Math.max(0, Number(data.maxDiscountPercent) || 10)),
      };
      for (const item of data.discounts ?? []) {
        if (item.key === 'LARGE_FAMILY_CARD' || item.key === 'SIBLING') {
          nextSettings[item.key] = Number(item.percent) || 0;
        }
      }
      setDiscountSettings(nextSettings);
      setDiscountPercentsDraft({
        LARGE_FAMILY_CARD: String(nextSettings.LARGE_FAMILY_CARD),
        SIBLING: String(nextSettings.SIBLING),
      });
      setMaxDiscountPercentDraft(String(nextSettings.maxPercent));
      const genDay = Math.min(28, Math.max(1, Number(data.invoiceGenerationDay) || 10));
      setInvoiceGenerationDay(genDay);
      setInvoiceGenerationDayDraft(String(genDay));
      const autoGen = Boolean(data.invoiceAutoGeneration);
      setInvoiceAutoGeneration(autoGen);
      setInvoiceAutoGenerationDraft(autoGen);
      setComplimentaryParents(
        Array.isArray(data.complimentaryParents) ? data.complimentaryParents : [],
      );
      setComplimentaryCandidates(
        Array.isArray(data.complimentaryCandidates) ? data.complimentaryCandidates : [],
      );
    } catch (e) {
      console.error('loadDiscounts', e);
      pushToast('error', 'Błąd pobierania ustawień zniżek');
    } finally {
      setDiscountsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (
      activeTab === 'organization' &&
      (organizationSubTab === 'schoolYear' ||
        organizationSubTab === 'history' ||
        organizationSubTab === 'groups')
    ) {
      void loadSchoolYearData();
    }
  }, [activeTab, organizationSubTab, loadSchoolYearData]);

  useEffect(() => {
    if (activeTab === 'settlements') {
      void loadSchoolYearData();
    }
  }, [activeTab, loadSchoolYearData]);

  useEffect(() => {
    if (activeTab !== 'organization' || organizationSubTab !== 'history') return;
    // Historia dotyczy tylko lat zamkniętych / nieaktywnych — bez bieżącego.
    const selectable = schoolYears
      .filter((y) => !(y.isActive ?? y.active))
      .slice()
      .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'));
    if (selectable.length === 0) {
      setHistoryYearId('');
      setHistoryData(null);
      return;
    }
    if (!historyYearId || !selectable.some((y) => y.id === historyYearId)) {
      setHistoryYearId(selectable[0].id);
    }
  }, [activeTab, organizationSubTab, schoolYears, historyYearId]);

  useEffect(() => {
    if (activeTab === 'organization' && organizationSubTab === 'history' && historyYearId) {
      void loadHistoryData(historyYearId);
    }
  }, [activeTab, organizationSubTab, historyYearId, loadHistoryData]);

  useEffect(() => {
    if (activeTab !== 'settlements') return;
    const selectable = schoolYears
      .slice()
      .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'));
    if (selectable.length === 0) {
      setSettlementYearId('');
      return;
    }
    if (!settlementYearId || !selectable.some((y) => y.id === settlementYearId)) {
      const preferred =
        selectable.find((y) => y.isActive ?? y.active) ?? selectable[0];
      setSettlementYearId(preferred.id);
    }
  }, [activeTab, schoolYears, settlementYearId]);

  useEffect(() => {
    if (activeTab === 'settlements' && settlementYearId) {
      void loadSettlementData(settlementYearId, settlementMonth);
    }
  }, [activeTab, settlementYearId, settlementMonth, loadSettlementData]);

  useEffect(() => {
    if (activeTab !== 'organization' || organizationSubTab !== 'groups' || groupsSubTab !== 'yearLessons') {
      return;
    }
    const selectable = schoolYears
      .slice()
      .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'));
    if (selectable.length === 0) {
      setYearLessonsYearId('');
      return;
    }
    if (!yearLessonsYearId || !selectable.some((y) => y.id === yearLessonsYearId)) {
      const preferred =
        selectable.find((y) => y.isActive ?? y.active) ?? selectable[0];
      setYearLessonsYearId(preferred.id);
    }
  }, [activeTab, organizationSubTab, groupsSubTab, schoolYears, yearLessonsYearId]);

  const loadYearLessons = useCallback(async (schoolYearId: string) => {
    if (!schoolYearId) {
      setYearLessonsGroups([]);
      setYearLessonsSchoolYear(null);
      return;
    }
    setYearLessonsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/groups/year-lessons?schoolYearId=${encodeURIComponent(schoolYearId)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać zajęć grup');
        setYearLessonsGroups([]);
        setYearLessonsSchoolYear(null);
        return;
      }
      setYearLessonsSchoolYear(data.schoolYear ?? null);
      setYearLessonsGroups((data.groups ?? []) as GroupYearLessonsRow[]);
    } catch {
      pushToast('error', 'Nie udało się pobrać zajęć grup');
      setYearLessonsGroups([]);
      setYearLessonsSchoolYear(null);
    } finally {
      setYearLessonsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (
      activeTab !== 'organization' ||
      organizationSubTab !== 'groups' ||
      groupsSubTab !== 'yearLessons' ||
      !yearLessonsYearId
    ) {
      return;
    }
    void loadYearLessons(yearLessonsYearId);
  }, [activeTab, organizationSubTab, groupsSubTab, yearLessonsYearId, loadYearLessons]);

  useEffect(() => {
    if (activeTab === 'organization' && organizationSubTab === 'discounts') {
      void loadDiscounts();
    }
  }, [activeTab, organizationSubTab, loadDiscounts]);

  useEffect(() => {
    if (activeTab === 'billing') {
      void loadDiscounts();
    }
  }, [activeTab, loadDiscounts]);

  const loadMonthlyInvoicePreview = useCallback(async () => {
    setMonthlyInvoicePreviewLoading(true);
    try {
      const res = await fetch(
        `/api/admin/invoices/monthly-preview?periodMonth=${encodeURIComponent(monthlyInvoiceMonth)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        periodMonth?: string;
        dueDate?: string;
        parents?: NonNullable<typeof monthlyInvoicePreview>['parents'];
        heldParents?: NonNullable<typeof monthlyInvoicePreview>['heldParents'];
        totals?: NonNullable<typeof monthlyInvoicePreview>['totals'];
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać podglądu faktur');
        setMonthlyInvoicePreview(null);
        return;
      }
      setMonthlyInvoicePreview({
        periodMonth: data.periodMonth ?? `${monthlyInvoiceMonth}-01`,
        dueDate: data.dueDate ?? '',
        parents: data.parents ?? [],
        heldParents: data.heldParents ?? [],
        totals: data.totals ?? {
          parents: 0,
          lines: 0,
          amount: 0,
          pendingAmount: 0,
          alreadyInvoicedLines: 0,
        },
      });
    } catch {
      pushToast('error', 'Błąd podglądu faktur ratalnych');
      setMonthlyInvoicePreview(null);
    } finally {
      setMonthlyInvoicePreviewLoading(false);
    }
  }, [monthlyInvoiceMonth, pushToast]);

  const setMonthlyInvoiceHold = useCallback(
    async (contractId: string, held: boolean) => {
      setInvoiceHoldBusyContractId(contractId);
      try {
        const res = await fetch('/api/admin/invoices/holds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId,
            held,
            periodMonth: monthlyInvoiceMonth,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          periodMonth?: string;
          dueDate?: string;
          parents?: NonNullable<typeof monthlyInvoicePreview>['parents'];
          heldParents?: NonNullable<typeof monthlyInvoicePreview>['heldParents'];
          totals?: NonNullable<typeof monthlyInvoicePreview>['totals'];
        };
        if (!res.ok) {
          pushToast('error', data.message ?? 'Nie udało się zaktualizować wstrzymania');
          return;
        }
        setMonthlyInvoicePreview({
          periodMonth: data.periodMonth ?? `${monthlyInvoiceMonth}-01`,
          dueDate: data.dueDate ?? '',
          parents: data.parents ?? [],
          heldParents: data.heldParents ?? [],
          totals: data.totals ?? {
            parents: 0,
            lines: 0,
            amount: 0,
            pendingAmount: 0,
            alreadyInvoicedLines: 0,
          },
        });
        pushToast(
          'success',
          data.message ??
            (held ? 'Wstrzymano generowanie faktury' : 'Wznowiono generowanie faktury'),
        );
      } catch {
        pushToast('error', 'Błąd wstrzymania faktury');
      } finally {
        setInvoiceHoldBusyContractId(null);
      }
    },
    [monthlyInvoiceMonth, pushToast],
  );

  const loadIssuedInvoices = useCallback(async () => {
    setIssuedInvoicesLoading(true);
    try {
      const res = await fetch(
        `/api/admin/invoices?periodMonth=${encodeURIComponent(monthlyInvoiceMonth)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        invoices?: typeof issuedInvoices;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać faktur');
        setIssuedInvoices([]);
        return;
      }
      setIssuedInvoices(data.invoices ?? []);
    } catch {
      pushToast('error', 'Błąd pobierania faktur');
      setIssuedInvoices([]);
    } finally {
      setIssuedInvoicesLoading(false);
    }
  }, [monthlyInvoiceMonth, pushToast]);

  const loadUnmatchedTransfers = useCallback(async () => {
    setUnmatchedTransfersLoading(true);
    try {
      const res = await fetch('/api/admin/invoices/unmatched-transfers', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        transfers?: typeof unmatchedTransfers;
        pendingInvoices?: typeof manualMatchInvoices;
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się pobrać przelewów bez numeru klienta');
        setUnmatchedTransfers([]);
        setManualMatchInvoices([]);
        return;
      }
      setUnmatchedTransfers(data.transfers ?? []);
      setManualMatchInvoices(data.pendingInvoices ?? []);
    } catch {
      pushToast('error', 'Błąd pobierania przelewów bez numeru klienta');
      setUnmatchedTransfers([]);
      setManualMatchInvoices([]);
    } finally {
      setUnmatchedTransfersLoading(false);
    }
  }, [pushToast]);

  const verifyPayments = useCallback(async () => {
    setVerifyPaymentsBusy(true);
    try {
      const res = await fetch('/api/admin/invoices/verify-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodMonth: monthlyInvoiceMonth }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        matched?: unknown[];
      };
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się zweryfikować płatności');
        return;
      }
      pushToast('success', data.message ?? 'Weryfikacja płatności zakończona');
      await Promise.all([loadIssuedInvoices(), loadUnmatchedTransfers()]);
    } catch {
      pushToast('error', 'Błąd weryfikacji płatności');
    } finally {
      setVerifyPaymentsBusy(false);
    }
  }, [loadIssuedInvoices, loadUnmatchedTransfers, monthlyInvoiceMonth, pushToast]);

  const manualMatchTransfer = useCallback(
    async (transferId: string) => {
      const paymentId = String(manualMatchSelection[transferId] ?? '').trim();
      if (!paymentId) {
        pushToast('error', 'Wybierz fakturę do przypisania');
        return;
      }
      setManualMatchBusyId(transferId);
      try {
        const res = await fetch('/api/admin/invoices/manual-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferId, paymentId }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          pushToast('error', data.message ?? 'Nie udało się oznaczyć płatności');
          return;
        }
        pushToast('success', data.message ?? 'Płatność oznaczona jako opłacona');
        setManualMatchSelection((prev) => {
          const next = { ...prev };
          delete next[transferId];
          return next;
        });
        await Promise.all([loadIssuedInvoices(), loadUnmatchedTransfers()]);
      } catch {
        pushToast('error', 'Błąd ręcznego przypisania płatności');
      } finally {
        setManualMatchBusyId(null);
      }
    },
    [loadIssuedInvoices, loadUnmatchedTransfers, manualMatchSelection, pushToast],
  );

  useEffect(() => {
    if (activeTab === 'billing' && billingSubTab === 'summary') {
      void loadMonthlyInvoicePreview();
    }
  }, [activeTab, billingSubTab, loadMonthlyInvoicePreview]);

  useEffect(() => {
    if (activeTab === 'billing' && billingSubTab === 'invoices') {
      void loadIssuedInvoices();
      void loadUnmatchedTransfers();
    }
  }, [activeTab, billingSubTab, loadIssuedInvoices, loadUnmatchedTransfers]);

  useEffect(() => {
    if (
      activeTab === 'enrollments' &&
      (enrollmentFlowSubTab === 'enrollment' || enrollmentFlowSubTab === 'renewals')
    ) {
      void loadDiscounts();
    }
  }, [activeTab, enrollmentFlowSubTab, loadDiscounts]);

  useEffect(() => {
    const needLocations =
      childModalOpen ||
      activeTab === 'classes' ||
      (activeTab === 'organization' && organizationSubTab === 'locations') ||
      (activeTab === 'organization' &&
        organizationSubTab === 'users' &&
        usersSubTab === 'add');
    if (needLocations) void loadLocations();
  }, [activeTab, organizationSubTab, usersSubTab, childModalOpen, loadLocations]);

  useEffect(() => {
    if (mobileTab === 'organization') setActiveTab('organization');
    if (mobileTab === 'users') {
      setActiveTab('organization');
      setOrganizationSubTab('users');
    }
  }, [mobileTab]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (isManagerView && user.role === 'ADMIN') return false;
      if (!showInactive && !user.active) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        user.first_name.toLowerCase().includes(q) ||
        user.last_name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
      );
    });
  }, [users, isManagerView, showInactive, search]);

  const calendarTeachers = useMemo(() => {
    return users
      .filter((u) => u.role === 'TEACHER' && u.active)
      .map((u) => ({ id: u.id, first_name: u.first_name, last_name: u.last_name }))
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'pl'),
      );
  }, [users]);

  const parentOptions = useMemo(
    () =>
      users.filter((u) => u.role === 'PARENT' && u.active).filter((u) => {
        const q = childForm.parentSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      }),
    [users, childForm.parentSearch]
  );

  const matchesComplimentarySearch = useCallback(
    (firstName: string, lastName: string, email: string) => {
      const query = complimentarySearch.trim().toLocaleLowerCase('pl');
      if (!query) return true;
      const haystack = [
        firstName,
        lastName,
        `${firstName} ${lastName}`,
        `${lastName} ${firstName}`,
        email,
      ]
        .join(' ')
        .toLocaleLowerCase('pl');
      return query
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token));
    },
    [complimentarySearch],
  );

  const filteredComplimentaryCandidates = useMemo(
    () =>
      complimentaryCandidates.filter((candidate) =>
        matchesComplimentarySearch(candidate.firstName, candidate.lastName, candidate.email),
      ),
    [complimentaryCandidates, matchesComplimentarySearch],
  );

  const filteredComplimentaryParents = useMemo(
    () =>
      complimentaryParents.filter((parent) =>
        matchesComplimentarySearch(parent.firstName, parent.lastName, parent.email),
      ),
    [complimentaryParents, matchesComplimentarySearch],
  );

  useEffect(() => {
    if (
      selectedComplimentaryCandidateKey &&
      !filteredComplimentaryCandidates.some(
        (candidate) => candidate.key === selectedComplimentaryCandidateKey,
      )
    ) {
      setSelectedComplimentaryCandidateKey('');
    }
  }, [filteredComplimentaryCandidates, selectedComplimentaryCandidateKey]);

  const organizeFilterNameOptions = useMemo(() => {
    const set = new Set(groups.map((g) => g.name).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [groups]);

  const organizeFilterLocationOptions = useMemo(() => {
    const set = new Set(
      groups.map((g) => (g.location_name && g.location_name.trim() ? g.location_name : null)).filter(Boolean) as string[],
    );
    return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [groups]);

  const organizeFilterTeacherOptions = useMemo(() => {
    const set = new Set(
      groups.map((g) => (g.teacher_name && g.teacher_name.trim() ? g.teacher_name : null)).filter(Boolean) as string[],
    );
    return [...set].sort((a, b) => a.localeCompare(b, 'pl'));
  }, [groups]);

  const organizeHasGroupsWithoutLocation = useMemo(
    () => groups.some((g) => !g.location_name?.trim()),
    [groups],
  );
  const organizeHasGroupsWithoutTeacher = useMemo(
    () => groups.some((g) => !g.teacher_name?.trim()),
    [groups],
  );

  const organizeFilteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (organizeFilterName && g.name !== organizeFilterName) return false;
      if (organizeFilterLocation) {
        if (organizeFilterLocation === ORGANIZE_FILTER_NO_LOCATION) {
          if (g.location_name?.trim()) return false;
        } else if ((g.location_name ?? '') !== organizeFilterLocation) return false;
      }
      if (organizeFilterTeacher) {
        if (organizeFilterTeacher === ORGANIZE_FILTER_NO_TEACHER) {
          if (g.teacher_name?.trim()) return false;
        } else if ((g.teacher_name ?? '') !== organizeFilterTeacher) return false;
      }
      return true;
    });
  }, [groups, organizeFilterName, organizeFilterLocation, organizeFilterTeacher]);

  useEffect(() => {
    if (organizeFilterName && !organizeFilterNameOptions.includes(organizeFilterName)) {
      setOrganizeFilterName('');
    }
  }, [organizeFilterName, organizeFilterNameOptions]);

  useEffect(() => {
    if (!organizeFilterLocation) return;
    if (organizeFilterLocation === ORGANIZE_FILTER_NO_LOCATION) {
      if (!organizeHasGroupsWithoutLocation) setOrganizeFilterLocation('');
      return;
    }
    if (!organizeFilterLocationOptions.includes(organizeFilterLocation)) {
      setOrganizeFilterLocation('');
    }
  }, [
    organizeFilterLocation,
    organizeFilterLocationOptions,
    organizeHasGroupsWithoutLocation,
  ]);

  useEffect(() => {
    if (!organizeFilterTeacher) return;
    if (organizeFilterTeacher === ORGANIZE_FILTER_NO_TEACHER) {
      if (!organizeHasGroupsWithoutTeacher) setOrganizeFilterTeacher('');
      return;
    }
    if (!organizeFilterTeacherOptions.includes(organizeFilterTeacher)) {
      setOrganizeFilterTeacher('');
    }
  }, [
    organizeFilterTeacher,
    organizeFilterTeacherOptions,
    organizeHasGroupsWithoutTeacher,
  ]);

  useEffect(() => {
    if (groupsSubTab !== 'organize' || !organizeExpandedGroupId) return;
    if (!organizeFilteredGroups.some((g) => g.id === organizeExpandedGroupId)) {
      setOrganizeExpandedGroupId(null);
      setSelectedGroupId(null);
      setGroupDetail(null);
    }
  }, [groupsSubTab, organizeExpandedGroupId, organizeFilteredGroups]);

  const resetGroupsToList = useCallback(() => {
    setSelectedGroupId(null);
    setGroupDetail(null);
    setOrganizeExpandedGroupId(null);
    setGroupsSubTab('list');
  }, []);

  const populateGroupFormFromGroup = useCallback(
    (g: GroupDetail['group']) => {
      const name = g.name;
      setGroupForm({
        id: g.id,
        schoolId: g.school_id ?? sessionSchoolId ?? '',
        locationId: g.location_id ?? '',
        name,
        level: (g.level && String(g.level).trim()) || detectLevelFromGroupName(name) || '',
        teacherId: g.teacher_id ?? '',
        maxStudents: g.max_students,
        active: g.active,
        priceMonthly: priceFieldFromDb(g.price_monthly),
        priceYearly: priceFieldFromDb(g.price_yearly),
        pricePerLesson: priceFieldFromDb(g.price_per_lesson),
        teacherPickupConsent: Boolean(g.teacher_pickup_consent),
      });
    },
    [sessionSchoolId],
  );

  const loadGroupDetail = useCallback(async (groupId: string, options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    if (quiet) setOrganizeLoadingGroupId(groupId);
    else setGroupLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${groupId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się pobrać szczegółów grupy');
      const detail = data as GroupDetail;
      setGroupDetail(detail);
      setSelectedGroupId(groupId);
      populateGroupFormFromGroup(detail.group);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd pobierania grupy');
    } finally {
      if (quiet) setOrganizeLoadingGroupId(null);
      else setGroupLoading(false);
    }
  }, [pushToast, populateGroupFormFromGroup]);

  const getGroupDetailReloadOptions = useCallback(
    (groupId: string): { quiet?: boolean } | undefined => {
      if (groupsSubTab === 'organize' && organizeExpandedGroupId === groupId) {
        return { quiet: true };
      }
      if (groupsSubTab === 'add' && groupForm.id === groupId) {
        return { quiet: true };
      }
      return undefined;
    },
    [groupsSubTab, organizeExpandedGroupId, groupForm.id],
  );

  const resolveGroupLocationName = useCallback(
    (locationId: string) => {
      if (!locationId) return '';
      const fromDetail = groupDetail?.locations?.find((loc) => loc.id === locationId);
      if (fromDetail?.name) return fromDetail.name;
      return schoolLocations.find((loc) => loc.id === locationId)?.name ?? '';
    },
    [groupDetail?.locations, schoolLocations],
  );

  const activeGroupNamesForPreview = useMemo(
    () => groups.filter((g) => g.active).map((g) => g.name),
    [groups],
  );

  const computeAutoGroupName = useCallback(
    (level: string, locationId: string) =>
      previewAutoGroupName({
        level,
        locationName: resolveGroupLocationName(locationId),
        activeGroupNames: activeGroupNamesForPreview,
      }),
    [activeGroupNamesForPreview, resolveGroupLocationName],
  );

  const saveGroupForm = useCallback(async () => {
    if (!groupForm.id) return;
    if (!groupForm.teacherId) {
      pushToast('error', 'Wybierz nauczyciela dla grupy');
      return;
    }
    setGroupSaving(true);
    try {
      const res = await fetch(`/api/admin/groups/${groupForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: groupForm.teacherId,
          maxStudents: groupForm.maxStudents,
          active: groupForm.active,
          priceMonthly: null,
          priceYearly: null,
          pricePerLesson: null,
          teacherPickupConsent: groupForm.teacherPickupConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast('error', data.message ?? 'Nie udało się zapisać grupy');
        return;
      }
      pushToast('success', 'Grupa zaktualizowana');
      await loadData();
      await loadGroupDetail(groupForm.id, getGroupDetailReloadOptions(groupForm.id));
    } catch {
      pushToast('error', 'Nie udało się zapisać grupy');
    } finally {
      setGroupSaving(false);
    }
  }, [groupForm, pushToast, loadData, loadGroupDetail, getGroupDetailReloadOptions]);

  useEffect(() => {
    if (!initialGroupId || initialGroupLoaded) return;
    void loadGroupDetail(initialGroupId);
    setInitialGroupLoaded(true);
  }, [initialGroupId, initialGroupLoaded, loadGroupDetail]);

  const loadChildren = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/children?active=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się pobrać listy dzieci');
      setChildren((data.children ?? []) as ChildRow[]);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd pobierania dzieci');
    }
  }, [pushToast]);

  const openAddStudentModal = useCallback(() => {
    setStudentSearch('');
    setSelectedChildId('');
    setAddStudentModalOpen(true);
    void loadChildren();
  }, [loadChildren]);

  const openScheduleModal = useCallback(() => {
    const defaultLocationId =
      groupForm.locationId || groupDetail?.group.location_id || '';
    setScheduleForm({
      dayOfWeek: 1,
      startTime: '16:00',
      locationId: defaultLocationId,
      durationMin: 60,
    });
    setScheduleModalOpen(true);
  }, [groupForm.locationId, groupDetail?.group.location_id]);

  const activeSchoolYear = useMemo(
    () => schoolYears.find((y) => y.isActive ?? y.active) ?? null,
    [schoolYears],
  );

  const settlementMonthOptions = useMemo(() => {
    const year = schoolYears.find((y) => y.id === settlementYearId);
    if (!year) return [];
    const months: string[] = [];
    const start = new Date(`${String(year.date_from).slice(0, 10)}T12:00:00`);
    const end = new Date(`${String(year.date_to).slice(0, 10)}T12:00:00`);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endMonth) {
      months.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months.reverse();
  }, [schoolYears, settlementYearId]);

  const availableChildren = useMemo(() => {
    if (!groupDetail) return [];
    const activeInGroup = new Set(groupDetail.students.filter((s) => !s.left_at).map((s) => s.child_id));
    return children
      .filter((c) => c.active && !activeInGroup.has(c.child_id))
      .filter((c) => {
        const q = studentSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          `${c.parent_first_name} ${c.parent_last_name}`.toLowerCase().includes(q)
        );
      });
  }, [children, groupDetail, studentSearch]);

  const createUser = async () => {
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password || !newUser.role) {
      pushToast('error', 'Uzupełnij wszystkie pola i wybierz rolę');
      return;
    }
    const activeLocations = schoolLocations.filter((loc) => loc.active);
    if (newUser.role === 'PARENT') {
      if (
        newParentChildren.length === 0 ||
        newParentChildren.some((child) => !child.firstName || !child.lastName || !child.birthDate)
      ) {
        pushToast('error', 'Dodaj co najmniej jedno dziecko i uzupełnij jego dane');
        return;
      }
      if (
        activeLocations.length > 0 &&
        newParentChildren.some((child) => !child.preferredLocationId.trim())
      ) {
        pushToast('error', 'Wybierz preferowaną lokalizację dla każdego dziecka');
        return;
      }
    }
    setBusy(true);
    try {
      const normalizedPhone = normalizePolishPhone(newUser.phone ?? '');
      const payload: Record<string, unknown> = {
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        confirmed: true,
        accessLevel: newUser.role === 'PARENT' ? 'PENDING' : 'ACTIVE',
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      };
      if (newUser.role === 'PARENT') {
        payload.children = newParentChildren.map((child) => ({
          firstName: child.firstName.trim(),
          lastName: child.lastName.trim(),
          birthDate: child.birthDate,
          preferredLocationId: child.preferredLocationId.trim() || null,
        }));
      }
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się dodać użytkownika');

      if (newUser.role === 'PARENT') {
        pushToast(
          'success',
          data.message ??
            `Utworzono konto rodzica i ${data.enrollmentCount ?? newParentChildren.length} zgłoszeń`,
        );
        setEnrollmentFlowSubTab('enrollment');
        setActiveTab('enrollments');
      } else {
        pushToast('success', 'Dodano użytkownika');
        setOrganizationSubTab('users');
        setUsersSubTab('parents');
      }

      setNewUser({ firstName: '', lastName: '', email: '', password: '', phone: '', role: '' });
      setNewParentChildren([{ firstName: '', lastName: '', birthDate: '', preferredLocationId: '' }]);
      await loadData();
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd dodawania');
    } finally {
      setBusy(false);
    }
  };

  const toggleUserActive = async (user: AdminUser) => {
    setBusy(true);
    try {
      if (user.active) {
        const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Nie udało się dezaktywować');
        pushToast('success', 'Użytkownik oznaczony jako nieaktywny');
      } else {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restore: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'Nie udało się przywrócić');
        pushToast('success', 'Użytkownik przywrócony');
      }
      await loadData();
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd operacji');
    } finally {
      setBusy(false);
    }
  };

  const teachersList = useMemo(
    () =>
      users
        .filter((u) => u.role === 'TEACHER')
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.last_name.localeCompare(b.last_name, 'pl');
        }),
    [users]
  );

  const renderUsers = () => {
    const roleScopedUsers =
      usersSubTab === 'parents'
        ? filteredUsers.filter((user) => user.role === 'PARENT')
        : usersSubTab === 'teachers'
          ? filteredUsers.filter((user) => user.role === 'TEACHER')
          : usersSubTab === 'managers'
            ? filteredUsers.filter((user) => user.role === 'MANAGER')
            : usersSubTab === 'accountants'
              ? filteredUsers.filter((user) => user.role === 'ACCOUNTANT')
              : filteredUsers;

    return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-100 bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {usersSubTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setUsersSubTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                usersSubTab === tab.key
                  ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                  : 'border-emerald-100 bg-white text-zinc-700 hover:border-[#0f6e56]/40 hover:text-[#0f6e56]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {usersSubTab !== 'add' && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po imieniu, nazwisku, emailu"
              className="rounded-xl border border-emerald-200 px-3 py-2"
            />
            <label className="flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Pokaż nieaktywnych
            </label>
          </div>
        )}

        {usersSubTab === 'add' && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input className="rounded-xl border border-emerald-200 px-3 py-2" placeholder="Imię" value={newUser.firstName} onChange={(e) => setNewUser((prev) => ({ ...prev, firstName: e.target.value }))} />
            <input className="rounded-xl border border-emerald-200 px-3 py-2" placeholder="Nazwisko" value={newUser.lastName} onChange={(e) => setNewUser((prev) => ({ ...prev, lastName: e.target.value }))} />
            <input className="rounded-xl border border-emerald-200 px-3 py-2" placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))} />
            <input className="rounded-xl border border-emerald-200 px-3 py-2" placeholder="Hasło" type="password" value={newUser.password} onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))} />
            <input className="rounded-xl border border-emerald-200 px-3 py-2" placeholder="Telefon, np. +48 123 456 789" type="tel" value={newUser.phone} onChange={(e) => setNewUser((prev) => ({ ...prev, phone: normalizePolishPhone(e.target.value) }))} onBlur={(e) => setNewUser((prev) => ({ ...prev, phone: normalizePolishPhone(e.target.value) }))} />
            <select
              className="rounded-xl border border-emerald-200 px-3 py-2"
              value={newUser.role}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, role: e.target.value as '' | Exclude<AdminPortalUserRole, 'ADMIN'> }))
              }
            >
              <option value="">Wybierz rolę</option>
              <option value="PARENT">Rodzic</option>
              <option value="TEACHER">Nauczyciel</option>
              <option value="MANAGER">Manager</option>
              <option value="ACCOUNTANT">Księgowa</option>
            </select>
            </div>

            {newUser.role === 'PARENT' && (
              <div className="rounded-xl border border-emerald-200 p-3">
                <p className="mb-2 font-semibold text-zinc-800">Dane dziecka</p>
                <div className="space-y-2">
                  {newParentChildren.map((child, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                      <input
                        className="rounded-xl border border-emerald-200 px-3 py-2"
                        placeholder="Imię dziecka"
                        value={child.firstName}
                        onChange={(e) =>
                          setNewParentChildren((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, firstName: e.target.value } : row))
                          )
                        }
                      />
                      <input
                        className="rounded-xl border border-emerald-200 px-3 py-2"
                        placeholder="Nazwisko dziecka"
                        value={child.lastName}
                        onChange={(e) =>
                          setNewParentChildren((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, lastName: e.target.value } : row))
                          )
                        }
                      />
                      <input
                        className="rounded-xl border border-emerald-200 px-3 py-2"
                        type="date"
                        value={child.birthDate}
                        onChange={(e) =>
                          setNewParentChildren((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, birthDate: e.target.value } : row))
                          )
                        }
                      />
                      <select
                        className="rounded-xl border border-emerald-200 px-3 py-2"
                        value={child.preferredLocationId}
                        disabled={locationsLoading}
                        onChange={(e) =>
                          setNewParentChildren((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, preferredLocationId: e.target.value } : row,
                            )
                          )
                        }
                      >
                        <option value="">
                          {locationsLoading
                            ? 'Ładowanie lokalizacji…'
                            : schoolLocations.filter((loc) => loc.active).length === 0
                              ? 'Brak lokalizacji'
                              : 'Preferowana lokalizacja'}
                        </option>
                        {schoolLocations
                          .filter((loc) => loc.active)
                          .map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="rounded-xl bg-zinc-200 px-3 py-2"
                        disabled={newParentChildren.length === 1}
                        onClick={() =>
                          setNewParentChildren((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() =>
                    setNewParentChildren((prev) => [
                      ...prev,
                      { firstName: '', lastName: '', birthDate: '', preferredLocationId: '' },
                    ])
                  }
                >
                  + Dodaj kolejne dziecko
                </button>
              </div>
            )}
            <div className="flex justify-end">
              <button
                disabled={busy}
                onClick={createUser}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
              >
                Dodaj
              </button>
            </div>
          </div>
        )}
      </section>

      {(usersSubTab === 'parents' ||
        usersSubTab === 'teachers' ||
        usersSubTab === 'managers' ||
        usersSubTab === 'accountants') && (
      <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Użytkownik</th>
                <th className="px-4 py-3 text-left">Email</th>
                {usersSubTab === 'parents' ? (
                  <th className="px-4 py-3 text-left">Dzieci</th>
                ) : null}
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {roleScopedUsers.map((user) => {
                const profileHref =
                  user.role === 'PARENT' ? `/portal/parents/${user.id}` : `/portal/users/${user.id}`;

                return (
                  <tr key={user.id} className="border-t border-emerald-50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {user.client_number ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span>
                        {user.first_name} {user.last_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">{user.email}</td>
                    {usersSubTab === 'parents' ? (
                      <td className="px-4 py-3 tabular-nums">{user.children_count ?? 0}</td>
                    ) : null}
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {user.active ? 'aktywny' : 'nieaktywny'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={profileHref}
                          className="inline-flex rounded-lg bg-zinc-200 px-3 py-1 text-center text-zinc-900 hover:bg-zinc-300"
                        >
                          Profil
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleUserActive(user)}
                          className={`rounded-lg px-3 py-1 text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            user.active ? 'admin-user-toggle-danger' : 'admin-user-toggle-success'
                          }`}
                        >
                          {user.active ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {usersSubTab === 'children' && (
      <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
        <div className="flex items-center justify-between border-b border-emerald-50 px-4 py-3">
          <h3 className="font-semibold">Dzieci</h3>
          <button
            onClick={() => setChildModalOpen(true)}
            className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white"
          >
            + Dodaj zgłoszenie dziecka
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Imię</th>
                <th className="px-4 py-3 text-left">Nazwisko</th>
                <th className="px-4 py-3 text-left">Data urodzenia</th>
                <th className="px-4 py-3 text-left">Rodzic</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Grupa</th>
                <th className="px-4 py-3 text-left">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                  <tr key={child.child_id} className="border-t border-emerald-50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {child.client_number ?? '—'}
                    </td>
                    <td className="px-4 py-3">{child.first_name}</td>
                    <td className="px-4 py-3">{child.last_name}</td>
                    <td className="px-4 py-3">{child.birth_date}</td>
                    <td className="px-4 py-3">
                      {child.parent_first_name} {child.parent_last_name}
                      {child.parent_client_number ? (
                        <span className="ml-1 font-mono text-xs text-zinc-500">
                          ({child.parent_client_number})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${child.confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-800'}`}>
                        {child.confirmed ? 'potwierdzony' : 'niepotwierdzony'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{child.group_name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/children/${child.child_id}`}
                        className="inline-flex rounded-lg bg-zinc-200 px-3 py-1 text-center text-zinc-900 hover:bg-zinc-300"
                      >
                        Profil
                      </Link>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
  };

  const orgTabLabel = organizationTabs.find((t) => t.key === organizationSubTab)?.label ?? '';

  const renderEnrollmentFlow = () => {
    const tabBtn = (active: boolean) =>
      active
        ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
        : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50';

    return (
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {enrollmentFlowTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setEnrollmentFlowSubTab(t.key)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${tabBtn(enrollmentFlowSubTab === t.key)}`}
            >
              {t.key === 'enrollment' ? (
                <MessagesTabLabel
                  label={t.label}
                  unreadCount={enrollmentsPendingCount}
                  isActive={enrollmentFlowSubTab === 'enrollment'}
                  badgeAriaLabel={(n) =>
                    n === 1 ? '1 nowe zgłoszenie' : `${n} nowych zgłoszeń`
                  }
                />
              ) : t.key === 'resignations' ? (
                <MessagesTabLabel
                  label={t.label}
                  unreadCount={resignationsOpenCount}
                  isActive={enrollmentFlowSubTab === 'resignations'}
                  badgeAriaLabel={(n) =>
                    n === 1
                      ? '1 otwarte zgłoszenie rezygnacji'
                      : `${n} otwartych zgłoszeń rezygnacji`
                  }
                />
              ) : (
                t.label
              )}
            </button>
          ))}
        </div>

        {enrollmentFlowSubTab === 'enrollment' ? (
          <EnrollmentAdminPanel
            pushToast={pushToast}
            parents={enrollmentParents}
            groups={enrollmentGroups}
            complimentaryParents={complimentaryParents}
            discountSettings={discountSettings}
            onRefresh={loadEnrollmentData}
            onComplimentaryParentsChange={setComplimentaryParents}
          />
        ) : null}
        {enrollmentFlowSubTab === 'renewals' ? <RenewalsPanel pushToast={pushToast} /> : null}
        {enrollmentFlowSubTab === 'resignations' ? (
          <ResignationsPanel
            pushToast={pushToast}
            onChange={refreshResignationsOpenCount}
          />
        ) : null}
      </div>
    );
  };

  const renderOrganization = () => {
    const tabBtn = (active: boolean) =>
      active
        ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
        : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50';

    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-6">
        <header className="border-b border-emerald-50 pb-4">
          <h2 className="text-xl font-bold text-[#0f6e56] sm:text-2xl">Organizacja szkoły</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Konfiguracja roku szkolnego, kadry, lokalizacji, grup oraz archiwum zmian.
          </p>
        </header>

        <div className="mt-4 flex flex-wrap gap-2">
          {organizationTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setOrganizationSubTab(t.key);
                if (t.key === 'groups') {
                  resetGroupsToList();
                }
                if (t.key === 'teachers') setTeacherOrgSubTab('list');
                if (t.key === 'locations') setLocationOrgSubTab('list');
              }}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${tabBtn(organizationSubTab === t.key)}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {organizationSubTab === 'groups' ? (
          <div className="mt-6">{renderGroups()}</div>
        ) : organizationSubTab === 'users' ? (
          <div className="mt-6">{renderUsers()}</div>
        ) : (
        <div className="mt-6 rounded-2xl border border-emerald-100 bg-white p-4 sm:p-5">
          <h3 className="text-lg font-bold text-[#0f6e56] sm:text-xl">{orgTabLabel}</h3>

          {organizationSubTab === 'teachers' && (
            <div className="mt-3 flex flex-wrap gap-2 border-b border-emerald-50 pb-4">
              {teacherOrgSubTabs.map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setTeacherOrgSubTab(st.key)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    teacherOrgSubTab === st.key
                      ? 'border-[#0f6e56] bg-emerald-50 text-[#0f6e56]'
                      : 'border-emerald-100 bg-white text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50/40'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}

          {organizationSubTab === 'locations' && (
            <div className="mt-3 flex flex-wrap gap-2 border-b border-emerald-50 pb-4">
              {locationOrgSubTabs.map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setLocationOrgSubTab(st.key)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                    locationOrgSubTab === st.key
                      ? 'border-[#0f6e56] bg-emerald-50 text-[#0f6e56]'
                      : 'border-emerald-100 bg-white text-zinc-700 hover:border-emerald-200 hover:bg-emerald-50/40'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}

          {organizationSubTab === 'schoolYear' && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-zinc-600">
                Jeden aktywny rok naraz. Możesz dodać kolejny rok z wyprzedzeniem — stanie się aktywny
                automatycznie po zakończeniu bieżącego. Grupy należą do szkoły (nie do roku); przy
                zamknięciu dzieci zostają w tych samych grupach. Odnowienia: domyślnie proponowana jest
                aktualna grupa dziecka.
              </p>

              {schoolYearLoading ? (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />
                  <div className="h-32 animate-pulse rounded-2xl bg-emerald-100/60" />
                  <div className="h-40 animate-pulse rounded-2xl bg-emerald-100/50" />
                </div>
              ) : (
                <>
                  {(() => {
                    const active = schoolYears.find((y) => y.isActive ?? y.active);
                    const inactive = schoolYears.filter((y) => !(y.isActive ?? y.active));
                    const plannedNext = active
                      ? [...inactive]
                          .filter((y) => y.date_from > active.date_from)
                          .sort((a, b) => a.date_from.localeCompare(b.date_from))[0] ?? null
                      : null;
                    const previousYears = inactive.filter((y) => y.id !== plannedNext?.id);
                    const activeYearExpired = active ? isSchoolYearEndDatePassed(active.date_to) : false;
                    return (
                      <>
                        {active && activeYearExpired && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                            <p className="font-semibold">Rok szkolny minął</p>
                            <p className="mt-1">
                              Data końcowa ({formatSchoolYearEndDatePl(active.date_to)}) już upłynęła, a rok
                              nadal jest oznaczony jako aktywny. Zakończ go przyciskiem „Zakończ rok szkolny”,
                              aby móc utworzyć nowy rok i planować kolejne zajęcia.
                            </p>
                          </div>
                        )}
                        {active ? (
                          <div
                            className={`rounded-xl border p-4 ${
                              activeYearExpired
                                ? 'border-amber-300 bg-amber-50/40'
                                : 'border-emerald-200 bg-emerald-50/40'
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                                  Aktywny rok
                                  {activeYearExpired ? (
                                    <span className="ml-2 normal-case text-amber-800">(po terminie)</span>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-lg font-bold text-zinc-900">{active.name}</p>
                                <p className="mt-1 text-sm text-zinc-600">
                                  {active.date_from} — {active.date_to}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setCloseYearModal({ id: active.id, name: active.name })}
                                className="shrink-0 rounded-xl border-2 border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                              >
                                Zakończ rok szkolny
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                            Brak aktywnego roku szkolnego — dodaj nowy, aby planować zajęcia i dni wolne.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || (!!active && !!plannedNext)}
                            onClick={() => {
                              setNewYearForm({
                                name: '',
                                dateFrom: active
                                  ? ''
                                  : '',
                                dateTo: '',
                              });
                              setNewYearModalOpen(true);
                            }}
                            className="rounded-xl bg-[#0f6e56] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {active ? '+ Dodaj kolejny rok' : '+ Nowy rok szkolny'}
                          </button>
                          <button
                            type="button"
                            disabled={busy || !active}
                            onClick={() => {
                              setHolidayForm({
                                name: '',
                                dateFrom: active?.date_from ?? '',
                                dateTo: active?.date_from ?? '',
                                type: 'HOLIDAY',
                                parentMessage: '',
                              });
                              setHolidayModalOpen(true);
                            }}
                            className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#0f6e56] shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                          >
                            + Dodaj dzień wolny
                          </button>
                          <button
                            type="button"
                            disabled={busy || !active}
                            onClick={async () => {
                              if (!active) return;
                              setBusy(true);
                              try {
                                const res = await fetch('/api/admin/school-holidays/seed-public', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ school_year_id: active.id }),
                                });
                                const data = (await res.json().catch(() => ({}))) as {
                                  message?: string;
                                };
                                if (!res.ok) throw new Error(data.message ?? 'Błąd');
                                pushToast('success', data.message ?? 'Uzupełniono święta państwowe');
                                setClassesCalRefreshSignal((s) => s + 1);
                                await loadSchoolYearData();
                              } catch (e) {
                                pushToast('error', e instanceof Error ? e.message : 'Błąd uzupełniania świąt');
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
                          >
                            Uzupełnij święta państwowe PL
                          </button>
                        </div>

                        {active && (
                          <div className="rounded-xl border border-emerald-100 bg-white p-4">
                            <h4 className="text-sm font-semibold text-zinc-800">Dni wolne (aktywny rok)</h4>
                            {schoolHolidays.length === 0 ? (
                              <p className="mt-2 text-sm text-zinc-500">Brak wpisów.</p>
                            ) : (
                              <ul className="mt-3 divide-y divide-emerald-100">
                                {schoolHolidays.map((h) => (
                                  <li key={h.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="font-medium text-zinc-900">{h.name}</p>
                                      <p className="text-xs text-zinc-600">
                                        {h.date_from} — {h.date_to} · {h.type}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={async () => {
                                        if (!confirm('Usunąć ten dzień wolny?')) return;
                                        setBusy(true);
                                        try {
                                          const res = await fetch(`/api/admin/school-holidays/${h.id}`, {
                                            method: 'DELETE',
                                          });
                                          const data = await res.json().catch(() => ({}));
                                          if (!res.ok) throw new Error(data.message ?? 'Błąd');
                                          pushToast('success', 'Usunięto dzień wolny');
                                          setClassesCalRefreshSignal((s) => s + 1);
                                          await loadSchoolYearData();
                                        } catch (e) {
                                          pushToast('error', e instanceof Error ? e.message : 'Błąd usuwania');
                                        } finally {
                                          setBusy(false);
                                        }
                                      }}
                                      className="self-start rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 sm:self-center"
                                    >
                                      Usuń
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {plannedNext && (
                          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                              Planowany kolejny rok (odnowienia)
                            </p>
                            <p className="mt-1 text-lg font-bold text-zinc-900">{plannedNext.name}</p>
                            <p className="mt-1 text-sm text-zinc-600">
                              {plannedNext.date_from} — {plannedNext.date_to}
                            </p>
                            <p className="mt-2 text-sm text-sky-900">
                              Aktywuje się automatycznie po zakończeniu roku {active?.name ?? ''}.
                              Odnowienia w panelu przypisuj do tego roku.
                            </p>
                            <button
                              type="button"
                              className="mt-3 text-xs font-semibold text-[#0f6e56] underline"
                              onClick={() => setEditYearModal(plannedNext)}
                            >
                              Edytuj daty
                            </button>
                          </div>
                        )}

                        {previousYears.length > 0 && (
                          <div className="rounded-xl border border-emerald-100 bg-zinc-50/50 p-4">
                            <h4 className="text-sm font-semibold text-zinc-800">Zamknięte lata</h4>
                            <ul className="mt-2 space-y-2">
                              {previousYears.map((y) => (
                                <li
                                  key={y.id}
                                  className="rounded-lg border border-emerald-100 bg-white px-3 py-2"
                                >
                                  <p className="font-medium text-zinc-900">{y.name}</p>
                                  <p className="text-xs text-zinc-600">
                                    {y.date_from} — {y.date_to}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {organizationSubTab === 'teachers' && (
            <div className="mt-4 space-y-4">
              {teacherOrgSubTab === 'list' && (
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {teachersList.length === 0 ? (
                    <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                      Brak nauczycieli — dodaj konto w zakładce „Dodaj nauczyciela”.
                    </p>
                  ) : (
                    teachersList.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="font-semibold text-zinc-900">
                            {t.first_name} {t.last_name}
                          </p>
                          <p className="text-sm text-zinc-600">{t.email}</p>
                          {t.phone ? <p className="text-xs text-zinc-500">{t.phone}</p> : null}
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              t.active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            {t.active ? 'Aktywny' : 'Nieaktywny'}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleUserActive(t)}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              t.active ? 'admin-user-toggle-danger' : 'admin-user-toggle-success'
                            }`}
                          >
                            {t.active ? 'Dezaktywuj' : 'Aktywuj'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {teacherOrgSubTab === 'add' && (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4 text-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">Nowy nauczyciel</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Imię</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newTeacherForm.firstName}
                        onChange={(e) => setNewTeacherForm((p) => ({ ...p, firstName: e.target.value }))}
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Nazwisko</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newTeacherForm.lastName}
                        onChange={(e) => setNewTeacherForm((p) => ({ ...p, lastName: e.target.value }))}
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Email (login)</span>
                      <input
                        type="email"
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newTeacherForm.email}
                        onChange={(e) => setNewTeacherForm((p) => ({ ...p, email: e.target.value }))}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Hasło</span>
                      <input
                        type="password"
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newTeacherForm.password}
                        onChange={(e) => setNewTeacherForm((p) => ({ ...p, password: e.target.value }))}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-zinc-500">Telefon (opcjonalnie)</span>
                      <input
                        type="tel"
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. +48 …"
                        value={newTeacherForm.phone}
                        onChange={(e) => setNewTeacherForm((p) => ({ ...p, phone: normalizePolishPhone(e.target.value) }))}
                        onBlur={(e) => setNewTeacherForm((p) => ({ ...p, phone: normalizePolishPhone(e.target.value) }))}
                        autoComplete="tel"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        const { firstName, lastName, email, password, phone } = newTeacherForm;
                        if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
                          pushToast('error', 'Uzupełnij imię, nazwisko, email i hasło');
                          return;
                        }
                        setBusy(true);
                        try {
                          const res = await fetch('/api/admin/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              firstName: firstName.trim(),
                              lastName: lastName.trim(),
                              email: email.trim().toLowerCase(),
                              password,
                              role: 'TEACHER',
                              confirmed: true,
                              accessLevel: 'ACTIVE',
                              ...(phone.trim() ? { phone: normalizePolishPhone(phone) } : {}),
                            }),
                          });
                          const data = (await res.json().catch(() => ({}))) as {
                            message?: string;
                            detail?: string;
                            pgMessage?: string;
                          };
                          if (!res.ok) {
                            const base = data.message ?? 'Nie udało się dodać nauczyciela';
                            const tech = [data.detail, data.pgMessage]
                              .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                              .join(' — ');
                            throw new Error(tech ? `${base} — ${tech}` : base);
                          }
                          pushToast('success', 'Dodano nauczyciela');
                          setNewTeacherForm({
                            firstName: '',
                            lastName: '',
                            email: '',
                            password: '',
                            phone: '',
                          });
                          setTeacherOrgSubTab('list');
                          await loadData();
                        } catch (e) {
                          pushToast('error', e instanceof Error ? e.message : 'Błąd');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Dodaj nauczyciela
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {organizationSubTab === 'locations' && (
            <div className="mt-4 space-y-4">
              {locationOrgSubTab === 'list' && (
                <>
                  {locationsLoading ? (
                    <div className="h-32 animate-pulse rounded-2xl bg-emerald-100/70" />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-zinc-500">
                        Niższa kolejność = wyżej na formularzu zapisu. Wyróżnione mają gwiazdkę; Nowość!
                        dokłada „(Nowość!)” do etykiety.
                      </p>
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {schoolLocations.filter((l) => !l.is_special).length === 0 ? (
                          <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                            Brak lokalizacji — dodaj pierwszą w zakładce „Dodaj lokalizację”.
                          </p>
                        ) : (
                          schoolLocations
                            .filter((loc) => !loc.is_special)
                            .map((loc) => (
                              <div
                                key={loc.id}
                                className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                                  loc.is_featured
                                    ? 'border-emerald-300 bg-emerald-50/40'
                                    : 'border-emerald-100 bg-white'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-zinc-900">
                                    {loc.name}
                                    {loc.is_new ? ' (Nowość!)' : ''}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {loc.town || '—'} / {loc.facility || '—'}
                                  </p>
                                  {loc.address ? (
                                    <p className="text-sm text-zinc-600">{loc.address}</p>
                                  ) : (
                                    <p className="text-xs text-zinc-500">Bez adresu</p>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
                                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <span className="whitespace-nowrap">Kolejność</span>
                                    <input
                                      key={`${loc.id}-${loc.sort_order}`}
                                      type="number"
                                      min={0}
                                      max={9999}
                                      step={1}
                                      defaultValue={loc.sort_order}
                                      disabled={busy}
                                      className="w-20 rounded-lg border border-emerald-100 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
                                      onBlur={async (e) => {
                                        const next = Number(e.target.value);
                                        if (
                                          !Number.isFinite(next) ||
                                          !Number.isInteger(next) ||
                                          next < 0 ||
                                          next > 9999
                                        ) {
                                          pushToast(
                                            'error',
                                            'Kolejność musi być liczbą całkowitą od 0 do 9999',
                                          );
                                          e.target.value = String(loc.sort_order);
                                          return;
                                        }
                                        if (next === loc.sort_order) return;
                                        await saveLocationDisplay(
                                          loc.id,
                                          { sort_order: next },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                  </label>
                                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={loc.is_featured}
                                      disabled={busy}
                                      className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56] focus:ring-[#0f6e56]/30"
                                      onChange={async (e) => {
                                        await saveLocationDisplay(
                                          loc.id,
                                          { is_featured: e.target.checked },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                    Wyróżniona
                                  </label>
                                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={loc.is_new}
                                      disabled={busy}
                                      className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56] focus:ring-[#0f6e56]/30"
                                      onChange={async (e) => {
                                        await saveLocationDisplay(
                                          loc.id,
                                          { is_new: e.target.checked },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                    Nowość!
                                  </label>
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                      loc.active
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-zinc-100 text-zinc-600'
                                    }`}
                                  >
                                    {loc.active ? 'Aktywna' : 'Nieaktywna'}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => {
                                      setEditLocationId(loc.id);
                                      setEditLocationForm({
                                        town: loc.town ?? '',
                                        facility: loc.facility ?? '',
                                        name: loc.name,
                                        address: loc.address ?? '',
                                        isSpecial: false,
                                        isNew: loc.is_new,
                                        isFeatured: loc.is_featured,
                                      });
                                      setLocationOrgSubTab('edit');
                                    }}
                                  >
                                    Edytuj
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {locationOrgSubTab === 'specials' && (
                <>
                  {locationsLoading ? (
                    <div className="h-32 animate-pulse rounded-2xl bg-emerald-100/70" />
                  ) : (
                    <div className="space-y-4">
                      <p className="text-xs text-zinc-500">
                        Pozycje specjalne (np. przygotowanie do egzaminu) — jedna nazwa, bez
                        miejscowości/placówki. Widoczne na formularzu zgłoszeniowym jak zwykłe lokalizacje.
                      </p>
                      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                        {schoolLocations.filter((l) => l.is_special).length === 0 ? (
                          <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                            Brak pozycji specjalnych — dodaj poniżej.
                          </p>
                        ) : (
                          schoolLocations
                            .filter((loc) => loc.is_special)
                            .map((loc) => (
                              <div
                                key={loc.id}
                                className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                                  loc.is_featured
                                    ? 'border-emerald-300 bg-emerald-50/40'
                                    : 'border-emerald-100 bg-white'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-zinc-900">
                                    {loc.is_featured ? `★ ${loc.name}` : loc.name}
                                    {loc.is_new ? ' (Nowość!)' : ''}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
                                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <span className="whitespace-nowrap">Kolejność</span>
                                    <input
                                      key={`${loc.id}-sp-${loc.sort_order}`}
                                      type="number"
                                      min={0}
                                      max={9999}
                                      step={1}
                                      defaultValue={loc.sort_order}
                                      disabled={busy}
                                      className="w-20 rounded-lg border border-emerald-100 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
                                      onBlur={async (e) => {
                                        const next = Number(e.target.value);
                                        if (
                                          !Number.isFinite(next) ||
                                          !Number.isInteger(next) ||
                                          next < 0 ||
                                          next > 9999
                                        ) {
                                          pushToast(
                                            'error',
                                            'Kolejność musi być liczbą całkowitą od 0 do 9999',
                                          );
                                          e.target.value = String(loc.sort_order);
                                          return;
                                        }
                                        if (next === loc.sort_order) return;
                                        await saveLocationDisplay(
                                          loc.id,
                                          { sort_order: next },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                  </label>
                                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={loc.is_featured}
                                      disabled={busy}
                                      className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56] focus:ring-[#0f6e56]/30"
                                      onChange={async (e) => {
                                        await saveLocationDisplay(
                                          loc.id,
                                          { is_featured: e.target.checked },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                    Wyróżniona
                                  </label>
                                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={loc.is_new}
                                      disabled={busy}
                                      className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56] focus:ring-[#0f6e56]/30"
                                      onChange={async (e) => {
                                        await saveLocationDisplay(
                                          loc.id,
                                          { is_new: e.target.checked },
                                          { silent: true },
                                        );
                                      }}
                                    />
                                    Nowość!
                                  </label>
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                      loc.active
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-zinc-100 text-zinc-600'
                                    }`}
                                  >
                                    {loc.active ? 'Aktywna' : 'Nieaktywna'}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded-lg bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => {
                                      setEditLocationId(loc.id);
                                      setEditLocationForm({
                                        town: '',
                                        facility: '',
                                        name: loc.name,
                                        address: loc.address ?? '',
                                        isSpecial: true,
                                        isNew: loc.is_new,
                                        isFeatured: loc.is_featured,
                                      });
                                      setLocationOrgSubTab('edit');
                                    }}
                                  >
                                    Edytuj
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>

                      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4 text-sm">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                          Dodaj pozycję specjalną
                        </p>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-semibold text-zinc-700">Nazwa</span>
                            <input
                              className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                              placeholder="np. Przygotowanie do egzaminu 8-klasisty"
                              value={newSpecialForm.name}
                              onChange={(e) =>
                                setNewSpecialForm((p) => ({ ...p, name: e.target.value }))
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-zinc-700">
                              Kolejność na formularzu
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={9999}
                              step={1}
                              className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                              value={newSpecialForm.sortOrder}
                              onChange={(e) =>
                                setNewSpecialForm((p) => ({ ...p, sortOrder: e.target.value }))
                              }
                            />
                          </label>
                          <div className="flex flex-wrap items-end gap-4 pb-1">
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                              <input
                                type="checkbox"
                                checked={newSpecialForm.isFeatured}
                                className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                                onChange={(e) =>
                                  setNewSpecialForm((p) => ({
                                    ...p,
                                    isFeatured: e.target.checked,
                                  }))
                                }
                              />
                              Wyróżniona
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                              <input
                                type="checkbox"
                                checked={newSpecialForm.isNew}
                                className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                                onChange={(e) =>
                                  setNewSpecialForm((p) => ({ ...p, isNew: e.target.checked }))
                                }
                              />
                              Nowość!
                            </label>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={async () => {
                              const name = newSpecialForm.name.trim();
                              if (!name) {
                                pushToast('error', 'Podaj nazwę pozycji specjalnej');
                                return;
                              }
                              const sortOrder = Number(newSpecialForm.sortOrder);
                              if (
                                !Number.isFinite(sortOrder) ||
                                !Number.isInteger(sortOrder) ||
                                sortOrder < 0 ||
                                sortOrder > 9999
                              ) {
                                pushToast('error', 'Kolejność musi być liczbą całkowitą od 0 do 9999');
                                return;
                              }
                              setBusy(true);
                              try {
                                const body: Record<string, unknown> = {
                                  name,
                                  is_special: true,
                                  sort_order: sortOrder,
                                  is_featured: newSpecialForm.isFeatured,
                                  is_new: newSpecialForm.isNew,
                                };
                                if (sessionSchoolId) body.schoolId = sessionSchoolId;
                                const res = await fetch('/api/admin/locations', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(body),
                                });
                                const data = (await res.json().catch(() => ({}))) as {
                                  message?: string;
                                };
                                if (!res.ok) {
                                  throw new Error(data.message ?? 'Nie udało się dodać pozycji');
                                }
                                pushToast('success', 'Dodano pozycję specjalną');
                                setNewSpecialForm({
                                  name: '',
                                  sortOrder: '0',
                                  isNew: false,
                                  isFeatured: true,
                                });
                                await loadLocations();
                              } catch (e) {
                                pushToast('error', e instanceof Error ? e.message : 'Błąd');
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Dodaj pozycję specjalną
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {locationOrgSubTab === 'add' && (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4 text-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                    Nowa lokalizacja
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Miejscowość</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. Bujaków"
                        value={newLocationForm.town}
                        onChange={(e) => setNewLocationForm((p) => ({ ...p, town: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Placówka</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. Przedszkole / Szkoła"
                        value={newLocationForm.facility}
                        onChange={(e) =>
                          setNewLocationForm((p) => ({ ...p, facility: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-zinc-500">
                        Adres (opcjonalnie)
                      </span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. ul. …"
                        value={newLocationForm.address}
                        onChange={(e) =>
                          setNewLocationForm((p) => ({ ...p, address: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">
                        Kolejność na formularzu
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step={1}
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newLocationForm.sortOrder}
                        onChange={(e) =>
                          setNewLocationForm((p) => ({ ...p, sortOrder: e.target.value }))
                        }
                      />
                      <span className="mt-1 block text-xs text-zinc-500">
                        Niższa wartość = wyżej na liście (0 = pierwsza pozycja). Domyślnie 100.
                      </span>
                    </label>
                    <div className="flex flex-wrap items-end gap-4 pb-1">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                        <input
                          type="checkbox"
                          checked={newLocationForm.isFeatured}
                          className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                          onChange={(e) =>
                            setNewLocationForm((p) => ({ ...p, isFeatured: e.target.checked }))
                          }
                        />
                        Wyróżniona
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                        <input
                          type="checkbox"
                          checked={newLocationForm.isNew}
                          className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                          onChange={(e) =>
                            setNewLocationForm((p) => ({ ...p, isNew: e.target.checked }))
                          }
                        />
                        Nowość!
                      </label>
                    </div>
                    {(newLocationForm.town.trim() || newLocationForm.facility.trim()) && (
                      <p className="md:col-span-2 text-xs text-zinc-600">
                        Na formularzu:{' '}
                        <span className="font-semibold text-zinc-800">
                          {newLocationForm.isFeatured ? '★ ' : ''}
                          {[newLocationForm.town.trim(), newLocationForm.facility.trim()]
                            .filter(Boolean)
                            .join(' ')}
                          {newLocationForm.isNew ? ' (Nowość!)' : ''}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        const town = newLocationForm.town.trim();
                        const facility = newLocationForm.facility.trim();
                        if (!town || !facility) {
                          pushToast('error', 'Podaj miejscowość i placówkę');
                          return;
                        }
                        const sortOrder = Number(newLocationForm.sortOrder);
                        if (
                          !Number.isFinite(sortOrder) ||
                          !Number.isInteger(sortOrder) ||
                          sortOrder < 0 ||
                          sortOrder > 9999
                        ) {
                          pushToast('error', 'Kolejność musi być liczbą całkowitą od 0 do 9999');
                          return;
                        }
                        setBusy(true);
                        try {
                          const body: Record<string, unknown> = {
                            town,
                            facility,
                            sort_order: sortOrder,
                            is_featured: newLocationForm.isFeatured,
                            is_new: newLocationForm.isNew,
                            is_special: false,
                          };
                          if (newLocationForm.address.trim()) {
                            body.address = newLocationForm.address.trim();
                          }
                          if (sessionSchoolId) body.schoolId = sessionSchoolId;
                          const res = await fetch('/api/admin/locations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                          });
                          const data = (await res.json().catch(() => ({}))) as { message?: string };
                          if (!res.ok) {
                            throw new Error(data.message ?? 'Nie udało się dodać lokalizacji');
                          }
                          pushToast('success', 'Dodano lokalizację');
                          setNewLocationForm({
                            town: '',
                            facility: '',
                            address: '',
                            sortOrder: '100',
                            isNew: false,
                            isFeatured: false,
                          });
                          setLocationOrgSubTab('list');
                          await loadLocations();
                        } catch (e) {
                          pushToast('error', e instanceof Error ? e.message : 'Błąd');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Dodaj lokalizację
                    </button>
                  </div>
                </div>
              )}
              {locationOrgSubTab === 'edit' && (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4 text-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">
                    {editLocationForm.isSpecial ? 'Edycja pozycji specjalnej' : 'Edycja lokalizacji'}
                  </p>
                  {!editLocationId ? (
                    <p className="rounded-lg border border-emerald-100 bg-white px-3 py-3 text-sm text-zinc-600">
                      Wybierz pozycję z listy i kliknij „Edytuj”.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {editLocationForm.isSpecial ? (
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-semibold text-zinc-700">Nazwa</span>
                            <input
                              className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                              value={editLocationForm.name}
                              onChange={(e) =>
                                setEditLocationForm((p) => ({ ...p, name: e.target.value }))
                              }
                            />
                          </label>
                        ) : (
                          <>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-zinc-700">
                                Miejscowość
                              </span>
                              <input
                                className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                                value={editLocationForm.town}
                                onChange={(e) =>
                                  setEditLocationForm((p) => ({ ...p, town: e.target.value }))
                                }
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs font-semibold text-zinc-700">
                                Placówka
                              </span>
                              <input
                                className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                                value={editLocationForm.facility}
                                onChange={(e) =>
                                  setEditLocationForm((p) => ({ ...p, facility: e.target.value }))
                                }
                              />
                            </label>
                            <label className="block md:col-span-2">
                              <span className="mb-1 block text-xs font-semibold text-zinc-500">
                                Adres (opcjonalnie)
                              </span>
                              <input
                                className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                                value={editLocationForm.address}
                                onChange={(e) =>
                                  setEditLocationForm((p) => ({ ...p, address: e.target.value }))
                                }
                              />
                            </label>
                          </>
                        )}
                        <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                            <input
                              type="checkbox"
                              checked={editLocationForm.isFeatured}
                              className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                              onChange={(e) =>
                                setEditLocationForm((p) => ({
                                  ...p,
                                  isFeatured: e.target.checked,
                                }))
                              }
                            />
                            Wyróżniona
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                            <input
                              type="checkbox"
                              checked={editLocationForm.isNew}
                              className="h-4 w-4 rounded border-emerald-200 text-[#0f6e56]"
                              onChange={(e) =>
                                setEditLocationForm((p) => ({ ...p, isNew: e.target.checked }))
                              }
                            />
                            Nowość!
                          </label>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy || !editLocationId}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            schoolLocations.find((l) => l.id === editLocationId)?.active
                              ? 'admin-user-toggle-danger'
                              : 'admin-user-toggle-success'
                          }`}
                          onClick={async () => {
                            const current = schoolLocations.find((l) => l.id === editLocationId);
                            if (!current || !editLocationId) return;
                            setBusy(true);
                            try {
                              const res = await fetch(
                                `/api/admin/locations/${encodeURIComponent(editLocationId)}`,
                                {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ active: !current.active }),
                                },
                              );
                              const data = (await res.json().catch(() => ({}))) as {
                                message?: string;
                              };
                              if (!res.ok) {
                                throw new Error(
                                  data.message ?? 'Nie udało się zaktualizować lokalizacji',
                                );
                              }
                              pushToast(
                                'success',
                                current.active
                                  ? 'Lokalizacja została oznaczona jako nieaktywna'
                                  : 'Lokalizacja została ponownie oznaczona jako aktywna',
                              );
                              await loadLocations();
                            } catch (e) {
                              pushToast(
                                'error',
                                e instanceof Error ? e.message : 'Błąd aktualizacji lokalizacji',
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {schoolLocations.find((l) => l.id === editLocationId)?.active
                            ? 'Dezaktywuj'
                            : 'Aktywuj'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            setEditLocationId(null);
                            setEditLocationForm({
                              town: '',
                              facility: '',
                              name: '',
                              address: '',
                              isSpecial: false,
                              isNew: false,
                              isFeatured: false,
                            });
                            setLocationOrgSubTab(
                              editLocationForm.isSpecial ? 'specials' : 'list',
                            );
                          }}
                        >
                          Anuluj
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={async () => {
                            if (!editLocationId) return;
                            if (editLocationForm.isSpecial) {
                              if (!editLocationForm.name.trim()) {
                                pushToast('error', 'Podaj nazwę pozycji specjalnej');
                                return;
                              }
                            } else if (
                              !editLocationForm.town.trim() ||
                              !editLocationForm.facility.trim()
                            ) {
                              pushToast('error', 'Podaj miejscowość i placówkę');
                              return;
                            }
                            setBusy(true);
                            try {
                              const res = await fetch(
                                `/api/admin/locations/${encodeURIComponent(editLocationId)}`,
                                {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(
                                    editLocationForm.isSpecial
                                      ? {
                                          name: editLocationForm.name.trim(),
                                          is_special: true,
                                          is_featured: editLocationForm.isFeatured,
                                          is_new: editLocationForm.isNew,
                                        }
                                      : {
                                          town: editLocationForm.town.trim(),
                                          facility: editLocationForm.facility.trim(),
                                          address: editLocationForm.address.trim()
                                            ? editLocationForm.address.trim()
                                            : null,
                                          is_special: false,
                                          is_featured: editLocationForm.isFeatured,
                                          is_new: editLocationForm.isNew,
                                        },
                                  ),
                                },
                              );
                              const data = (await res.json().catch(() => ({}))) as {
                                message?: string;
                              };
                              if (!res.ok) {
                                throw new Error(
                                  data.message ?? 'Nie udało się zaktualizować lokalizacji',
                                );
                              }
                              pushToast('success', 'Zaktualizowano lokalizację');
                              const backTab = editLocationForm.isSpecial ? 'specials' : 'list';
                              setEditLocationId(null);
                              setEditLocationForm({
                                town: '',
                                facility: '',
                                name: '',
                                address: '',
                                isSpecial: false,
                                isNew: false,
                                isFeatured: false,
                              });
                              setLocationOrgSubTab(backTab);
                              await loadLocations();
                            } catch (e) {
                              pushToast('error', e instanceof Error ? e.message : 'Błąd');
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Zapisz zmiany
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {organizationSubTab === 'discounts' && (
            <div className="mt-4 space-y-6">
              <p className="text-sm text-zinc-600">
                Rodzice w trybie bez opłat (bez faktur i płatności). Zniżki procentowe (KDR /
                rodzeństwo) są wyłączone — ceny ustala manager ręcznie przy propozycji grupy.
              </p>

              {discountsLoading ? (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />
                  <div className="h-32 animate-pulse rounded-2xl bg-emerald-100/60" />
                </div>
              ) : (
                <>
                  {/*
                   * Zniżki procentowe — UI schowane na sezon cen ręcznych.
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <h4 className="font-semibold text-[#0f6e56]">Zniżki procentowe</h4>
                    ... formularz max% / KDR / rodzeństwo ...
                  </div>
                  */}

                  <div className="rounded-xl border border-emerald-100 bg-white p-4">
                    <h4 className="font-semibold text-[#0f6e56]">Tryb bez opłat</h4>
                    <p className="mt-1 text-sm text-zinc-600">
                      Rodzice z tej listy kończą zapis po akceptacji grupy — bez umowy, faktur i
                      płatności. Możesz dodać konto rodzica lub zgłoszenie z rejestracji (e-mail).
                    </p>
                    <div className="mt-4 space-y-1">
                      <label
                        htmlFor="complimentary-search"
                        className="block text-xs font-medium text-zinc-600"
                      >
                        Szukaj rodzica
                      </label>
                      <input
                        id="complimentary-search"
                        type="search"
                        autoComplete="off"
                        className="w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm"
                        placeholder="Imię, nazwisko lub e-mail…"
                        value={complimentarySearch}
                        onChange={(e) => setComplimentarySearch(e.target.value)}
                      />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {complimentarySearch.trim()
                        ? `${filteredComplimentaryParents.length} na liście · wyniki: ${filteredComplimentaryCandidates.length} z ${complimentaryCandidates.length} kandydatów`
                        : complimentaryParents.length > 0
                          ? `${complimentaryParents.length} na liście · kandydaci: ${complimentaryCandidates.length}`
                          : `Kandydaci: ${complimentaryCandidates.length} (konta rodziców + zgłoszenia bez konta)`}
                    </p>

                    <h5 className="mt-4 text-sm font-semibold text-[#0f6e56]">
                      Rodzice bez opłat
                    </h5>
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                      {complimentaryParents.length === 0 ? (
                        <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                          Brak rodziców w trybie bez opłat.
                        </p>
                      ) : filteredComplimentaryParents.length === 0 ? (
                        <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                          Brak wyników dla podanego wyszukiwania.
                        </p>
                      ) : (
                        filteredComplimentaryParents.map((parent) => (
                          <div
                            key={parent.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 px-4 py-3"
                          >
                            <div>
                              <p className="font-semibold text-zinc-900">
                                {parent.firstName} {parent.lastName}
                              </p>
                              <p className="text-sm text-zinc-600">{parent.email}</p>
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {parent.source === 'ENROLLMENT'
                                  ? 'Źródło: zgłoszenie · bez umowy po akceptacji grupy'
                                  : 'Źródło: konto rodzica · bez umowy po akceptacji grupy'}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
                              onClick={async () => {
                                setDiscountsSaving(true);
                                try {
                                  const res = await fetch('/api/admin/discounts', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: parent.id }),
                                  });
                                  const data = (await res.json().catch(() => ({}))) as {
                                    message?: string;
                                    complimentaryParents?: typeof complimentaryParents;
                                    complimentaryCandidates?: typeof complimentaryCandidates;
                                  };
                                  if (!res.ok) {
                                    pushToast('error', data.message ?? 'Nie udało się usunąć');
                                    return;
                                  }
                                  setComplimentaryParents(
                                    Array.isArray(data.complimentaryParents)
                                      ? data.complimentaryParents
                                      : [],
                                  );
                                  if (Array.isArray(data.complimentaryCandidates)) {
                                    setComplimentaryCandidates(data.complimentaryCandidates);
                                  }
                                  pushToast('success', 'Usunięto z trybu bez opłat');
                                } catch {
                                  pushToast('error', 'Błąd usuwania rodzica');
                                } finally {
                                  setDiscountsSaving(false);
                                }
                              }}
                            >
                              Usuń
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <h5 className="mt-4 text-sm font-semibold text-[#0f6e56]">
                      Dodaj do trybu bez opłat
                    </h5>
                    <div className="mt-2 space-y-2">
                      <div className="max-h-56 overflow-y-auto rounded-xl border border-emerald-200">
                        {complimentaryCandidates.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-zinc-600">
                            Brak kandydatów do dodania.
                          </p>
                        ) : filteredComplimentaryCandidates.length === 0 ? (
                          <p className="px-3 py-4 text-sm text-zinc-600">
                            Brak wyników — wpisz inne imię, nazwisko lub e-mail.
                          </p>
                        ) : (
                          <>
                            {filteredComplimentaryCandidates.some((c) => c.source === 'USER') && (
                              <div>
                                <p className="sticky top-0 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Konta rodziców
                                </p>
                                {filteredComplimentaryCandidates
                                  .filter((c) => c.source === 'USER')
                                  .map((c) => (
                                    <button
                                      key={c.key}
                                      type="button"
                                      onClick={() => setSelectedComplimentaryCandidateKey(c.key)}
                                      className={`flex w-full flex-col items-start border-t border-emerald-50 px-3 py-2 text-left text-sm hover:bg-emerald-50/80 ${
                                        selectedComplimentaryCandidateKey === c.key
                                          ? 'bg-emerald-100'
                                          : 'bg-white'
                                      }`}
                                    >
                                      <span className="font-medium text-zinc-900">
                                        {c.lastName} {c.firstName}
                                      </span>
                                      <span className="text-xs text-zinc-600">{c.email}</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                            {filteredComplimentaryCandidates.some(
                              (c) => c.source === 'ENROLLMENT',
                            ) && (
                              <div>
                                <p className="sticky top-0 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Zgłoszenia (bez konta rodzica)
                                </p>
                                {filteredComplimentaryCandidates
                                  .filter((c) => c.source === 'ENROLLMENT')
                                  .map((c) => (
                                    <button
                                      key={c.key}
                                      type="button"
                                      onClick={() => setSelectedComplimentaryCandidateKey(c.key)}
                                      className={`flex w-full flex-col items-start border-t border-emerald-50 px-3 py-2 text-left text-sm hover:bg-emerald-50/80 ${
                                        selectedComplimentaryCandidateKey === c.key
                                          ? 'bg-emerald-100'
                                          : 'bg-white'
                                      }`}
                                    >
                                      <span className="font-medium text-zinc-900">
                                        {c.lastName} {c.firstName}
                                      </span>
                                      <span className="text-xs text-zinc-600">{c.email}</span>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!selectedComplimentaryCandidateKey || discountsSaving}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        onClick={async () => {
                          if (!selectedComplimentaryCandidateKey) return;
                          setDiscountsSaving(true);
                          try {
                            const res = await fetch('/api/admin/discounts', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                candidateKey: selectedComplimentaryCandidateKey,
                              }),
                            });
                            const data = (await res.json().catch(() => ({}))) as {
                              message?: string;
                              complimentaryParents?: typeof complimentaryParents;
                              complimentaryCandidates?: typeof complimentaryCandidates;
                            };
                            if (!res.ok) {
                              pushToast('error', data.message ?? 'Nie udało się dodać rodzica');
                              return;
                            }
                            setComplimentaryParents(
                              Array.isArray(data.complimentaryParents)
                                ? data.complimentaryParents
                                : [],
                            );
                            if (Array.isArray(data.complimentaryCandidates)) {
                              setComplimentaryCandidates(data.complimentaryCandidates);
                            } else {
                              setComplimentaryCandidates((prev) =>
                                prev.filter((c) => c.key !== selectedComplimentaryCandidateKey),
                              );
                            }
                            setSelectedComplimentaryCandidateKey('');
                            pushToast('success', 'Dodano rodzica do trybu bez opłat');
                          } catch {
                            pushToast('error', 'Błąd dodawania rodzica');
                          } finally {
                            setDiscountsSaving(false);
                          }
                        }}
                      >
                        Dodaj wybranego
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {organizationSubTab === 'history' && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Rok szkolny</label>
                  <select
                    value={historyYearId}
                    onChange={(e) => setHistoryYearId(e.target.value)}
                    className="min-w-[220px] rounded-xl border border-emerald-200 px-3 py-2 text-sm"
                    disabled={
                      schoolYearLoading ||
                      schoolYears.filter((y) => !(y.isActive ?? y.active)).length === 0
                    }
                  >
                    {schoolYears.filter((y) => !(y.isActive ?? y.active)).length === 0 ? (
                      <option value="">Brak zamkniętych lat szkolnych</option>
                    ) : (
                      schoolYears
                        .filter((y) => !(y.isActive ?? y.active))
                        .slice()
                        .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'))
                        .map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name}
                          </option>
                        ))
                    )}
                  </select>
                </div>
                {historyData?.year && (
                  <p className="text-sm text-zinc-600">
                    {historyData.year.date_from} — {historyData.year.date_to}
                    {historyData.year.closed_at && (
                      <span className="ml-2">
                        · zamknięty{' '}
                        {new Date(historyData.year.closed_at).toLocaleDateString('pl-PL')}
                        {historyData.year.closed_by_name
                          ? ` przez ${historyData.year.closed_by_name}`
                          : ''}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: 'summary' as const, label: 'Podsumowanie' },
                    { key: 'details' as const, label: 'Szczegóły' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setHistorySection(t.key)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      historySection === t.key
                        ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                        : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {historyLoading || schoolYearLoading ? (
                <div className="space-y-2">
                  <div className="h-20 animate-pulse rounded-xl bg-emerald-100/80" />
                  <div className="h-32 animate-pulse rounded-xl bg-emerald-100/60" />
                </div>
              ) : !historyYearId ? (
                <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                  Historia pokazuje tylko zamknięte lata szkolne. Bieżący rok nie jest tu dostępny.
                </p>
              ) : !historyData ? (
                <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                  Wybierz rok szkolny, aby zobaczyć podsumowanie.
                </p>
              ) : historySection === 'summary' ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Grupy', value: historyData.summary.groups_count },
                      { label: 'Uczniowie', value: historyData.summary.students_count },
                      { label: 'Zajęcia', value: historyData.summary.lessons_count },
                      { label: 'Umowy', value: historyData.summary.contracts_count },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-emerald-100 bg-white px-4 py-3"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          {item.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-[#0f6e56]">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                    <div className="border-b border-emerald-50 px-4 py-3">
                      <h3 className="font-semibold text-[#0f6e56]">Lektorzy</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-emerald-50 text-zinc-700">
                          <tr>
                            <th className="px-4 py-3 text-left">Lektor</th>
                            <th className="px-4 py-3 text-left">Grupy</th>
                            <th className="px-4 py-3 text-left">Uczniowie</th>
                            <th className="px-4 py-3 text-left">Zajęcia</th>
                            <th className="px-4 py-3 text-left">Godziny</th>
                            <th className="px-4 py-3 text-left">Obecności</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyData.teachers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                                Brak statystyk lektorów — wyliczane przy zamknięciu roku.
                              </td>
                            </tr>
                          ) : (
                            historyData.teachers.map((t) => (
                              <tr key={t.id} className="border-t border-emerald-50">
                                <td className="px-4 py-3 font-medium">{t.name}</td>
                                <td className="px-4 py-3">{t.groups_count}</td>
                                <td className="px-4 py-3">{t.students_count}</td>
                                <td className="px-4 py-3">
                                  {t.lessons_completed}
                                  {t.lessons_cancelled > 0 && (
                                    <span className="text-zinc-500">
                                      {' '}
                                      (+{t.lessons_cancelled} anul.)
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">{t.total_hours} h</td>
                                <td className="px-4 py-3">{t.attendance_marked_count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                    <div className="border-b border-emerald-50 px-4 py-3">
                      <h3 className="font-semibold text-[#0f6e56]">Grupy i skład</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead className="bg-emerald-50 text-zinc-700">
                          <tr>
                            <th className="px-4 py-3 text-left">Grupa</th>
                            <th className="px-4 py-3 text-left">Lektor</th>
                            <th className="px-4 py-3 text-left">Poziom</th>
                            <th className="px-4 py-3 text-left">Uczniów</th>
                            <th className="px-4 py-3 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyData.groups.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                                Brak grup w tym roku.
                              </td>
                            </tr>
                          ) : (
                            historyData.groups.map((g) => (
                              <tr key={g.id} className="border-t border-emerald-50">
                                <td className="px-4 py-3 font-medium">{g.name}</td>
                                <td className="px-4 py-3">{g.teacher_name}</td>
                                <td className="px-4 py-3">{g.level ?? '—'}</td>
                                <td className="px-4 py-3">{g.students_count}</td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                      g.active
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-zinc-100 text-zinc-700'
                                    }`}
                                  >
                                    {g.active ? 'aktywna' : 'nieaktywna'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                    <div className="border-b border-emerald-50 px-4 py-3">
                      <h3 className="font-semibold text-[#0f6e56]">Uczniowie</h3>
                    </div>
                    <div className="max-h-[320px] overflow-x-auto overflow-y-auto">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="sticky top-0 bg-emerald-50 text-zinc-700">
                          <tr>
                            <th className="px-4 py-3 text-left">Uczeń</th>
                            <th className="px-4 py-3 text-left">Grupa</th>
                            <th className="px-4 py-3 text-left">Lektor</th>
                            <th className="px-4 py-3 text-left">Od</th>
                            <th className="px-4 py-3 text-left">Do</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyData.students.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                                Brak zapisów uczniów w tym roku.
                              </td>
                            </tr>
                          ) : (
                            historyData.students.map((s) => (
                              <tr
                                key={`${s.child_id}-${s.group_id}`}
                                className="border-t border-emerald-50"
                              >
                                <td className="px-4 py-3">{s.name}</td>
                                <td className="px-4 py-3">{s.group_name}</td>
                                <td className="px-4 py-3">{s.teacher_name}</td>
                                <td className="px-4 py-3">{s.enrolled_at}</td>
                                <td className="px-4 py-3">{s.left_at ?? '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => {
                        setActiveTab('classes');
                        setClassesCalRefreshSignal((n) => n + 1);
                      }}
                    >
                      Otwórz kalendarz zajęć
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: 'children' as const, label: 'Dzieci' },
                        { key: 'parents' as const, label: 'Rodzice' },
                        { key: 'payments' as const, label: 'Płatności' },
                        { key: 'invoices' as const, label: 'Faktury' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setHistoryDetailsTab(t.key)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          historyDetailsTab === t.key
                            ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                            : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {historyDetailsTab === 'children' && (
                    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                      <div className="border-b border-emerald-50 px-4 py-3">
                        <h3 className="font-semibold text-[#0f6e56]">Dzieci w tym roku</h3>
                        <p className="text-sm text-zinc-500">
                          Uczniowie przypisani do grup w wybranym roku szkolnym.
                        </p>
                      </div>
                      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                          <thead className="sticky top-0 bg-emerald-50 text-zinc-700">
                            <tr>
                              <th className="px-4 py-3 text-left">ID</th>
                              <th className="px-4 py-3 text-left">Dziecko</th>
                              <th className="px-4 py-3 text-left">Data ur.</th>
                              <th className="px-4 py-3 text-left">Rodzic</th>
                              <th className="px-4 py-3 text-left">Grupa</th>
                              <th className="px-4 py-3 text-left">Lektor</th>
                              <th className="px-4 py-3 text-left">Od</th>
                              <th className="px-4 py-3 text-left">Do</th>
                              <th className="px-4 py-3 text-left">Akcje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.students.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-6 text-center text-zinc-500">
                                  Brak dzieci w tym roku.
                                </td>
                              </tr>
                            ) : (
                              historyData.students.map((s) => (
                                <tr
                                  key={`${s.child_id}-${s.group_id}`}
                                  className="border-t border-emerald-50"
                                >
                                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                                    {s.client_number ?? '—'}
                                  </td>
                                  <td className="px-4 py-3 font-medium">{s.name}</td>
                                  <td className="px-4 py-3">{s.birth_date ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    {s.parent_name ?? '—'}
                                    {s.parent_client_number ? (
                                      <span className="ml-1 font-mono text-xs text-zinc-500">
                                        ({s.parent_client_number})
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3">{s.group_name}</td>
                                  <td className="px-4 py-3">{s.teacher_name}</td>
                                  <td className="px-4 py-3">{s.enrolled_at}</td>
                                  <td className="px-4 py-3">{s.left_at ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/portal/children/${s.child_id}`}
                                      className="inline-flex rounded-lg bg-zinc-200 px-3 py-1 text-zinc-900 hover:bg-zinc-300"
                                    >
                                      Profil
                                    </Link>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {historyDetailsTab === 'parents' && (
                    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                      <div className="border-b border-emerald-50 px-4 py-3">
                        <h3 className="font-semibold text-[#0f6e56]">Rodzice w tym roku</h3>
                        <p className="text-sm text-zinc-500">
                          Rodzice dzieci zapisanych do grup w wybranym roku szkolnym.
                        </p>
                      </div>
                      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[980px] text-sm">
                          <thead className="sticky top-0 bg-emerald-50 text-zinc-700">
                            <tr>
                              <th className="px-4 py-3 text-left">ID</th>
                              <th className="px-4 py-3 text-left">Rodzic</th>
                              <th className="px-4 py-3 text-left">Email</th>
                              <th className="px-4 py-3 text-left">Telefon</th>
                              <th className="px-4 py-3 text-left">Dzieci</th>
                              <th className="px-4 py-3 text-left">Akcje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historyData.parents ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                                  Brak rodziców w tym roku.
                                </td>
                              </tr>
                            ) : (
                              (historyData.parents ?? []).map((p) => (
                                <tr key={p.parent_id} className="border-t border-emerald-50">
                                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                                    {p.client_number ?? '—'}
                                  </td>
                                  <td className="px-4 py-3 font-medium">{p.name}</td>
                                  <td className="px-4 py-3">{p.email}</td>
                                  <td className="px-4 py-3">{p.phone ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    <span className="tabular-nums">{p.children_count}</span>
                                    {p.children_names ? (
                                      <span className="mt-0.5 block text-xs text-zinc-500">
                                        {p.children_names}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/portal/parents/${p.parent_id}`}
                                      className="inline-flex rounded-lg bg-zinc-200 px-3 py-1 text-zinc-900 hover:bg-zinc-300"
                                    >
                                      Profil
                                    </Link>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {historyDetailsTab === 'payments' && (
                    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                      <div className="border-b border-emerald-50 px-4 py-3">
                        <h3 className="font-semibold text-[#0f6e56]">Płatności</h3>
                        <p className="text-sm text-zinc-500">
                          Płatności powiązane z wybranym rokiem szkolnym.
                        </p>
                      </div>
                      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                          <thead className="sticky top-0 bg-emerald-50 text-zinc-700">
                            <tr>
                              <th className="px-4 py-3 text-left">Okres</th>
                              <th className="px-4 py-3 text-left">Opis</th>
                              <th className="px-4 py-3 text-left">Rodzic</th>
                              <th className="px-4 py-3 text-left">Dziecko</th>
                              <th className="px-4 py-3 text-left">Kwota</th>
                              <th className="px-4 py-3 text-left">Termin</th>
                              <th className="px-4 py-3 text-left">Opłacono</th>
                              <th className="px-4 py-3 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historyData.payments ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                                  Brak płatności w tym roku.
                                </td>
                              </tr>
                            ) : (
                              (historyData.payments ?? []).map((p) => {
                                const s = String(p.status ?? '').toUpperCase();
                                const statusNode =
                                  s === 'PAID' ? (
                                    <span className="font-medium text-emerald-700">Opłacona</span>
                                  ) : s === 'PENDING' || s === 'UNPAID' ? (
                                    <span className="font-medium text-red-700/80">Oczekuje</span>
                                  ) : s === 'CANCELLED' ? (
                                    <span className="text-zinc-500">Anulowana</span>
                                  ) : s === 'OVERDUE' ? (
                                    <span className="font-medium text-red-700/80">Zaległa</span>
                                  ) : (
                                    <span className="text-zinc-600">{p.status || '—'}</span>
                                  );
                                return (
                                  <tr key={p.id} className="border-t border-emerald-50">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {p.period_month ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">{p.description ?? '—'}</td>
                                    <td className="px-4 py-3">{p.parent_name ?? '—'}</td>
                                    <td className="px-4 py-3">{p.child_name ?? '—'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {p.amount != null
                                        ? `${p.amount.toLocaleString('pl-PL', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })} PLN`
                                        : '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {p.due_date ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {p.paid_at ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">{statusNode}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {historyDetailsTab === 'invoices' && (
                    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                      <div className="border-b border-emerald-50 px-4 py-3">
                        <h3 className="font-semibold text-[#0f6e56]">Faktury</h3>
                        <p className="text-sm text-zinc-500">
                          Faktury wystawione w wybranym roku szkolnym.
                        </p>
                      </div>
                      <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[1100px] text-sm">
                          <thead className="sticky top-0 bg-emerald-50 text-zinc-700">
                            <tr>
                              <th className="px-4 py-3 text-left">Numer</th>
                              <th className="px-4 py-3 text-left">Data</th>
                              <th className="px-4 py-3 text-left">Nabywca</th>
                              <th className="px-4 py-3 text-left">Pozycja</th>
                              <th className="px-4 py-3 text-left">Okres</th>
                              <th className="px-4 py-3 text-left">Kwota</th>
                              <th className="px-4 py-3 text-left">Status</th>
                              <th className="px-4 py-3 text-left">PDF</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historyData.invoices ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                                  Brak faktur w tym roku.
                                </td>
                              </tr>
                            ) : (
                              (historyData.invoices ?? []).map((inv) => {
                                const s = String(inv.payment_status ?? '').toUpperCase();
                                const statusNode =
                                  s === 'PAID' ? (
                                    <span className="font-medium text-emerald-700">Opłacona</span>
                                  ) : s === 'PENDING' || s === 'UNPAID' ? (
                                    <span className="font-medium text-red-700/80">Oczekuje</span>
                                  ) : s === 'CANCELLED' ? (
                                    <span className="text-zinc-500">Anulowana</span>
                                  ) : s === 'OVERDUE' ? (
                                    <span className="font-medium text-red-700/80">Zaległa</span>
                                  ) : (
                                    <span className="text-zinc-600">
                                      {inv.payment_status || '—'}
                                    </span>
                                  );
                                return (
                                  <tr key={inv.id} className="border-t border-emerald-50">
                                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{inv.issue_date}</td>
                                    <td className="px-4 py-3">
                                      <div>{inv.buyer_name}</div>
                                      {inv.parent_name ? (
                                        <div className="text-xs text-zinc-500">{inv.parent_name}</div>
                                      ) : null}
                                    </td>
                                    <td className="px-4 py-3">{inv.item_name}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {inv.period_month ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      {inv.amount.toLocaleString('pl-PL', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      PLN
                                    </td>
                                    <td className="px-4 py-3">{statusNode}</td>
                                    <td className="px-4 py-3">
                                      {inv.has_pdf ? (
                                        <a
                                          href={`/api/admin/invoices/${encodeURIComponent(inv.id)}?format=pdf`}
                                          className="font-semibold text-[#0f6e56] hover:underline"
                                        >
                                          Pobierz PDF
                                        </a>
                                      ) : (
                                        <span className="text-zinc-400">Brak</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}
      </section>
    );
  };

  const renderParentContractConsentFields = () => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-zinc-700">Umowa rodzica</label>
      <label className="flex items-start gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={groupForm.teacherPickupConsent}
          onChange={(e) =>
            setGroupForm((p) => ({ ...p, teacherPickupConsent: e.target.checked }))
          }
          className="mt-0.5 accent-emerald-600"
        />
        <span>
          Zgoda na odebranie dziecka przez lektora — przy generowaniu umowy rodzic otrzyma ten dokument
          do wydruku (nie jest załącznikiem do umowy).
        </span>
      </label>
    </div>
  );

  const renderGroupEditForm = (options?: { showBackButton?: boolean; groupId?: string }) => {
    const backButton = options?.showBackButton ? (
      <button
        type="button"
        className="rounded-xl bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800"
        onClick={resetGroupsToList}
      >
        Wróć do listy
      </button>
    ) : null;

    const fullViewLink =
      options?.groupId && groupsSubTab === 'organize' ? (
        <Link
          href={`/portal/groups/${options.groupId}`}
          className="inline-flex items-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          Pełny widok
        </Link>
      ) : null;

    return (
      <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900">Dane grupy</h3>
          <div className="flex flex-wrap gap-2">
            {fullViewLink}
            {backButton}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <GroupNamingFields
            className="contents"
            name={groupForm.name}
            level={groupForm.level}
            locked
            onLevelChange={() => {}}
            locationField={
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Lokalizacja</label>
                <select
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 bg-zinc-50 text-zinc-600"
                  value={groupForm.locationId}
                  disabled
                  title="Lokalizacja zablokowana po pierwszym zapisie"
                >
                  <option value="">Brak lokalizacji</option>
                  {(groupDetail?.locations ?? schoolLocations)
                    .filter((loc) => ('active' in loc ? loc.active : true))
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                </select>
              </div>
            }
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700">Nauczyciel</label>
            <select
              className="w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={groupForm.teacherId}
              onChange={(e) => setGroupForm((p) => ({ ...p, teacherId: e.target.value }))}
            >
              <option value="">Wybierz nauczyciela</option>
              {users.filter((u) => u.role === 'TEACHER' && u.active).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700">Maks. uczniów</label>
            <input
              className="w-full rounded-xl border border-emerald-200 px-3 py-2"
              type="number"
              min="1"
              value={groupForm.maxStudents}
              onChange={(e) =>
                setGroupForm((p) => ({ ...p, maxStudents: Number(e.target.value || 12) }))
              }
            />
          </div>
          {renderParentContractConsentFields()}
          {/*
           * Ceny grupy wyłączone — stawki ustala manager per dziecko przy propozycji.
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:col-span-2">
            ... Stawka ratalna / jednorazowa / za zajęcia ...
          </div>
          */}
          <div className="space-y-1 md:col-span-2">
            <label className="block text-sm font-medium text-zinc-700">Status grupy</label>
            <label className="flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={groupForm.active}
                onChange={(e) => setGroupForm((p) => ({ ...p, active: e.target.checked }))}
                className="accent-emerald-600"
              />
              Aktywna grupa
            </label>
          </div>
        </div>
        {/* <p className="mt-3 text-xs text-zinc-500">
          Stawki ratalna i jednorazowa dla tej grupy — zapisują się tutaj i trafiają do umowy rodzica.
        </p> */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={groupSaving}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void saveGroupForm()}
          >
            {groupSaving ? 'Zapisywanie…' : 'Zapisz zmiany'}
          </button>
        </div>
      </section>
    );
  };

  const renderGroupScheduleAndGenerateSections = (
    detail: GroupDetail | null,
    groupId: string | null,
    opts?: { quietReload?: boolean; disabled?: boolean },
  ) => {
    const quietReload = opts?.quietReload === true;
    const disabled = opts?.disabled === true || !groupId;
    const reloadDetail = groupId
      ? () => loadGroupDetail(groupId, quietReload ? { quiet: true } : getGroupDetailReloadOptions(groupId))
      : () => Promise.resolve();
    const scheduleTemplates = detail?.scheduleTemplates ?? [];
    const schoolYearLessons = detail?.schoolYearLessons ?? [];
    const futureLessonsCount = detail?.generatedLessons?.futureCount ?? 0;
    const completedLessonsCount = detail?.generatedLessons?.completedCount ?? 0;
    const schoolYearLessonCount =
      detail?.generatedLessons?.schoolYearCount ?? schoolYearLessons.length;
    const lessonsYearLabel =
      detail?.lessonsSchoolYear?.name ?? detail?.activeSchoolYear?.name ?? null;
    const dayNames: Record<number, string> = {
      1: 'Poniedziałek',
      2: 'Wtorek',
      3: 'Środa',
      4: 'Czwartek',
      5: 'Piątek',
      6: 'Sobota',
      7: 'Niedziela',
    };

    return (
      <>
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Harmonogram</h4>
              <p className="text-sm text-zinc-500">Stałe terminy grupy (dzień, godzina, czas trwania, lokalizacja).</p>
              {disabled && (
                <p className="mt-1 text-xs text-amber-700">Najpierw zapisz grupę, aby dodać terminy.</p>
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => openScheduleModal()}
            >
              + Dodaj termin
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {scheduleTemplates.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-zinc-600">
                Brak zdefiniowanych terminów.
              </p>
            ) : (
              scheduleTemplates.map((st) => (
                <div key={st.id} className="flex items-center justify-between rounded-xl border border-emerald-100 p-3">
                  <div>
                    <p>
                      {dayNames[st.day_of_week] ?? `Dzień ${st.day_of_week}`} · {st.start_time.slice(0, 5)} · {st.duration_min} min
                    </p>
                    <p className="text-zinc-600">{st.location_name ?? '-'}</p>
                    {(st.future_lessons_count ?? 0) > 0 || (st.completed_lessons_count ?? 0) > 0 ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Zajęcia wygenerowane (
                        {[
                          (st.future_lessons_count ?? 0) > 0
                            ? `${st.future_lessons_count} nadchodzących`
                            : null,
                          (st.completed_lessons_count ?? 0) > 0
                            ? `${st.completed_lessons_count} zakończonych`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        )
                      </p>
                    ) : (
                      !disabled && (
                        <p className="mt-1 text-xs text-zinc-500">Brak wygenerowanych zajęć dla tego terminu</p>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-red-600 px-3 py-1 text-white"
                    onClick={async () => {
                      const res = await fetch(`/api/admin/schedule-templates/${st.id}`, { method: 'DELETE' });
                      if (!res.ok) {
                        pushToast('error', 'Nie udało się usunąć terminu');
                        return;
                      }
                      pushToast('success', 'Termin usunięty');
                      await reloadDetail();
                    }}
                  >
                    Usuń
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Zajęcia w kalendarzu</h4>
              <p className="text-sm text-zinc-600">
                Lista zajęć wygenerowanych z harmonogramu na aktywny rok szkolny. Zajęcia powstają
                po kliknięciu „Wygeneruj zajęcia” (z pominięciem dni wolnych).
              </p>
              {disabled && (
                <p className="mt-1 text-xs text-amber-700">Najpierw zapisz grupę, aby zobaczyć zajęcia.</p>
              )}
              {!disabled && detail?.scheduleNeedsConfirmation && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Harmonogram nie jest potwierdzony na rok{' '}
                  {detail.activeSchoolYear?.name ?? 'aktywny'}. Uzupełnij dni wolne, wpisz liczbę zajęć
                  i kliknij Wygeneruj zajęcia.
                </p>
              )}
              {!disabled &&
                !detail?.scheduleNeedsConfirmation &&
                scheduleTemplates.length > 0 &&
                detail?.missingGeneratedLessons === true && (
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  Brak wygenerowanych zajęć dla tej grupy w aktywnym roku szkolnym.
                </p>
              )}
              {!disabled && schoolYearLessonCount > 0 && (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  W roku szkolnym{lessonsYearLabel ? ` ${lessonsYearLabel}` : ''}:{' '}
                  <strong>{schoolYearLessonCount}</strong>{' '}
                  {schoolYearLessonCount === 1 ? 'zajęcie' : schoolYearLessonCount < 5 ? 'zajęcia' : 'zajęć'}
                  {futureLessonsCount > 0 || completedLessonsCount > 0
                    ? ` (${[
                        futureLessonsCount > 0 ? `${futureLessonsCount} nadchodzących` : null,
                        completedLessonsCount > 0 ? `${completedLessonsCount} zakończonych` : null,
                      ]
                        .filter(Boolean)
                        .join(', ')})`
                    : ''}
                  .
                </p>
              )}
            </div>
            {!disabled &&
              detail?.activeSchoolYear &&
              scheduleTemplates.length > 0 && (
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-zinc-700">Liczba zajęć</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    className="w-full rounded-xl border border-emerald-200 px-3 py-2 sm:w-28"
                    value={generateLessonsCount}
                    onChange={(e) => setGenerateLessonsCount(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                    detail.scheduleNeedsConfirmation
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[#0f6e56] hover:bg-[#0c5a46]'
                  }`}
                  onClick={async () => {
                    if (!groupId) return;
                    const count = Math.floor(Number(generateLessonsCount));
                    if (!Number.isFinite(count) || count < 1 || count > 500) {
                      pushToast('error', 'Podaj liczbę zajęć w zakresie 1–500');
                      return;
                    }
                    setBusy(true);
                    try {
                      const res = await fetch(`/api/admin/groups/${groupId}/confirm-schedule`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lessonCount: count }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        pushToast('error', data.message ?? 'Nie udało się wygenerować zajęć');
                        return;
                      }
                      pushToast('success', data.message ?? 'Wygenerowano zajęcia');
                      setClassesCalRefreshSignal((s) => s + 1);
                      await reloadDetail();
                      const gRes = await fetch('/api/admin/groups');
                      if (gRes.ok) {
                        const gJson = await gRes.json();
                        setGroups((gJson.groups ?? []) as GroupRow[]);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Wygeneruj zajęcia
                </button>
              </div>
            )}
          </div>

          {!disabled && (
            <div className="mt-3">
              {schoolYearLessons.length === 0 ? (
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
                  {!detail?.activeSchoolYear && !detail?.lessonsSchoolYear
                    ? 'Brak aktywnego roku szkolnego — nie ma listy zajęć do wyświetlenia.'
                    : 'Brak zajęć w planie na ten rok szkolny.'}
                </p>
              ) : (
                <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
                  {schoolYearLessons.map((lesson) => {
                    const isCompleted = lesson.status === 'COMPLETED';
                    const isCancelled = lesson.status === 'CANCELLED';
                    const statusLabel = isCompleted
                      ? 'zakończone'
                      : isCancelled
                        ? 'anulowane'
                        : 'zaplanowane';
                    const statusClass = isCompleted
                      ? 'bg-zinc-200 text-zinc-700'
                      : isCancelled
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800';
                    const rowClass = isCompleted
                      ? 'border-zinc-200 bg-zinc-50'
                      : isCancelled
                        ? 'border-rose-100 bg-rose-50/50'
                        : 'border-emerald-100 bg-emerald-50/40';
                    return (
                      <li
                        key={lesson.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${rowClass}`}
                      >
                        <span className={`font-medium ${isCompleted || isCancelled ? 'text-zinc-600' : 'text-zinc-900'}`}>
                          {formatSchoolDateTime(lesson.scheduled_at)}
                          {lesson.duration_min ? (
                            <span className="ml-2 font-normal text-zinc-500">· {lesson.duration_min} min</span>
                          ) : null}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </>
    );
  };

  const renderGroupManageSections = (detail: GroupDetail, groupId: string, opts?: { quietReload?: boolean }) => {
    const quietReload = opts?.quietReload === true;
    const reloadDetail = () => loadGroupDetail(groupId, quietReload ? { quiet: true } : getGroupDetailReloadOptions(groupId));
    const activeStudents = detail.students.filter((st) => !st.left_at);
    return (
      <>
        {renderGroupScheduleAndGenerateSections(detail, groupId, { quietReload })}

        <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Uczniowie grupy</h4>
              <p className="text-sm text-zinc-500">Zarządzaj przypisaniami uczniów do tej grupy.</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white"
              onClick={() => openAddStudentModal()}
            >
              + Dodaj ucznia
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {activeStudents.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-zinc-600">
                Brak uczniów w grupie.
              </p>
            ) : (
              activeStudents.map((st) => (
                <div key={st.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 p-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span>
                        {st.first_name} {st.last_name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          st.confirmed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {st.confirmed ? 'potwierdzony' : 'niepotwierdzony'}
                      </span>
                    </p>
                    <p className="text-zinc-600">{st.birth_date}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-red-600 px-3 py-1 text-white"
                    onClick={async () => {
                      const res = await fetch(`/api/admin/group-students/${st.id}`, { method: 'DELETE' });
                      if (!res.ok) {
                        pushToast('error', 'Nie udało się usunąć ucznia z grupy');
                        return;
                      }
                      pushToast('success', 'Uczeń usunięty z grupy');
                      await reloadDetail();
                    }}
                  >
                    Usuń z grupy
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </>
    );
  };

  const renderGroups = () => {
    if (groupLoading) {
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      );
    }

    if (
      selectedGroupId &&
      groupDetail &&
      groupsSubTab !== 'organize' &&
      groupsSubTab !== 'add' &&
      groupsSubTab !== 'yearLessons'
    ) {
      return (
        <div className="space-y-4">
          {renderGroupEditForm({ showBackButton: true, groupId: selectedGroupId })}
          {renderGroupManageSections(groupDetail, selectedGroupId)}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-emerald-100 bg-white p-4">
          <GroupSubTabButtons
            active={groupsSubTab}
            setGroupsSubTab={setGroupsSubTab}
            onEnterListTab={() => {
              setSelectedGroupId(null);
              setGroupDetail(null);
            }}
            onOrganizeStateReset={() => {
              setOrganizeExpandedGroupId(null);
              setSelectedGroupId(null);
              setGroupDetail(null);
            }}
            onEnterYearLessonsTab={() => {
              setSelectedGroupId(null);
              setGroupDetail(null);
              setYearLessonsExpandedGroupId(null);
            }}
            onEnterAddTab={() => {
              setSelectedGroupId(null);
              setGroupDetail(null);
              setGroupForm({
                id: '',
                schoolId: sessionSchoolId ?? '',
                locationId: '',
                name: '',
                level: '',
                teacherId: '',
                maxStudents: 12,
                active: true,
                priceMonthly: '',
                priceYearly: '',
                pricePerLesson: '',
                teacherPickupConsent: false,
              });
              void loadLocations();
            }}
          />
          {groupsSubTab === 'organize' && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="organize-filter-name" className="block text-xs font-medium text-zinc-600">
                  Nazwa grupy
                </label>
                <select
                  id="organize-filter-name"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                  value={organizeFilterName}
                  onChange={(e) => setOrganizeFilterName(e.target.value)}
                >
                  <option value="">Wszystkie</option>
                  {organizeFilterNameOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="organize-filter-location" className="block text-xs font-medium text-zinc-600">
                  Lokalizacja
                </label>
                <select
                  id="organize-filter-location"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                  value={organizeFilterLocation}
                  onChange={(e) => setOrganizeFilterLocation(e.target.value)}
                >
                  <option value="">Wszystkie</option>
                  {organizeHasGroupsWithoutLocation && (
                    <option value={ORGANIZE_FILTER_NO_LOCATION}>Brak lokalizacji</option>
                  )}
                  {organizeFilterLocationOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="organize-filter-teacher" className="block text-xs font-medium text-zinc-600">
                  Nauczyciel
                </label>
                <select
                  id="organize-filter-teacher"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                  value={organizeFilterTeacher}
                  onChange={(e) => setOrganizeFilterTeacher(e.target.value)}
                >
                  <option value="">Wszyscy</option>
                  {organizeHasGroupsWithoutTeacher && (
                    <option value={ORGANIZE_FILTER_NO_TEACHER}>Brak nauczyciela</option>
                  )}
                  {organizeFilterTeacherOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {groupsSubTab === 'list' ? (
            <div className="space-y-3">
              {(() => {
                const hasActiveYear = Boolean(activeSchoolYear);
                const unconfirmedGroups = groups.filter(
                  (g) => g.active && g.schedule_needs_confirmation === true,
                );
                const missingLessonGroups = groups.filter(
                  (g) =>
                    g.active &&
                    g.missing_generated_lessons === true &&
                    g.schedule_needs_confirmation !== true,
                );
                const overCapacityGroups = groups.filter(
                  (g) =>
                    g.active && Number(g.students_count) > Number(g.max_students),
                );
                if (
                  hasActiveYear &&
                  unconfirmedGroups.length === 0 &&
                  missingLessonGroups.length === 0 &&
                  overCapacityGroups.length === 0
                ) {
                  return null;
                }
                return (
                  <div className="space-y-2">
                    {!hasActiveYear && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="font-semibold">
                          Brak aktywnego roku szkolnego — ustaw lub aktywuj rok w zakładce „Rok
                          szkolny”.
                        </p>
                      </div>
                    )}
                    {hasActiveYear && unconfirmedGroups.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="font-semibold">
                          Niepotwierdzony harmonogram na aktywny rok — wygeneruj zajęcia:
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                          {unconfirmedGroups.map((g) => (
                            <li key={g.id}>
                              <button
                                type="button"
                                className="font-medium underline decoration-red-400 underline-offset-2 hover:text-red-950"
                                onClick={() => void loadGroupDetail(g.id)}
                              >
                                {g.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {hasActiveYear && missingLessonGroups.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="font-semibold">
                          Brak wygenerowanych zajęć dla{' '}
                          {missingLessonGroups.length === 1 ? 'grupy' : 'grup'}:
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                          {missingLessonGroups.map((g) => (
                            <li key={g.id}>
                              <button
                                type="button"
                                className="font-medium underline decoration-red-400 underline-offset-2 hover:text-red-950"
                                onClick={() => void loadGroupDetail(g.id)}
                              >
                                {g.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {overCapacityGroups.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="font-semibold">
                          {overCapacityGroups.length === 1
                            ? 'W grupie jest więcej osób niż limit miejsc:'
                            : 'W grupach jest więcej osób niż limit miejsc:'}
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                          {overCapacityGroups.map((g) => (
                            <li key={g.id}>
                              <button
                                type="button"
                                className="font-medium underline decoration-red-400 underline-offset-2 hover:text-red-950"
                                onClick={() => void loadGroupDetail(g.id)}
                              >
                                {g.name} ({g.students_count}/{g.max_students})
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-emerald-50 text-zinc-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Nazwa</th>
                    <th className="px-4 py-3 text-left">Poziom</th>
                    <th className="px-4 py-3 text-left">Nauczyciel</th>
                    <th className="px-4 py-3 text-left">Lokalizacja</th>
                    <th className="px-4 py-3 text-left">Termin zajęć</th>
                    {/* <th className="px-4 py-3 text-left">Ceny</th> — cennik grupy wyłączony */}
                    <th className="px-4 py-3 text-left">Uczniowie</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    // const priceLines = formatGroupPriceLines(g); — cennik grupy wyłączony
                    return (
                    <tr
                      key={g.id}
                      className="cursor-pointer border-t border-emerald-50 hover:bg-emerald-50/40"
                      onClick={() => loadGroupDetail(g.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{g.name}</div>
                        {g.active && g.schedule_needs_confirmation ? (
                          <p className="mt-1 text-xs font-semibold text-red-600">
                            Niepotwierdzony harmonogram
                          </p>
                        ) : g.active && g.missing_generated_lessons ? (
                          <p className="mt-1 text-xs font-semibold text-red-600">
                            Brak wygenerowanych zajęć
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{g.level ?? '-'}</td>
                      <td className="px-4 py-3">{g.teacher_name ?? '-'}</td>
                      <td className="px-4 py-3">{g.location_name ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-normal text-zinc-700">{g.schedule ?? '-'}</td>
                      {/*
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-700">
                        {priceLines...}
                      </td>
                      */}
                      <td className="px-4 py-3">{g.students_count}/{g.max_students}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${g.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
                          {g.active ? 'aktywna' : 'nieaktywna'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            void loadGroupDetail(g.id);
                          }}
                        >
                          Edytuj
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          ) : groupsSubTab === 'add' ? (
            <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
              <h3 className="text-lg font-semibold">{groupForm.id ? 'Edycja grupy' : 'Nowa grupa'}</h3>
              <GroupNamingFields
                className="space-y-3"
                name={groupForm.name}
                level={groupForm.level}
                locked={Boolean(groupForm.id)}
                onLevelChange={(level) => {
                  if (groupForm.id) return;
                  setGroupForm((p) => ({
                    ...p,
                    level,
                    name: computeAutoGroupName(level, p.locationId),
                  }));
                }}
                locationField={
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-zinc-700">Lokalizacja</label>
                    <select
                      className="w-full rounded-xl border border-emerald-200 px-3 py-2 bg-white disabled:bg-zinc-50 disabled:text-zinc-600"
                      value={groupForm.locationId}
                      disabled={Boolean(groupForm.id)}
                      title={
                        groupForm.id
                          ? 'Lokalizacja zablokowana po pierwszym zapisie'
                          : undefined
                      }
                      onChange={(e) => {
                        if (groupForm.id) return;
                        const locationId = e.target.value;
                        setGroupForm((p) => ({
                          ...p,
                          locationId,
                          name: computeAutoGroupName(p.level, locationId),
                        }));
                      }}
                    >
                      <option value="">Wybierz lokalizację</option>
                      {schoolLocations.filter((loc) => loc.active).map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Nauczyciel</label>
                <select className="w-full rounded-xl border border-emerald-200 px-3 py-2" value={groupForm.teacherId} onChange={(e) => setGroupForm((p) => ({ ...p, teacherId: e.target.value }))}>
                  <option value="">Wybierz nauczyciela</option>
                  {users.filter((u) => u.role === 'TEACHER' && u.active).map((t) => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Maksymalna liczba uczniów</label>
                <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="number" min="1" value={groupForm.maxStudents} onChange={(e) => setGroupForm((p) => ({ ...p, maxStudents: Number(e.target.value || 12) }))} />
              </div>
              {renderParentContractConsentFields()}
              {/*
               * Ceny grupy wyłączone — stawki ustala manager per dziecko przy propozycji.
              <div className="grid gap-3 sm:grid-cols-3">...</div>
              <p className="text-xs text-zinc-500">Stawki dla tej grupy...</p>
              */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Status grupy</label>
                <label className="flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={groupForm.active}
                    onChange={(e) => setGroupForm((p) => ({ ...p, active: e.target.checked }))}
                    className="accent-emerald-600"
                  />
                  Aktywna grupa
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-zinc-200 px-3 py-2"
                  onClick={() => {
                    setGroupsSubTab('list');
                    setSelectedGroupId(null);
                    setGroupDetail(null);
                  }}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white disabled:opacity-60"
                  disabled={groupSaving}
                  onClick={async () => {
                    if (!groupForm.level.trim() || !isHarryEnglishLevelCode(groupForm.level.trim())) {
                      pushToast('error', 'Wybierz poziom z listy (P3–P6, Sz1–Sz8, Sz8E)');
                      return;
                    }
                    if (!groupForm.locationId.trim()) {
                      pushToast('error', 'Wybierz lokalizację grupy');
                      return;
                    }
                    if (!groupForm.name.trim()) {
                      pushToast('error', 'Uzupełnij poziom i lokalizację — nazwa powstanie automatycznie');
                      return;
                    }
                    if (!groupForm.teacherId) {
                      pushToast('error', 'Wybierz nauczyciela dla grupy');
                      return;
                    }
                    if (groupForm.id) {
                      await saveGroupForm();
                      return;
                    }
                    setGroupSaving(true);
                    try {
                      const res = await fetch('/api/admin/groups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          level: groupForm.level.trim(),
                          teacherId: groupForm.teacherId,
                          maxStudents: groupForm.maxStudents,
                          active: groupForm.active,
                          schoolId: groupForm.schoolId || null,
                          locationId: groupForm.locationId || null,
                          priceMonthly: null,
                          priceYearly: null,
                          pricePerLesson: null,
                          teacherPickupConsent: groupForm.teacherPickupConsent,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        pushToast('error', data.message ?? 'Nie udało się zapisać grupy');
                        return;
                      }
                      pushToast('success', data.name ? `Grupa zapisana: ${data.name}` : 'Grupa zapisana');
                      await loadData();
                      await loadGroupDetail(data.id, { quiet: true });
                    } catch {
                      pushToast('error', 'Nie udało się zapisać grupy');
                    } finally {
                      setGroupSaving(false);
                    }
                  }}
                >
                  {groupSaving ? 'Zapisywanie…' : groupForm.id ? 'Zapisz zmiany' : 'Zapisz'}
                </button>
              </div>
            </div>
            {renderGroupScheduleAndGenerateSections(
              groupForm.id && groupDetail?.group.id === groupForm.id ? groupDetail : null,
              groupForm.id || null,
              { quietReload: true, disabled: !groupForm.id },
            )}
            </div>
          ) : groupsSubTab === 'yearLessons' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-600">
                    Podsumowanie liczby zajęć w roku szkolnym. Rozwiń grupę, aby zobaczyć wszystkie
                    terminy.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="year-lessons-year"
                    className="mb-1 block text-xs font-medium text-zinc-600"
                  >
                    Rok szkolny
                  </label>
                  <select
                    id="year-lessons-year"
                    className="min-w-[220px] rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                    value={yearLessonsYearId}
                    onChange={(e) => {
                      setYearLessonsYearId(e.target.value);
                      setYearLessonsExpandedGroupId(null);
                    }}
                    disabled={schoolYearLoading || schoolYears.length === 0}
                  >
                    {schoolYears.length === 0 ? (
                      <option value="">Brak lat szkolnych</option>
                    ) : (
                      schoolYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                          {y.isActive ?? y.active ? ' (bieżący)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {yearLessonsLoading || schoolYearLoading ? (
                <div className="space-y-2">
                  <SkeletonBlock />
                  <SkeletonBlock />
                </div>
              ) : !yearLessonsYearId || !yearLessonsSchoolYear ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">
                  Brak wybranego roku szkolnego — ustaw lub aktywuj rok w zakładce „Rok szkolny”.
                </p>
              ) : yearLessonsGroups.length === 0 ? (
                <p className="rounded-xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm text-zinc-600">
                  Brak grup w szkole.
                </p>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm text-zinc-700">
                    <span className="font-semibold text-[#0f6e56]">
                      {yearLessonsSchoolYear.name ?? 'Rok szkolny'}
                    </span>
                    {' · '}
                    łącznie{' '}
                    <span className="font-semibold text-zinc-900">
                      {yearLessonsGroups.reduce((sum, g) => sum + g.lessons_count, 0)}
                    </span>{' '}
                    zajęć w{' '}
                    <span className="font-semibold text-zinc-900">{yearLessonsGroups.length}</span>{' '}
                    grupach
                  </div>
                  <div className="space-y-2">
                    {yearLessonsGroups.map((g) => {
                      const expanded = yearLessonsExpandedGroupId === g.id;
                      return (
                        <div
                          key={g.id}
                          className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
                        >
                          <button
                            type="button"
                            className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-emerald-50/50"
                            onClick={() =>
                              setYearLessonsExpandedGroupId(expanded ? null : g.id)
                            }
                          >
                            <span
                              className={`mt-0.5 shrink-0 text-emerald-700 transition ${expanded ? 'rotate-90' : ''}`}
                              aria-hidden
                            >
                              ▶
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="text-base font-semibold text-zinc-900">{g.name}</p>
                                <p className="shrink-0 text-sm font-bold text-[#0f6e56]">
                                  {g.lessons_count}{' '}
                                  {g.lessons_count === 1
                                    ? 'zajęcie'
                                    : g.lessons_count >= 2 && g.lessons_count <= 4
                                      ? 'zajęcia'
                                      : 'zajęć'}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {g.schedule && g.schedule !== '-' ? (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                                    Harmonogram: {g.schedule}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                                  Nauczyciel: {g.teacher_name ?? '-'}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                                  Lokalizacja: {g.location_name ?? '-'}
                                </span>
                                {g.scheduled_count > 0 ? (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800">
                                    {g.scheduled_count} zaplanowanych
                                  </span>
                                ) : null}
                                {g.completed_count > 0 ? (
                                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-semibold text-zinc-700">
                                    {g.completed_count} zakończonych
                                  </span>
                                ) : null}
                                {g.cancelled_count > 0 ? (
                                  <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-semibold text-rose-800">
                                    {g.cancelled_count} anulowanych
                                  </span>
                                ) : null}
                                <span
                                  className={`rounded-full px-2.5 py-0.5 font-semibold ${g.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}
                                >
                                  {g.active ? 'aktywna' : 'nieaktywna'}
                                </span>
                              </div>
                            </div>
                          </button>
                          {expanded && (
                            <div className="border-t border-emerald-100 bg-emerald-50/40 px-4 py-4">
                              {g.lessons.length === 0 ? (
                                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
                                  Brak zajęć w planie na ten rok szkolny.
                                </p>
                              ) : (
                                <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
                                  {g.lessons.map((lesson) => {
                                    const isCompleted = lesson.status === 'COMPLETED';
                                    const isCancelled = lesson.status === 'CANCELLED';
                                    const statusLabel = isCompleted
                                      ? 'zakończone'
                                      : isCancelled
                                        ? 'anulowane'
                                        : 'zaplanowane';
                                    const statusClass = isCompleted
                                      ? 'bg-zinc-200 text-zinc-700'
                                      : isCancelled
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-emerald-100 text-emerald-800';
                                    const rowClass = isCompleted
                                      ? 'border-zinc-200 bg-zinc-50'
                                      : isCancelled
                                        ? 'border-rose-100 bg-rose-50/50'
                                        : 'border-emerald-100 bg-emerald-50/40';
                                    return (
                                      <li
                                        key={lesson.id}
                                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${rowClass}`}
                                      >
                                        <span
                                          className={`font-medium ${isCompleted || isCancelled ? 'text-zinc-600' : 'text-zinc-900'}`}
                                        >
                                          {formatSchoolDateTime(lesson.scheduled_at)}
                                          {lesson.duration_min ? (
                                            <span className="ml-2 font-normal text-zinc-500">
                                              · {lesson.duration_min} min
                                            </span>
                                          ) : null}
                                        </span>
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}
                                        >
                                          {statusLabel}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-zinc-600">
                Rozwiń grupę, aby zarządzać harmonogramem, uczniami i generowaniem zajęć — bez przechodzenia na osobną stronę.
              </p>
              {groups.length === 0 ? (
                <p className="rounded-xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm text-zinc-600">
                  Brak grup w szkole.
                </p>
              ) : organizeFilteredGroups.length === 0 ? (
                <p className="rounded-xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm text-zinc-600">
                  Brak grup spełniających kryteria wyszukiwania.
                </p>
              ) : (
                organizeFilteredGroups.map((g) => {
                  const expanded = organizeExpandedGroupId === g.id;
                  const detailReady = groupDetail?.group.id === g.id;
                  return (
                    <div
                      key={g.id}
                      className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-emerald-50/50"
                        onClick={() => {
                          if (expanded) {
                            setOrganizeExpandedGroupId(null);
                            if (selectedGroupId === g.id) {
                              setSelectedGroupId(null);
                              setGroupDetail(null);
                            }
                          } else {
                            setOrganizeExpandedGroupId(g.id);
                            void loadGroupDetail(g.id, { quiet: true });
                          }
                        }}
                      >
                        <span
                          className={`mt-0.5 shrink-0 text-emerald-700 transition ${expanded ? 'rotate-90' : ''}`}
                          aria-hidden
                        >
                          ▶
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-base font-semibold text-zinc-900">{g.name}</p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                              Poziom: {g.level ?? '-'}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                              Nauczyciel: {g.teacher_name ?? '-'}
                            </span>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-800">
                              Lokalizacja: {g.location_name ?? '-'}
                            </span>
                            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-700">
                              Uczniowie: {g.students_count}/{g.max_students}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-semibold ${g.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}
                            >
                              {g.active ? 'aktywna' : 'nieaktywna'}
                            </span>
                          </div>
                        </div>
                      </button>
                      {expanded && (
                        <div className="space-y-4 border-t border-emerald-100 bg-emerald-50/40 px-4 py-4">
                          {organizeLoadingGroupId === g.id || !detailReady ? (
                            <div className="space-y-3">
                              <SkeletonBlock />
                              <SkeletonBlock />
                            </div>
                          ) : (
                            <>
                              {renderGroupEditForm({ groupId: g.id })}
                              {renderGroupManageSections(groupDetail, g.id, { quietReload: true })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderSettlements = () => (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Podsumowanie miesiąca</h2>
        <p className="text-sm text-zinc-600">
          Podsumowanie do weryfikacji faktur — liczone są wyłącznie zajęcia ze statusem COMPLETED.
          Uczniowie: średnia liczba zapisanych do grupy w dniu zajęć.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Rok szkolny</label>
          <select
            value={settlementYearId}
            onChange={(e) => {
              setSettlementYearId(e.target.value);
              setSettlementMonth('');
            }}
            className="min-w-[220px] rounded-xl border border-emerald-200 px-3 py-2 text-sm"
            disabled={schoolYearLoading || schoolYears.length === 0}
          >
            {schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.isActive ?? y.active ? ' (bieżący)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Miesiąc</label>
          <select
            value={settlementMonth}
            onChange={(e) => setSettlementMonth(e.target.value)}
            className="min-w-[200px] rounded-xl border border-emerald-200 px-3 py-2 text-sm"
          >
            <option value="">Wszystkie miesiące</option>
            {settlementMonthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T12:00:00`).toLocaleDateString('pl-PL', {
                  month: 'long',
                  year: 'numeric',
                })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {settlementLoading || schoolYearLoading ? (
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-xl bg-emerald-100/80" />
          <div className="h-32 animate-pulse rounded-xl bg-emerald-100/60" />
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            <div className="border-b border-emerald-50 px-4 py-3">
              <h3 className="font-semibold text-[#0f6e56]">Lektorzy — zajęcia per grupa</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-emerald-50 text-zinc-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Lektor</th>
                    <th className="px-4 py-3 text-left">Miesiąc</th>
                    <th className="px-4 py-3 text-left">Grupa</th>
                    <th className="px-4 py-3 text-left">Lokalizacja</th>
                    <th className="px-4 py-3 text-left">Zajęć</th>
                    <th className="px-4 py-3 text-left">Uczniów</th>
                    <th className="px-4 py-3 text-left">Godziny</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherSettlementRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                        Brak zajęć COMPLETED w wybranym okresie.
                      </td>
                    </tr>
                  ) : (
                    teacherSettlementRows.map((row) => (
                      <tr
                        key={`${row.teacher_id}-${row.group_id}-${row.location_id}-${row.period_month}`}
                        className="border-t border-emerald-50"
                      >
                        <td className="px-4 py-3 font-medium">{row.teacher_name}</td>
                        <td className="px-4 py-3">{formatSettlementMonthPl(row.period_month)}</td>
                        <td className="px-4 py-3">{row.group_name}</td>
                        <td className="px-4 py-3">{row.location_name}</td>
                        <td className="px-4 py-3">{row.lessons_count}</td>
                        <td className="px-4 py-3">{row.students_count}</td>
                        <td className="px-4 py-3">
                          {(row.total_duration_min / 60).toFixed(1)} h
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
            <div className="border-b border-emerald-50 px-4 py-3">
              <h3 className="font-semibold text-[#0f6e56]">Lokalizacje — zajęcia odbyte</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-emerald-50 text-zinc-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Lokalizacja</th>
                    <th className="px-4 py-3 text-left">Lektor</th>
                    <th className="px-4 py-3 text-left">Miesiąc</th>
                    <th className="px-4 py-3 text-left">Zajęć</th>
                    <th className="px-4 py-3 text-left">Godziny</th>
                  </tr>
                </thead>
                <tbody>
                  {locationSettlementRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                        Brak zajęć COMPLETED w wybranym okresie.
                      </td>
                    </tr>
                  ) : (
                    locationSettlementRows.map((row) => (
                      <tr
                        key={`${row.location_id}-${row.teacher_id}-${row.period_month}`}
                        className="border-t border-emerald-50"
                      >
                        <td className="px-4 py-3 font-medium">{row.location_name}</td>
                        <td className="px-4 py-3">{row.teacher_name}</td>
                        <td className="px-4 py-3">{formatSettlementMonthPl(row.period_month)}</td>
                        <td className="px-4 py-3">{row.lessons_count}</td>
                        <td className="px-4 py-3">
                          {(row.total_duration_min / 60).toFixed(1)} h
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );

  const renderBilling = () => {
    const tabBtn = (active: boolean) =>
      active
        ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
        : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50';

    const formatPln = (n: number) =>
      `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`;

    const paymentStatusLabel = (status: string | null) => {
      const s = String(status ?? '').toUpperCase();
      if (s === 'PAID') {
        return <span className="font-medium text-emerald-700">Opłacona</span>;
      }
      if (s === 'PENDING' || s === 'UNPAID') {
        return <span className="font-medium text-red-700/80">Oczekuje</span>;
      }
      if (s === 'CANCELLED') {
        return <span className="text-zinc-500">Anulowana</span>;
      }
      if (s === 'OVERDUE') {
        return <span className="font-medium text-red-700/80">Zaległa</span>;
      }
      return <span className="text-zinc-600">{status || '—'}</span>;
    };

    const invoiceKindLabel = (kind: string) => {
      if (kind === 'MONTHLY') return 'Ratalna';
      if (kind === 'YEARLY') return 'Jednorazowa';
      if (kind === 'PER_LESSON') return 'Za zajęcia';
      return 'Inna';
    };

    const issuedInvoiceSummary = {
      total: issuedInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0),
      monthly: issuedInvoices
        .filter((inv) => inv.kind === 'MONTHLY' && inv.documentType !== 'CORRECTIVE')
        .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0),
      perLesson: issuedInvoices
        .filter((inv) => inv.kind === 'PER_LESSON' && inv.documentType !== 'CORRECTIVE')
        .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0),
    };

    const renderMonthPicker = () => (
      <label className="text-sm text-zinc-700">
        Miesiąc
        <input
          type="month"
          className="ml-2 rounded-lg border border-emerald-200 px-3 py-2"
          value={monthlyInvoiceMonth}
          onChange={(e) => setMonthlyInvoiceMonth(e.target.value)}
        />
      </label>
    );

    const renderPreviewTable = (
      parents: NonNullable<typeof monthlyInvoicePreview>['parents'],
      emptyMessage: string,
      options?: { held?: boolean },
    ) => {
      const held = Boolean(options?.held);
      if (monthlyInvoicePreviewLoading) {
        return <p className="text-sm text-zinc-600">Wczytywanie…</p>;
      }
      if (parents.length === 0) {
        return (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            {emptyMessage}
          </p>
        );
      }
      return (
        <div className="overflow-x-auto rounded-xl border border-emerald-100">
          <table className="min-w-full text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2 text-left">Rodzic</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Dziecko</th>
                <th className="px-3 py-2 text-left">Kwota</th>
                <th className="px-3 py-2 text-left">Suma rodzica</th>
                <th className="px-3 py-2 text-left">Status faktury</th>
                <th className="px-3 py-2 text-left w-10" title={held ? 'Wznów generowanie' : 'Wstrzymaj fakturę'}>
                  {held ? 'Wznów' : 'Wstrzymaj'}
                </th>
              </tr>
            </thead>
            <tbody>
              {parents.flatMap((parent) =>
                parent.lines.map((line, idx) => (
                  <tr key={line.contractId} className="border-t border-emerald-50">
                    <td className="px-3 py-2 font-medium">
                      {idx === 0
                        ? `${parent.parentFirstName} ${parent.parentLastName}`.trim()
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {idx === 0 ? parent.parentEmail : ''}
                    </td>
                    <td className="px-3 py-2">{line.childName}</td>
                    <td className="px-3 py-2">{formatPln(line.amount)}</td>
                    <td className="px-3 py-2">
                      {idx === 0 ? formatPln(parent.totalAmount) : ''}
                    </td>
                    <td className="px-3 py-2">
                      {held ? (
                        line.alreadyInvoiced ? (
                          <span className="text-emerald-700">Wystawiona ręcznie</span>
                        ) : (
                          <span className="text-amber-800">Wstrzymana</span>
                        )
                      ) : line.alreadyInvoiced ? (
                        <span className="text-emerald-700">Wystawiona</span>
                      ) : (
                        <span className="text-amber-700">Do wystawienia</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#0f6e56]"
                        checked={held}
                        disabled={
                          invoiceHoldBusyContractId === line.contractId ||
                          monthlyInvoicesGenerating
                        }
                        title={
                          held
                            ? 'Odznacz, aby znów generować fakturę dla tego dziecka w tym miesiącu'
                            : 'Zaznacz, aby wstrzymać fakturę dla tego dziecka tylko w tym miesiącu'
                        }
                        onChange={(e) => {
                          void setMonthlyInvoiceHold(line.contractId, e.target.checked);
                        }}
                      />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Rozliczenia</h2>
          <p className="text-sm text-zinc-600">
            Zestawienie (ratalne i za zajęcia), wystawione faktury oraz ustawienia generowania.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {billingTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setBillingSubTab(t.key)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${tabBtn(billingSubTab === t.key)}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {billingSubTab === 'summary' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-semibold text-[#0f6e56]">Zestawienie planowanych kwot</h4>
                <p className="mt-1 text-sm text-zinc-600">
                  Wybierz miesiąc, potem podsekcję: faktury ratalne albo rozliczenia za pojedyncze
                  zajęcia.
                </p>
              </div>
              {renderMonthPicker()}
            </div>

            <div className="flex flex-wrap gap-2">
              {billingSummaryKinds.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setBillingSummaryKind(t.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${tabBtn(
                    billingSummaryKind === t.key,
                  )}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {billingSummaryKind === 'monthly' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h5 className="font-semibold text-zinc-900">Faktury ratalne</h5>
                    <p className="mt-1 text-sm text-zinc-600">
                      Podpisane umowy miesięczne (bez trybu bez opłat). Kwoty z umów — tak trafią na
                      fakturę. Checkbox „Wstrzymaj” wyłącza konkretne dziecko tylko w wybranym
                      miesiącu (kolejny miesiąc startuje bez wstrzymań). Przy częściowym
                      wstrzymaniu faktura automatyczna wystawi się tylko na pozostałe dzieci;
                      wstrzymane wystawi księgowa ręcznie.
                      {monthlyInvoicePreview?.dueDate
                        ? ` Termin płatności: ${monthlyInvoicePreview.dueDate}.`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={monthlyInvoicesGenerating || monthlyInvoicePreviewLoading}
                    className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={async () => {
                      setMonthlyInvoicesGenerating(true);
                      try {
                        const res = await fetch('/api/admin/invoices/generate-monthly', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ periodMonth: monthlyInvoiceMonth }),
                        });
                        const data = (await res.json().catch(() => ({}))) as {
                          message?: string;
                          generated?: number;
                          alreadyInvoiced?: number;
                          errors?: unknown[];
                        };
                        if (!res.ok) {
                          pushToast(
                            'error',
                            data.message ?? 'Nie udało się wygenerować faktur ratalnych',
                          );
                          return;
                        }
                        const errCount = data.errors?.length ?? 0;
                        pushToast(
                          errCount > 0 && (data.generated ?? 0) === 0 ? 'error' : 'success',
                          data.message ??
                            `Wygenerowano ${data.generated ?? 0}, już było ${data.alreadyInvoiced ?? 0}`,
                        );
                        await loadMonthlyInvoicePreview();
                        await loadIssuedInvoices();
                      } catch {
                        pushToast('error', 'Błąd generowania faktur ratalnych');
                      } finally {
                        setMonthlyInvoicesGenerating(false);
                      }
                    }}
                  >
                    {monthlyInvoicesGenerating ? 'Generowanie…' : 'Wygeneruj faktury ratalne'}
                  </button>
                </div>

                {monthlyInvoicePreview && !monthlyInvoicePreviewLoading ? (
                  <p className="text-sm text-zinc-600">
                    Rodzice: {monthlyInvoicePreview.totals.parents}, pozycje:{' '}
                    {monthlyInvoicePreview.totals.lines}, suma:{' '}
                    {formatPln(monthlyInvoicePreview.totals.amount)}
                    {monthlyInvoicePreview.totals.pendingAmount > 0
                      ? ` (do wystawienia: ${formatPln(monthlyInvoicePreview.totals.pendingAmount)})`
                      : ''}
                  </p>
                ) : null}

                {renderPreviewTable(
                  monthlyInvoicePreview?.parents ?? [],
                  'Brak podpisanych umów ratalnych do faktury w wybranym miesiącu.',
                )}

                <div className="space-y-3 border-t border-emerald-100 pt-4">
                  <div>
                    <h4 className="font-semibold text-[#0f6e56]">Faktury wstrzymane</h4>
                    <p className="mt-1 text-sm text-zinc-600">
                      Dzieci wyłączone z generowania w tym miesiącu. Odznacz checkbox, aby wznowić.
                      Po ręcznym wystawieniu przez księgową status zmienia się na „Wystawiona
                      ręcznie”.
                    </p>
                  </div>
                  {renderPreviewTable(
                    monthlyInvoicePreview?.heldParents ?? [],
                    'Brak wstrzymanych faktur.',
                    { held: true },
                  )}
                </div>
              </div>
            ) : (
              renderLessonBilling({ embedded: true })
            )}
          </div>
        ) : billingSubTab === 'invoices' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-semibold text-[#0f6e56]">Wystawione faktury</h4>
                <p className="mt-1 text-sm text-zinc-600">
                  Faktury zapisane w systemie dla wybranego miesiąca rozliczeniowego — z możliwością
                  pobrania PDF.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {renderMonthPicker()}
                <button
                  type="button"
                  disabled={verifyPaymentsBusy || issuedInvoicesLoading}
                  onClick={() => void verifyPayments()}
                  className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyPaymentsBusy ? 'Weryfikacja…' : 'Zweryfikuj płatności'}
                </button>
              </div>
            </div>

            {issuedInvoicesLoading ? (
              <p className="text-sm text-zinc-600">Wczytywanie…</p>
            ) : issuedInvoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
                Brak wystawionych faktur w wybranym miesiącu.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Suma', value: issuedInvoiceSummary.total },
                    { label: 'Faktury ratalne', value: issuedInvoiceSummary.monthly },
                    { label: 'Za pojedyncze zajęcia', value: issuedInvoiceSummary.perLesson },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-emerald-100 bg-white px-4 py-3"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xl font-semibold text-[#0f6e56]">
                        {formatPln(item.value)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-xl border border-emerald-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-emerald-50 text-zinc-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Numer</th>
                        <th className="px-3 py-2 text-left">Typ</th>
                        <th className="px-3 py-2 text-left">Data wystawienia</th>
                        <th className="px-3 py-2 text-left">Nabywca</th>
                        <th className="px-3 py-2 text-left">Kwota</th>
                        <th className="px-3 py-2 text-left">Płatność</th>
                        <th className="px-3 py-2 text-left">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issuedInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-emerald-50">
                          <td className="px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                          <td className="px-3 py-2">
                            {inv.documentType === 'CORRECTIVE'
                              ? 'Korekta'
                              : invoiceKindLabel(inv.kind)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{inv.issueDate}</td>
                          <td className="px-3 py-2">
                            <div>{inv.buyerName}</div>
                            {inv.parentEmail ? (
                              <div className="text-xs text-zinc-500">{inv.parentEmail}</div>
                            ) : null}
                            {inv.buyerNip ? (
                              <div className="text-xs text-zinc-500">NIP {inv.buyerNip}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatPln(inv.amount)}</td>
                          <td className="px-3 py-2">{paymentStatusLabel(inv.paymentStatus)}</td>
                          <td className="px-3 py-2">
                            {inv.hasPdf ? (
                              <a
                                href={`/api/admin/invoices/${encodeURIComponent(inv.id)}?format=pdf`}
                                className="font-semibold text-[#0f6e56] hover:underline"
                              >
                                Pobierz PDF
                              </a>
                            ) : (
                              <span className="text-zinc-400">Brak pliku</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="space-y-3 border-t border-emerald-100 pt-6">
              <div>
                <h4 className="font-semibold text-[#0f6e56]">Przelewy bez numeru klienta</h4>
                <p className="mt-1 text-sm text-zinc-600">
                  Przelewy z wyciągu bez nr klienta / umowy / faktury w tytule — jeszcze
                  nieprzypisane. Możesz ręcznie powiązać je z fakturą i oznaczyć jako opłacone.
                </p>
              </div>

              {unmatchedTransfersLoading ? (
                <p className="text-sm text-zinc-600">Wczytywanie przelewów…</p>
              ) : unmatchedTransfers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
                  Brak nieprzypisanych przelewów bez numeru klienta.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-amber-50/80 text-zinc-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Kontrahent</th>
                        <th className="px-3 py-2 text-left">Tytuł</th>
                        <th className="px-3 py-2 text-left">Kwota</th>
                        <th className="px-3 py-2 text-left">Faktura</th>
                        <th className="px-3 py-2 text-left">Akcja</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedTransfers.map((tr) => {
                        const sameAmount = manualMatchInvoices.filter(
                          (inv) => Math.abs(inv.amount - tr.amount) < 0.005,
                        );
                        const options =
                          sameAmount.length > 0 ? sameAmount : manualMatchInvoices;
                        const busy = manualMatchBusyId === tr.id;
                        return (
                          <tr key={tr.id} className="border-t border-amber-50">
                            <td className="px-3 py-2 whitespace-nowrap">{tr.transactionDate}</td>
                            <td className="px-3 py-2">{tr.counterparty || '—'}</td>
                            <td className="px-3 py-2 max-w-[16rem]">
                              <div className="truncate" title={tr.title}>
                                {tr.title || '—'}
                              </div>
                              {tr.bankTransactionId ? (
                                <div className="text-xs text-zinc-500 font-mono">
                                  {tr.bankTransactionId}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatPln(tr.amount)}</td>
                            <td className="px-3 py-2 min-w-[14rem]">
                              <select
                                className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                value={manualMatchSelection[tr.id] ?? ''}
                                disabled={busy || options.length === 0}
                                onChange={(e) =>
                                  setManualMatchSelection((prev) => ({
                                    ...prev,
                                    [tr.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">
                                  {options.length === 0
                                    ? 'Brak oczekujących faktur'
                                    : 'Wybierz fakturę…'}
                                </option>
                                {options.map((inv) => (
                                  <option key={inv.paymentId} value={inv.paymentId}>
                                    {inv.invoiceNumber} — {inv.buyerName} —{' '}
                                    {formatPln(inv.amount)}
                                    {inv.periodMonth ? ` (${inv.periodMonth})` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button
                                type="button"
                                disabled={busy || !manualMatchSelection[tr.id]}
                                onClick={() => void manualMatchTransfer(tr.id)}
                                className="rounded-lg bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? 'Zapisywanie…' : 'Oznacz opłaconą'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : discountsLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-100 bg-white p-4 space-y-5">
            <div>
              <h4 className="font-semibold text-[#0f6e56]">Generowanie faktur ratalnych</h4>
              <p className="mt-1 text-sm text-zinc-600">
                Wybierz tryb: ręczne (tylko przycisk w Zestawieniu) albo automatyczne (cron w
                wybranym dniu miesiąca). Termin płatności na fakturze to zawsze ostatni dzień
                miesiąca rozliczeniowego.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInvoiceAutoGenerationDraft(false)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  !invoiceAutoGenerationDraft
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200'
                }`}
              >
                Ręczne generowanie
              </button>
              <button
                type="button"
                onClick={() => setInvoiceAutoGenerationDraft(true)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  invoiceAutoGenerationDraft
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-emerald-100 bg-emerald-50/50 text-zinc-800 hover:border-emerald-200'
                }`}
              >
                Automatyczne generowanie
              </button>
            </div>

            <div
              className={`rounded-xl border p-4 transition ${
                invoiceAutoGenerationDraft
                  ? 'border-emerald-200 bg-white'
                  : 'border-zinc-100 bg-zinc-50/80 opacity-60'
              }`}
            >
              <label className="block space-y-1">
                <span
                  className={`text-sm font-medium ${
                    invoiceAutoGenerationDraft ? 'text-zinc-700' : 'text-zinc-400'
                  }`}
                >
                  Dzień generowania faktur (1–28)
                </span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  step={1}
                  disabled={!invoiceAutoGenerationDraft}
                  className={`w-28 rounded-xl border px-3 py-2 ${
                    invoiceAutoGenerationDraft
                      ? 'border-emerald-200 bg-white text-zinc-900'
                      : 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
                  }`}
                  value={invoiceGenerationDayDraft}
                  onChange={(e) => setInvoiceGenerationDayDraft(e.target.value)}
                />
              </label>
              {!invoiceAutoGenerationDraft ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Pole aktywne tylko przy automatycznym generowaniu.
                </p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  Cron wystawi faktury ratalne w tym dniu każdego miesiąca (strefa Europe/Warsaw).
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={discountsSaving}
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  const day = Math.round(Number(invoiceGenerationDayDraft));
                  if (
                    invoiceAutoGenerationDraft &&
                    (!Number.isFinite(day) || day < 1 || day > 28)
                  ) {
                    pushToast('error', 'Podaj dzień od 1 do 28');
                    return;
                  }
                  setDiscountsSaving(true);
                  try {
                    const payload: {
                      invoiceAutoGeneration: boolean;
                      invoiceGenerationDay?: number;
                    } = {
                      invoiceAutoGeneration: invoiceAutoGenerationDraft,
                    };
                    if (invoiceAutoGenerationDraft) {
                      payload.invoiceGenerationDay = day;
                    }
                    const res = await fetch('/api/admin/discounts', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = (await res.json().catch(() => ({}))) as {
                      message?: string;
                      invoiceGenerationDay?: number;
                      invoiceAutoGeneration?: boolean;
                    };
                    if (!res.ok) {
                      pushToast(
                        'error',
                        data.message ?? 'Nie udało się zapisać ustawień faktur',
                      );
                      return;
                    }
                    const savedAuto = Boolean(data.invoiceAutoGeneration);
                    setInvoiceAutoGeneration(savedAuto);
                    setInvoiceAutoGenerationDraft(savedAuto);
                    if (data.invoiceGenerationDay != null) {
                      const saved = Math.min(
                        28,
                        Math.max(1, Number(data.invoiceGenerationDay) || day),
                      );
                      setInvoiceGenerationDay(saved);
                      setInvoiceGenerationDayDraft(String(saved));
                    }
                    pushToast('success', 'Zapisano ustawienia generowania faktur');
                  } catch {
                    pushToast('error', 'Błąd zapisu ustawień faktur');
                  } finally {
                    setDiscountsSaving(false);
                  }
                }}
              >
                {discountsSaving ? 'Zapisywanie…' : 'Zapisz ustawienia'}
              </button>
              {invoiceAutoGeneration !== invoiceAutoGenerationDraft ||
              (invoiceAutoGenerationDraft &&
                invoiceGenerationDay !== Number(invoiceGenerationDayDraft)) ? (
                <span className="text-xs text-zinc-500">
                  Niezapisane zmiany
                  {invoiceAutoGeneration
                    ? ` (zapisane: automatyczne, dzień ${invoiceGenerationDay})`
                    : ' (zapisane: ręczne)'}
                  .
                </span>
              ) : null}
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderLessonBilling = (options?: { embedded?: boolean }) => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h5
            className={
              options?.embedded ? 'font-semibold text-zinc-900' : 'font-semibold text-[#0f6e56]'
            }
          >
            {options?.embedded ? 'Za pojedyncze zajęcia' : 'Płatności za pojedyncze zajęcia'}
          </h5>
          <p className="mt-1 text-sm text-zinc-600">
            Rozliczenie umów za pojedyncze zajęcia — obecności są informacyjne.
            {options?.embedded ? ' Miesiąc wybierasz powyżej.' : ''} Najpierw zapisz kwoty, potem
            wygeneruj faktury.
          </p>
        </div>
        <button
          type="button"
          disabled={
            lessonInvoicesGenerating ||
            lessonBillingLoading ||
            lessonBillingBusyChildId != null
          }
          className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={async () => {
            setLessonInvoicesGenerating(true);
            try {
              const res = await fetch('/api/admin/lesson-billing/generate-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ periodMonth: lessonBillingMonth }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                message?: string;
                generated?: number;
                alreadyInvoiced?: number;
                errors?: unknown[];
              };
              if (!res.ok) {
                pushToast(
                  'error',
                  data.message ?? 'Nie udało się wygenerować faktur za zajęcia',
                );
                return;
              }
              const errCount = data.errors?.length ?? 0;
              pushToast(
                errCount > 0 && (data.generated ?? 0) === 0 ? 'error' : 'success',
                data.message ??
                  `Wygenerowano ${data.generated ?? 0}, już było ${data.alreadyInvoiced ?? 0}`,
              );
              await loadLessonBilling();
              await loadIssuedInvoices();
            } catch {
              pushToast('error', 'Błąd generowania faktur za zajęcia');
            } finally {
              setLessonInvoicesGenerating(false);
            }
          }}
        >
          {lessonInvoicesGenerating
            ? 'Generowanie…'
            : 'Wygeneruj faktury za pojedyncze zajęcia'}
        </button>
      </div>

      {!options?.embedded ? (
        <label className="inline-block text-sm text-zinc-700">
          Miesiąc
          <input
            type="month"
            className="ml-2 rounded-lg border border-emerald-200 px-3 py-2"
            value={lessonBillingMonth}
            onChange={(e) => setLessonBillingMonth(e.target.value)}
          />
        </label>
      ) : null}

      {lessonBillingLoading ? (
        <p className="text-sm text-zinc-600">Wczytywanie…</p>
      ) : lessonBillingRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          Brak dzieci z umową „za pojedyncze zajęcia” w wybranym miesiącu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-emerald-100 text-left text-zinc-600">
                <th className="px-3 py-2">Dziecko</th>
                <th className="px-3 py-2">Rodzic</th>
                <th className="px-3 py-2">Stawka / zajęcie</th>
                <th className="px-3 py-2">Obecności</th>
                <th className="px-3 py-2">Liczba zajęć</th>
                <th className="px-3 py-2">Kwota (PLN)</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {lessonBillingRows.map((row) => {
                const draft = lessonBillingDrafts[row.childId] ?? { amount: '', lessonsCount: '' };
                const isInvoiced = Boolean(row.billing?.paymentId);
                const busy = lessonBillingBusyChildId === row.childId;
                return (
                  <tr key={row.childId} className="border-b border-emerald-50">
                    <td className="px-3 py-3 font-medium text-zinc-900">
                      {row.firstName} {row.lastName}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{row.parentEmail}</td>
                    <td className="px-3 py-3">
                      {row.lessonUnitPrice != null ? `${row.lessonUnitPrice} PLN` : '—'}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">
                      obecni: {row.attendanceSummary.present}, nieobecni:{' '}
                      {row.attendanceSummary.absent}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min={0}
                        className="w-20 rounded-lg border border-emerald-200 px-2 py-1"
                        disabled={isInvoiced}
                        value={draft.lessonsCount}
                        onChange={(e) =>
                          setLessonBillingDrafts((prev) => ({
                            ...prev,
                            [row.childId]: { ...draft, lessonsCount: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-28 rounded-lg border border-emerald-200 px-2 py-1"
                        disabled={isInvoiced}
                        value={draft.amount}
                        onChange={(e) =>
                          setLessonBillingDrafts((prev) => ({
                            ...prev,
                            [row.childId]: { ...draft, amount: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-zinc-600">
                      {row.billing?.status ?? '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {!isInvoiced && (
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-lg bg-[#0f6e56] px-3 py-1 text-white disabled:opacity-60"
                            onClick={async () => {
                              setLessonBillingBusyChildId(row.childId);
                              try {
                                const res = await fetch('/api/admin/lesson-billing', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    childId: row.childId,
                                    parentId: row.parentId,
                                    contractId: row.contractId,
                                    periodMonth: lessonBillingMonth,
                                    amount: draft.amount,
                                    lessonsCount: draft.lessonsCount || null,
                                    unitPrice: row.lessonUnitPrice,
                                    status: 'APPROVED',
                                  }),
                                });
                                const data = (await res.json().catch(() => ({}))) as {
                                  message?: string;
                                };
                                if (!res.ok) {
                                  pushToast('error', data.message ?? 'Nie udało się zapisać');
                                  return;
                                }
                                pushToast('success', 'Rozliczenie zapisane');
                                await loadLessonBilling();
                              } finally {
                                setLessonBillingBusyChildId(null);
                              }
                            }}
                          >
                            Zapisz
                          </button>
                        )}
                        {row.billing?.id && !isInvoiced && (
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-[#0f6e56] disabled:opacity-60"
                            onClick={async () => {
                              setLessonBillingBusyChildId(row.childId);
                              try {
                                const res = await fetch(
                                  `/api/admin/lesson-billing/${row.billing!.id}/invoice`,
                                  { method: 'POST' },
                                );
                                const data = (await res.json().catch(() => ({}))) as {
                                  message?: string;
                                  created?: boolean;
                                };
                                if (!res.ok) {
                                  pushToast('error', data.message ?? 'Nie udało się wygenerować faktury');
                                  return;
                                }
                                pushToast('success', data.message ?? 'Faktura wygenerowana');
                                await loadLessonBilling();
                              } finally {
                                setLessonBillingBusyChildId(null);
                              }
                            }}
                          >
                            Generuj fakturę
                          </button>
                        )}
                        {isInvoiced && (
                          <span className="text-xs text-emerald-700">Zafakturowano</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (loading && activeTab !== 'dashboard') {
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      );
    }
    if (activeTab === 'dashboard') {
      return (
        <ManagerDashboardPanel
          onOpenGroup={(groupId) => {
            setActiveTab('organization');
            setOrganizationSubTab('groups');
            setGroupsSubTab('list');
            setMobileTab('organization');
            void loadGroupDetail(groupId);
          }}
        />
      );
    }
    if (activeTab === 'organization') return renderOrganization();
    if (activeTab === 'classes') {
      return (
        <ClassesCalendarPanel
          isActive
          refreshSignal={classesCalRefreshSignal}
          teachers={calendarTeachers}
          locations={schoolLocations}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          pushToast={pushToast}
        />
      );
    }
    if (activeTab === 'billing') return renderBilling();
    if (activeTab === 'settlements') return renderSettlements();
    if (activeTab === 'enrollments') {
      return renderEnrollmentFlow();
    }
    if (activeTab === 'announcements') {
      return (
        <MessagesPanel
          mode="manager"
          listResetToken={messagesListResetToken}
          onInboxChange={refreshMessagesUnreadCount}
        />
      );
    }
    return <EmptyDataPanel title="Panel" />;
  };

  return (
    <div className="manager-panel pb-24" data-session-school-id={sessionSchoolId ?? ''}>
      <nav className="admin-top-nav no-scrollbar overflow-x-auto rounded-3xl bg-white p-2 shadow-sm">
        <div className="flex min-w-max gap-2">
          {topTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === 'announcements' && activeTab === 'announcements') {
                  setMessagesListResetToken((t) => t + 1);
                }
                setActiveTab(tab.key);
              }}
              className={`admin-top-tab rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#0f6e56] text-white shadow-sm'
                  : 'bg-emerald-50/60 text-zinc-800 hover:bg-emerald-50'
              }`}
            >
              {tab.key === 'announcements' ? (
                <MessagesTabLabel
                  label={tab.label}
                  unreadCount={messagesUnreadCount}
                  isActive={activeTab === 'announcements'}
                />
              ) : tab.key === 'enrollments' ? (
                <span className="inline-flex items-center gap-1.5">
                  <MessagesTabLabel
                    label="Zapisy"
                    unreadCount={enrollmentsPendingCount}
                    isActive={activeTab === 'enrollments'}
                    badgeAriaLabel={(n) =>
                      n === 1 ? '1 nowe zgłoszenie' : `${n} nowych zgłoszeń`
                    }
                  />
                  <span aria-hidden>/</span>
                  <MessagesTabLabel
                    label="rezygnacje"
                    unreadCount={resignationsOpenCount}
                    isActive={activeTab === 'enrollments'}
                    badgeAriaLabel={(n) =>
                      n === 1
                        ? '1 otwarte zgłoszenie rezygnacji'
                        : `${n} otwartych zgłoszeń rezygnacji`
                    }
                  />
                </span>
              ) : (
                tab.label
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="mt-4">{renderContent()}</div>

      <nav className="fixed bottom-3 left-1/2 z-40 w-[min(96vw,460px)] -translate-x-1/2 rounded-2xl border border-emerald-200 bg-white p-1 shadow-lg md:hidden">
        <div className="grid grid-cols-3 gap-1">
          {mobileTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setMobileTab(tab.key);
              }}
              className={`rounded-full px-2 py-2 text-xs font-semibold ${
                mobileTab === tab.key ? 'bg-[#0f6e56] text-white' : 'text-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl px-4 py-3 text-sm text-white shadow ${
              toast.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {closeYearModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Zakończenie roku szkolnego</h3>
            <p className="mt-3 text-sm text-zinc-600">
              Czy na pewno chcesz zakończyć rok szkolny <strong>{closeYearModal.name}</strong>? Spowoduje to
              anulowanie zaplanowanych zajęć i wygaśnięcie subskrypcji. Grupy szkoły i przypisania dzieci
              pozostaną aktywne — przy zaplanowanym kolejnym roku dzieci przejdą do tych samych grup w
              nowym roku.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold"
                onClick={() => setCloseYearModal(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/admin/school-years/${closeYearModal.id}`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'close' }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message ?? 'Błąd zamykania roku');
                    const carried = data.membershipsCarried ?? 0;
                    pushToast(
                      'success',
                      (data.activatedNextYear?.name
                        ? `Rok zamknięty. Aktywowano ${data.activatedNextYear.name}. `
                        : 'Rok zamknięty. Dzieci pozostają w grupach. ') +
                        `Anulowano ${data.lessonsCancelled ?? 0} zajęć, ` +
                        `wygaszono ${data.subscriptionsExpired ?? 0} subskrypcji.` +
                        (data.activatedNextYear
                          ? ` Przeniesiono ${carried} przypisań uczniów do nowego roku.`
                          : ''),
                    );
                    setCloseYearModal(null);
                    await loadSchoolYearData();
                    await loadData();
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Błąd');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Zakończ rok
              </button>
            </div>
          </div>
        </div>
      )}

      {newYearModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              {activeSchoolYear ? 'Dodaj kolejny rok szkolny' : 'Nowy rok szkolny'}
            </h3>
            {activeSchoolYear && (
              <p className="mt-2 text-sm text-zinc-600">
                Rok zostanie zapisany jako planowany (nieaktywny) i stanie się aktywny po zakończeniu{' '}
                {activeSchoolYear.name}.
              </p>
            )}
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Nazwa</span>
                <input
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={newYearForm.name}
                  onChange={(e) => setNewYearForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="np. 2026/2027"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Data od</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={newYearForm.dateFrom}
                  onChange={(e) => setNewYearForm((p) => ({ ...p, dateFrom: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Data do</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={newYearForm.dateTo}
                  min={newYearForm.dateFrom || undefined}
                  onChange={(e) => setNewYearForm((p) => ({ ...p, dateTo: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2" onClick={() => setNewYearModalOpen(false)}>
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-white disabled:opacity-50"
                onClick={async () => {
                  if (!newYearForm.name.trim() || !newYearForm.dateFrom || !newYearForm.dateTo) {
                    pushToast('error', 'Uzupełnij wszystkie pola');
                    return;
                  }
                  if (newYearForm.dateTo < newYearForm.dateFrom) {
                    pushToast('error', 'Data końca nie może być wcześniejsza niż data początku');
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await fetch('/api/admin/school-years', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: newYearForm.name.trim(),
                        date_from: newYearForm.dateFrom,
                        date_to: newYearForm.dateTo,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message ?? 'Błąd');
                    pushToast(
                      'success',
                      activeSchoolYear
                        ? 'Dodano planowany kolejny rok szkolny'
                        : 'Utworzono rok szkolny',
                    );
                    setNewYearModalOpen(false);
                    await loadSchoolYearData();
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Błąd');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Utwórz
              </button>
            </div>
          </div>
        </div>
      )}

      {holidayModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dzień wolny</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Zaplanowane zajęcia w tym okresie zostaną odwołane. Rodzice dzieci z tymi zajęciami
              otrzymają wiadomość w panelu oraz e-mail.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Nazwa</span>
                <input
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Od</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={holidayForm.dateFrom}
                  onChange={(e) =>
                    setHolidayForm((p) => ({ ...p, dateFrom: e.target.value, dateTo: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Do</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={holidayForm.dateTo}
                  onChange={(e) => setHolidayForm((p) => ({ ...p, dateTo: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Typ</span>
                <select
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={holidayForm.type}
                  onChange={(e) =>
                    setHolidayForm((p) => ({
                      ...p,
                      type: e.target.value as typeof holidayForm.type,
                    }))
                  }
                >
                  <option value="HOLIDAY">HOLIDAY</option>
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="SCHOOL">SCHOOL</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Wiadomość do rodziców</span>
                <span className="mb-2 block text-xs text-zinc-500">
                  Opcjonalna treść dołączona do powiadomienia o odwołanych zajęciach. Jeśli
                  zostawisz puste, wysłany zostanie domyślny tekst.
                </span>
                <textarea
                  className="min-h-[100px] w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={holidayForm.parentMessage}
                  onChange={(e) => setHolidayForm((p) => ({ ...p, parentMessage: e.target.value }))}
                  placeholder="Np. Szkoła jest zamknięta z powodu święta państwowego. Zajęcia odbędą się w innym terminie."
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2" onClick={() => setHolidayModalOpen(false)}>
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-white disabled:opacity-50"
                onClick={async () => {
                  if (!holidayForm.name.trim() || !holidayForm.dateFrom || !holidayForm.dateTo) {
                    pushToast('error', 'Uzupełnij pola');
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await fetch('/api/admin/school-holidays', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: holidayForm.name.trim(),
                        date_from: holidayForm.dateFrom,
                        date_to: holidayForm.dateTo,
                        type: holidayForm.type,
                        parent_message: holidayForm.parentMessage.trim() || undefined,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message ?? 'Błąd');
                    pushToast('success', data.message ?? 'Dodano dzień wolny');
                    setHolidayModalOpen(false);
                    setClassesCalRefreshSignal((s) => s + 1);
                    await loadSchoolYearData();
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Błąd');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {editYearModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Edycja roku (nieaktywnego)</h3>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={editYearModal.name}
                onChange={(e) => setEditYearModal((p) => (p ? { ...p, name: e.target.value } : p))}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={editYearModal.date_from.slice(0, 10)}
                onChange={(e) =>
                  setEditYearModal((p) => (p ? { ...p, date_from: e.target.value } : p))
                }
              />
              <input
                type="date"
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={editYearModal.date_to.slice(0, 10)}
                min={editYearModal.date_from.slice(0, 10) || undefined}
                onChange={(e) =>
                  setEditYearModal((p) => (p ? { ...p, date_to: e.target.value } : p))
                }
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl bg-zinc-200 px-4 py-2" onClick={() => setEditYearModal(null)}>
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-[#0f6e56] px-4 py-2 text-white disabled:opacity-50"
                onClick={async () => {
                  if (!editYearModal) return;
                  const dateFrom = editYearModal.date_from.slice(0, 10);
                  const dateTo = editYearModal.date_to.slice(0, 10);
                  if (dateTo < dateFrom) {
                    pushToast('error', 'Data końca nie może być wcześniejsza niż data początku');
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/admin/school-years/${editYearModal.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: editYearModal.name.trim(),
                        date_from: dateFrom,
                        date_to: dateTo,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message ?? 'Błąd');
                    pushToast('success', 'Zapisano zmiany roku');
                    setEditYearModal(null);
                    await loadSchoolYearData();
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Błąd');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleModalOpen && selectedGroupId && groupDetail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">Dodaj termin</h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Dzień tygodnia</label>
                <select className="w-full rounded-xl border border-emerald-200 px-3 py-2" value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}>
                  <option value={1}>Poniedziałek</option><option value={2}>Wtorek</option><option value={3}>Środa</option><option value={4}>Czwartek</option><option value={5}>Piątek</option><option value={6}>Sobota</option><option value={7}>Niedziela</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Godzina rozpoczęcia</label>
                <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm((p) => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Lokalizacja</label>
                <select className="w-full rounded-xl border border-emerald-200 px-3 py-2" value={scheduleForm.locationId} onChange={(e) => setScheduleForm((p) => ({ ...p, locationId: e.target.value }))}>
                  <option value="">Wybierz lokalizację</option>
                  {groupDetail.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Czas trwania (minuty)</label>
                <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="number" min="15" value={scheduleForm.durationMin} onChange={(e) => setScheduleForm((p) => ({ ...p, durationMin: Number(e.target.value || 60) }))} />
              </div>
              <div className="flex justify-end gap-2">
                <button className="rounded-xl bg-zinc-200 px-3 py-2" onClick={() => setScheduleModalOpen(false)}>Anuluj</button>
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    const res = await fetch('/api/admin/schedule-templates', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId: selectedGroupId, ...scheduleForm }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Konflikt harmonogramu');
                      return;
                    }
                    pushToast('success', data.message ?? 'Termin dodany');
                    setScheduleModalOpen(false);
                    setClassesCalRefreshSignal((s) => s + 1);
                    await loadGroupDetail(selectedGroupId, getGroupDetailReloadOptions(selectedGroupId));
                    const gRes = await fetch('/api/admin/groups');
                    if (gRes.ok) {
                      const gJson = await gRes.json();
                      setGroups((gJson.groups ?? []) as GroupRow[]);
                    }
                  }}
                >
                  Sprawdź konflikty i zapisz
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addStudentModalOpen && selectedGroupId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">Dodaj ucznia do grupy</h3>
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" placeholder="Szukaj po dziecku lub rodzicu" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
              <select className="w-full rounded-xl border border-emerald-200 px-3 py-2" value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                <option value="">Wybierz dziecko</option>
                {availableChildren.map((c) => (
                  <option key={c.child_id} value={c.child_id}>
                    {c.first_name} {c.last_name} — rodzic: {c.parent_first_name} {c.parent_last_name}
                  </option>
                ))}
              </select>
              {availableChildren.length === 0 ? (
                <p className="text-sm text-zinc-600">
                  Brak dostępnych dzieci do przypisania (aktywne, spoza tej grupy). Odśwież stronę lub
                  sprawdź, czy dziecko jest aktywne w bazie.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button className="rounded-xl bg-zinc-200 px-3 py-2" onClick={() => setAddStudentModalOpen(false)}>Anuluj</button>
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    if (!selectedChildId) {
                      pushToast('error', 'Wybierz dziecko');
                      return;
                    }
                    const res = await fetch('/api/admin/group-students', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId: selectedGroupId, childId: selectedChildId }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Nie udało się dodać ucznia');
                      return;
                    }
                    pushToast('success', data.message ?? 'Uczeń dodany do grupy');
                    setAddStudentModalOpen(false);
                    setSelectedChildId('');
                    await loadGroupDetail(selectedGroupId, getGroupDetailReloadOptions(selectedGroupId));
                  }}
                >
                  Dodaj ucznia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {childModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">Dodaj zgłoszenie dziecka</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Utworzy wpis w Zgłoszeniach — dziecko trafi do systemu po wysłaniu propozycji grupy.
            </p>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Szukaj rodzica po imieniu lub emailu"
                value={childForm.parentSearch}
                onChange={(e) => setChildForm((prev) => ({ ...prev, parentSearch: e.target.value }))}
              />
              <select
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={childForm.parentId}
                onChange={(e) => setChildForm((prev) => ({ ...prev, parentId: e.target.value }))}
              >
                <option value="">Wybierz rodzica</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.first_name} {parent.last_name} ({parent.email})
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Imię dziecka"
                value={childForm.firstName}
                onChange={(e) => setChildForm((prev) => ({ ...prev, firstName: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Nazwisko dziecka"
                value={childForm.lastName}
                onChange={(e) => setChildForm((prev) => ({ ...prev, lastName: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                type="date"
                value={childForm.birthDate}
                onChange={(e) => setChildForm((prev) => ({ ...prev, birthDate: e.target.value }))}
              />
              <select
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={childForm.preferredLocationId}
                disabled={locationsLoading}
                onChange={(e) =>
                  setChildForm((prev) => ({ ...prev, preferredLocationId: e.target.value }))
                }
              >
                <option value="">
                  {locationsLoading
                    ? 'Ładowanie lokalizacji…'
                    : schoolLocations.filter((loc) => loc.active).length === 0
                      ? 'Brak lokalizacji'
                      : 'Preferowana lokalizacja'}
                </option>
                {schoolLocations
                  .filter((loc) => loc.active)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-xl bg-zinc-200 px-3 py-2"
                  onClick={() => setChildModalOpen(false)}
                >
                  Anuluj
                </button>
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    if (!childForm.parentId || !childForm.firstName || !childForm.lastName || !childForm.birthDate) {
                      pushToast('error', 'Uzupełnij wszystkie pola');
                      return;
                    }
                    const activeLocations = schoolLocations.filter((loc) => loc.active);
                    if (activeLocations.length > 0 && !childForm.preferredLocationId.trim()) {
                      pushToast('error', 'Wybierz preferowaną lokalizację');
                      return;
                    }
                    const res = await fetch('/api/admin/children', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        parentId: childForm.parentId,
                        firstName: childForm.firstName,
                        lastName: childForm.lastName,
                        birthDate: childForm.birthDate,
                        preferredLocationId: childForm.preferredLocationId.trim() || null,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      pushToast('error', data.message ?? 'Nie udało się utworzyć zgłoszenia');
                      return;
                    }
                    const data = (await res.json()) as { message?: string };
                    pushToast('success', data.message ?? 'Utworzono zgłoszenie');
                    setChildForm({
                      parentId: '',
                      firstName: '',
                      lastName: '',
                      birthDate: '',
                      preferredLocationId: '',
                      parentSearch: '',
                    });
                    setChildModalOpen(false);
                    setEnrollmentFlowSubTab('enrollment');
                    setActiveTab('enrollments');
                    await loadData();
                  }}
                >
                  Utwórz zgłoszenie
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .manager-panel :global(button:not(:disabled):not(.admin-top-tab)) {
          transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease,
            box-shadow 180ms ease;
        }
        .manager-panel :global(button:not(:disabled):not(.admin-top-tab):hover) {
          background-color: #d8f3ea;
          border-color: #2f8f7b;
          color: #0a4f3e;
          box-shadow: 0 0 0 2px rgba(15, 110, 86, 0.18);
        }
      `}</style>
    </div>
  );
}
