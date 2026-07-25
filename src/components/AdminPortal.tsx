'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { normalizePolishPhone } from '@/lib/phone';
import ClassesCalendarPanel from '@/src/components/admin/ClassesCalendarPanel';
import RenewalsPanel from '@/src/components/admin/RenewalsPanel';
import EnrollmentAdminPanel from '@/src/components/admin/EnrollmentAdminPanel';
import ManagerDashboardPanel from '@/src/components/admin/ManagerDashboardPanel';
import ContactHistoryPanel from '@/src/components/admin/ContactHistoryPanel';
import ResignationsPanel from '@/src/components/admin/ResignationsPanel';
import type { ComplimentaryParentRow, EnrollmentGroupRow, EnrollmentParentRow } from '@/src/components/enrollment/types';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import { useOpenResignationsCount } from '@/src/components/admin/useOpenResignationsCount';
import { usePendingEnrollmentsCount } from '@/src/components/admin/usePendingEnrollmentsCount';

type TabKey =
  | 'dashboard'
  | 'organization'
  | 'classes'
  | 'enrollments'
  | 'announcements'
  | 'billing'
  | 'settlements';
type MobileTab = 'organization' | 'users' | 'more';
type UsersSubTab = 'parents' | 'children' | 'teachers' | 'managers' | 'add';
type OrganizationSubTab =
  | 'schoolYear'
  | 'teachers'
  | 'locations'
  | 'discounts'
  | 'groups'
  | 'users'
  | 'history';
type EnrollmentFlowSubTab = 'enrollment' | 'renewals' | 'resignations';
type BillingSubTab = 'summary' | 'invoices' | 'payments' | 'settings';
type TeacherOrgSubTab = 'list' | 'add';
type LocationOrgSubTab = 'list' | 'add' | 'edit';
type GroupsSubTab = 'list' | 'add' | 'organize';

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
}

function priceFieldFromDb(value: unknown): string {
  if (value == null || value === '') return '';
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return String(n);
}

function formatGroupPricePln(value: unknown): string | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} PLN`;
}

function formatGroupPriceLines(
  group: Pick<GroupRow, 'price_monthly' | 'price_yearly' | 'price_per_lesson'>
): string[] {
  const monthly = formatGroupPricePln(group.price_monthly);
  const yearly = formatGroupPricePln(group.price_yearly);
  const perLesson = formatGroupPricePln(group.price_per_lesson);
  return [
    monthly ? `ratalnie ${monthly}` : null,
    yearly ? `jednorazowo ${yearly}` : null,
    perLesson ? `za zajęcia ${perLesson}` : null,
  ].filter((line): line is string => Boolean(line));
}

function isSchoolYearEndDatePassed(dateTo: string): boolean {
  const end = String(dateTo).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return todayStr > end;
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

function todayYmdWarsaw(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
}

function isRetroactiveGenerateRange(dateFrom: string): boolean {
  return dateFrom.slice(0, 10) < todayYmdWarsaw();
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
  nearestLessons: Array<{ id: string; scheduled_at: string; status: string }>;
  generatedLessons?: { futureCount: number; completedCount: number };
  locations: Array<{ id: string; name: string }>;
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
    group_id: string;
    group_name: string;
    teacher_name: string;
    enrolled_at: string;
    left_at: string | null;
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
  address: string | null;
  active: boolean;
  sort_order: number;
  is_featured: boolean;
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
  { key: 'discounts', label: 'Zniżki' },
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
  { key: 'payments', label: 'Płatności' },
  { key: 'settings', label: 'Ustawienia' },
];

const teacherOrgSubTabs: Array<{ key: TeacherOrgSubTab; label: string }> = [
  { key: 'list', label: 'Lista nauczycieli' },
  { key: 'add', label: 'Dodaj nauczyciela' },
];

const locationOrgSubTabs: Array<{ key: LocationOrgSubTab; label: string }> = [
  { key: 'list', label: 'Lista lokalizacji' },
  { key: 'add', label: 'Dodaj nową lokalizację' },
];
const usersSubTabs: Array<{ key: UsersSubTab; label: string }> = [
  { key: 'parents', label: 'Lista rodziców' },
  { key: 'children', label: 'Lista dzieci' },
  { key: 'teachers', label: 'Lista nauczycieli' },
  { key: 'managers', label: 'Lista managerów' },
  { key: 'add', label: 'Dodaj nowego użytkownika' },
];
const groupsSubTabs: Array<{ key: GroupsSubTab; label: string }> = [
  { key: 'list', label: 'Lista grup' },
  { key: 'add', label: 'Dodaj nową grupę' },
  { key: 'organize', label: 'Organizacja grup' },
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
}) {
  const { active, setGroupsSubTab, onEnterAddTab, onOrganizeStateReset } = props;
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
            if (tab.key === 'add') {
              onEnterAddTab();
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
  const [teacherOrgSubTab, setTeacherOrgSubTab] = useState<TeacherOrgSubTab>('list');
  const [locationOrgSubTab, setLocationOrgSubTab] = useState<LocationOrgSubTab>('list');
  const [groupsSubTab, setGroupsSubTab] = useState<GroupsSubTab>('list');
  const [schoolLocations, setSchoolLocations] = useState<SchoolLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [newLocationForm, setNewLocationForm] = useState({ name: '', address: '', sortOrder: '100' });
  const [editLocationId, setEditLocationId] = useState<string | null>(null);
  const [editLocationForm, setEditLocationForm] = useState({ name: '', address: '' });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [contactHistoryParentId, setContactHistoryParentId] = useState<string | null>(null);
  const [contactHistoryChildId, setContactHistoryChildId] = useState<string | null>(null);
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
  const [monthlyInvoiceMonth, setMonthlyInvoiceMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
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
    totals: {
      parents: number;
      lines: number;
      amount: number;
      pendingAmount: number;
      alreadyInvoicedLines: number;
    };
  } | null>(null);
  const [issuedInvoicesLoading, setIssuedInvoicesLoading] = useState(false);
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
  const [lessonBillingMonth, setLessonBillingMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
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
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateWholeSchoolYear, setGenerateWholeSchoolYear] = useState(true);
  const [deleteFutureLessonsModal, setDeleteFutureLessonsModal] = useState<{
    groupId: string;
    count: number;
    quietReload?: boolean;
  } | null>(null);
  const [generateForm, setGenerateForm] = useState(() => {
    const now = new Date();
    const plus = new Date();
    plus.setMonth(plus.getMonth() + 3);
    return {
      dateFrom: now.toISOString().slice(0, 10),
      dateTo: plus.toISOString().slice(0, 10),
    };
  });

  const [schoolYearLoading, setSchoolYearLoading] = useState(false);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRow[]>([]);
  const [historyYearId, setHistoryYearId] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<SchoolYearHistoryData | null>(null);
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
    if (activeTab === 'billing' && billingSubTab === 'payments') {
      void loadLessonBilling();
    }
  }, [activeTab, billingSubTab, loadLessonBilling]);

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
      setSchoolLocations(Array.isArray(data.locations) ? data.locations : []);
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
      patch: { sort_order?: number; is_featured?: boolean },
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
                  }
                : loc,
            )
            .sort((a, b) => {
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
      (organizationSubTab === 'schoolYear' || organizationSubTab === 'history')
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
    const selectable = schoolYears
      .slice()
      .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'));
    if (selectable.length === 0) {
      setHistoryYearId('');
      setHistoryData(null);
      return;
    }
    if (!historyYearId || !selectable.some((y) => y.id === historyYearId)) {
      const preferred =
        selectable.find((y) => !(y.isActive ?? y.active)) ?? selectable[0];
      setHistoryYearId(preferred.id);
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
        parents?: Array<{
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
        totals?: {
          parents: number;
          lines: number;
          amount: number;
          pendingAmount: number;
          alreadyInvoicedLines: number;
        };
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

  useEffect(() => {
    if (activeTab === 'billing' && billingSubTab === 'summary') {
      void loadMonthlyInvoicePreview();
    }
  }, [activeTab, billingSubTab, loadMonthlyInvoicePreview]);

  useEffect(() => {
    if (activeTab === 'billing' && billingSubTab === 'invoices') {
      void loadIssuedInvoices();
    }
  }, [activeTab, billingSubTab, loadIssuedInvoices]);

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
      setGroupForm({
        id: g.id,
        schoolId: g.school_id ?? sessionSchoolId ?? '',
        locationId: g.location_id ?? '',
        name: g.name,
        level: g.level ?? '',
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

  const saveGroupForm = useCallback(async () => {
    if (!groupForm.id) return;
    if (!groupForm.name.trim()) {
      pushToast('error', 'Podaj nazwę grupy');
      return;
    }
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
          name: groupForm.name.trim(),
          level: groupForm.level.trim() || null,
          teacherId: groupForm.teacherId,
          maxStudents: groupForm.maxStudents,
          active: groupForm.active,
          schoolId: groupForm.schoolId || null,
          locationId: groupForm.locationId || null,
          priceMonthly: groupForm.priceMonthly.trim() ? Number(groupForm.priceMonthly) : null,
          priceYearly: groupForm.priceYearly.trim() ? Number(groupForm.priceYearly) : null,
          pricePerLesson: groupForm.pricePerLesson.trim() ? Number(groupForm.pricePerLesson) : null,
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

  const getSchoolYearGenerateDates = useCallback(() => {
    if (!activeSchoolYear) return null;
    return {
      dateFrom: activeSchoolYear.date_from.slice(0, 10),
      dateTo: activeSchoolYear.date_to.slice(0, 10),
    };
  }, [activeSchoolYear]);

  const openGenerateModal = useCallback(() => {
    const yearDates = getSchoolYearGenerateDates();
    if (yearDates) {
      setGenerateForm(yearDates);
      setGenerateWholeSchoolYear(true);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const plus = new Date();
      plus.setMonth(plus.getMonth() + 3);
      setGenerateForm({
        dateFrom: today,
        dateTo: plus.toISOString().slice(0, 10),
      });
      setGenerateWholeSchoolYear(false);
    }
    setGenerateModalOpen(true);
  }, [getSchoolYearGenerateDates]);

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

  const saveUser = async (user: AdminUser) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          role: user.role,
          confirmed: user.confirmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Aktualizacja nieudana');
      pushToast('success', 'Zaktualizowano użytkownika');
      setEditingUserId(null);
      await loadData();
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd aktualizacji');
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

      {(usersSubTab === 'parents' || usersSubTab === 'teachers' || usersSubTab === 'managers') && (
      <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Użytkownik</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Rola</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {roleScopedUsers.map((user) => {
                const editing = editingUserId === user.id;

                if (user.role === 'PARENT') {
                  const showHistory = contactHistoryParentId === user.id;
                  return (
                    <Fragment key={user.id}>
                    <tr className="border-t border-emerald-50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                        {user.client_number ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span>{user.first_name} {user.last_name}</span>
                      </td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <span>{user.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
                          {user.active ? 'aktywny' : 'nieaktywny'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/portal/parents/${user.id}`}
                            className="inline-flex rounded-lg bg-zinc-200 px-3 py-1 text-center text-zinc-900 hover:bg-zinc-300"
                          >
                            Edytuj
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setContactHistoryChildId(null);
                              setContactHistoryParentId(showHistory ? null : user.id);
                            }}
                            className="rounded-lg bg-emerald-100 px-3 py-1 text-[#0f6e56] hover:bg-emerald-200"
                          >
                            {showHistory ? 'Ukryj historię' : 'Historia'}
                          </button>
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
                    {showHistory && (
                      <tr>
                        <td colSpan={6} className="px-4 pb-4">
                          <ContactHistoryPanel parentId={user.id} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                }

                return (
                  <tr key={user.id} className="border-t border-emerald-50">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {user.client_number ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input className="rounded-lg border border-emerald-200 px-2 py-1" value={user.first_name} onChange={(e) => setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, first_name: e.target.value } : u)))} />
                          <input className="rounded-lg border border-emerald-200 px-2 py-1" value={user.last_name} onChange={(e) => setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, last_name: e.target.value } : u)))} />
                        </div>
                      ) : (
                        <span>{user.first_name} {user.last_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input className="w-full rounded-lg border border-emerald-200 px-2 py-1" value={user.email} onChange={(e) => setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, email: e.target.value } : u)))} />
                      ) : user.email}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <select
                          className="rounded-lg border border-emerald-200 px-2 py-1"
                          value={user.role ?? 'PARENT'}
                          onChange={(e) =>
                            setUsers((prev) =>
                              prev.map((u) =>
                                u.id === user.id ? { ...u, role: e.target.value as AdminPortalUserRole } : u
                              )
                            )
                          }
                        >
                          <option value="PARENT">Rodzic</option>
                          <option value="TEACHER">Nauczyciel</option>
                          {!isManagerView && <option value="MANAGER">Manager</option>}
                          <option value="ACCOUNTANT">Księgowa</option>
                          <option value="CHILD">Uczeń</option>
                          {!isManagerView && <option value="ADMIN">Super admin</option>}
                        </select>
                      ) : (
                        <span>{user.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700'}`}>
                        {user.active ? 'aktywny' : 'nieaktywny'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {editing ? (
                          <>
                            <button type="button" onClick={() => setEditingUserId(null)} className="rounded-lg bg-zinc-200 px-3 py-1">Anuluj</button>
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
                            <button type="button" disabled={busy} onClick={() => saveUser(user)} className="rounded-lg bg-emerald-600 px-3 py-1 text-white">Zapisz</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => setEditingUserId(user.id)} className="rounded-lg bg-zinc-200 px-3 py-1">Edytuj</button>
                          </>
                        )}
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
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Imię</th>
                <th className="px-4 py-3 text-left">Nazwisko</th>
                <th className="px-4 py-3 text-left">Data urodzenia</th>
                <th className="px-4 py-3 text-left">Rodzic</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Grupa</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => {
                const showHistory = contactHistoryChildId === child.child_id;
                return (
                  <Fragment key={child.child_id}>
                  <tr className="border-t border-emerald-50">
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
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{child.group_name ?? '-'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setContactHistoryParentId(null);
                            setContactHistoryChildId(showHistory ? null : child.child_id);
                          }}
                          className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-[#0f6e56] hover:bg-emerald-200"
                        >
                          {showHistory ? 'Ukryj' : 'Historia'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {showHistory && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-4">
                        <ContactHistoryPanel childId={child.child_id} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
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
                if (t.key === 'groups' && organizationSubTab === 'groups') {
                  resetGroupsToList();
                }
                setOrganizationSubTab(t.key);
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
                                  className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div>
                                    <p className="font-medium text-zinc-900">{y.name}</p>
                                    <p className="text-xs text-zinc-600">
                                      {y.date_from} — {y.date_to}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-[#0f6e56] underline"
                                    onClick={() => setEditYearModal(y)}
                                  >
                                    Edytuj
                                  </button>
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
                        Niższa kolejność = wyżej na formularzu zapisu. Wyróżnione pozycje mają gwiazdkę na
                        liście dla rodzica.
                      </p>
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {schoolLocations.length === 0 ? (
                        <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                          Brak lokalizacji — dodaj pierwszą w zakładce „Dodaj nową lokalizację”.
                        </p>
                      ) : (
                        schoolLocations.map((loc) => (
                          <div
                            key={loc.id}
                            className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                              loc.is_featured
                                ? 'border-emerald-300 bg-emerald-50/40'
                                : 'border-emerald-100 bg-white'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-zinc-900">{loc.name}</p>
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
                                      pushToast('error', 'Kolejność musi być liczbą całkowitą od 0 do 9999');
                                      e.target.value = String(loc.sort_order);
                                      return;
                                    }
                                    if (next === loc.sort_order) return;
                                    await saveLocationDisplay(loc.id, { sort_order: next }, { silent: true });
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
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                  loc.active ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
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
                                    name: loc.name,
                                    address: loc.address ?? '',
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
              {locationOrgSubTab === 'add' && (
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/30 p-4 text-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">Nowa lokalizacja</p>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Nazwa</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. Paniówki — sala 2"
                        value={newLocationForm.name}
                        onChange={(e) => setNewLocationForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-500">Adres (opcjonalnie)</span>
                      <input
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        placeholder="np. ul. …"
                        value={newLocationForm.address}
                        onChange={(e) => setNewLocationForm((p) => ({ ...p, address: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-700">Kolejność na formularzu</span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step={1}
                        className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                        value={newLocationForm.sortOrder}
                        onChange={(e) => setNewLocationForm((p) => ({ ...p, sortOrder: e.target.value }))}
                      />
                      <span className="mt-1 block text-xs text-zinc-500">
                        Niższa wartość = wyżej na liście (0 = pierwsza pozycja). Domyślnie 100.
                      </span>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        const name = newLocationForm.name.trim();
                        if (!name) {
                          pushToast('error', 'Podaj nazwę lokalizacji');
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
                          const body: {
                            name: string;
                            address?: string;
                            schoolId?: string;
                            sort_order: number;
                          } = {
                            name,
                            sort_order: sortOrder,
                            ...(newLocationForm.address.trim()
                              ? { address: newLocationForm.address.trim() }
                              : {}),
                          };
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
                          setNewLocationForm({ name: '', address: '', sortOrder: '100' });
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
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700">Edycja lokalizacji</p>
                  {!editLocationId ? (
                    <p className="rounded-lg border border-emerald-100 bg-white px-3 py-3 text-sm text-zinc-600">
                      Wybierz lokalizację z listy i kliknij „Edytuj”.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-700">Nazwa</span>
                          <input
                            className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                            placeholder="np. Paniówki — sala 2"
                            value={editLocationForm.name}
                            onChange={(e) => setEditLocationForm((p) => ({ ...p, name: e.target.value }))}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-zinc-500">Adres (opcjonalnie)</span>
                          <input
                            className="w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-900"
                            placeholder="np. ul. …"
                            value={editLocationForm.address}
                            onChange={(e) => setEditLocationForm((p) => ({ ...p, address: e.target.value }))}
                          />
                        </label>
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
                              const res = await fetch(`/api/admin/locations/${encodeURIComponent(editLocationId)}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ active: !current.active }),
                              });
                              const data = (await res.json().catch(() => ({}))) as { message?: string };
                              if (!res.ok) {
                                throw new Error(data.message ?? 'Nie udało się zaktualizować lokalizacji');
                              }
                              pushToast(
                                'success',
                                current.active
                                  ? 'Lokalizacja została oznaczona jako nieaktywna'
                                  : 'Lokalizacja została ponownie oznaczona jako aktywna',
                              );
                              await loadLocations();
                            } catch (e) {
                              pushToast('error', e instanceof Error ? e.message : 'Błąd aktualizacji lokalizacji');
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {schoolLocations.find((l) => l.id === editLocationId)?.active ? 'Dezaktywuj' : 'Aktywuj'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            setEditLocationId(null);
                            setEditLocationForm({ name: '', address: '' });
                            setLocationOrgSubTab('list');
                          }}
                        >
                          Anuluj
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={async () => {
                            const name = editLocationForm.name.trim();
                            if (!name || !editLocationId) {
                              pushToast('error', 'Podaj nazwę lokalizacji');
                              return;
                            }
                            setBusy(true);
                            try {
                              const res = await fetch(`/api/admin/locations/${encodeURIComponent(editLocationId)}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  name,
                                  address: editLocationForm.address.trim() ? editLocationForm.address.trim() : null,
                                }),
                              });
                              const data = (await res.json().catch(() => ({}))) as { message?: string };
                              if (!res.ok) {
                                throw new Error(data.message ?? 'Nie udało się zaktualizować lokalizacji');
                              }
                              pushToast('success', 'Zaktualizowano lokalizację');
                              setEditLocationId(null);
                              setEditLocationForm({ name: '', address: '' });
                              setLocationOrgSubTab('list');
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
                Zniżki procentowe przy kwotach umów oraz rodzice w trybie bez opłat (bez faktur i
                płatności).
              </p>

              {discountsLoading ? (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-2xl bg-emerald-100/80" />
                  <div className="h-32 animate-pulse rounded-2xl bg-emerald-100/60" />
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <h4 className="font-semibold text-[#0f6e56]">Zniżki procentowe</h4>
                    <p className="mt-1 text-sm text-zinc-600">
                      KDR i rodzeństwo się nie łączą — przy KDR obowiązuje tylko KDR. Przy cenie
                      indywidualnej zniżki procentowe nie działają. System nie zastosuje rabatu
                      powyżej ustawionego maksimum.
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <label className="block space-y-1">
                        <span className="text-sm font-medium text-zinc-700">
                          Maksymalny poziom zniżek (%)
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                          value={maxDiscountPercentDraft}
                          onChange={(e) => setMaxDiscountPercentDraft(e.target.value)}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium text-zinc-700">
                          Karta Dużej Rodziny (%)
                        </span>
                        <input
                          type="number"
                          min="0"
                          max={Number(maxDiscountPercentDraft) || 100}
                          step="0.01"
                          className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                          value={discountPercentsDraft.LARGE_FAMILY_CARD}
                          onChange={(e) =>
                            setDiscountPercentsDraft((prev) => ({
                              ...prev,
                              LARGE_FAMILY_CARD: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-sm font-medium text-zinc-700">Rodzeństwo (%)</span>
                        <input
                          type="number"
                          min="0"
                          max={Number(maxDiscountPercentDraft) || 100}
                          step="0.01"
                          className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                          value={discountPercentsDraft.SIBLING}
                          onChange={(e) =>
                            setDiscountPercentsDraft((prev) => ({
                              ...prev,
                              SIBLING: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={discountsSaving}
                      className="mt-4 rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      onClick={async () => {
                        setDiscountsSaving(true);
                        try {
                          const res = await fetch('/api/admin/discounts', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              maxDiscountPercent: Number(maxDiscountPercentDraft) || 0,
                              discounts: [
                                {
                                  key: 'LARGE_FAMILY_CARD',
                                  percent: Number(discountPercentsDraft.LARGE_FAMILY_CARD) || 0,
                                },
                                {
                                  key: 'SIBLING',
                                  percent: Number(discountPercentsDraft.SIBLING) || 0,
                                },
                              ],
                            }),
                          });
                          const data = (await res.json().catch(() => ({}))) as {
                            message?: string;
                            discounts?: Array<{ key: string; percent: number }>;
                            maxDiscountPercent?: number;
                          };
                          if (!res.ok) {
                            pushToast('error', data.message ?? 'Nie udało się zapisać zniżek');
                            return;
                          }
                          const nextSettings = {
                            LARGE_FAMILY_CARD: 0,
                            SIBLING: 0,
                            maxPercent: Math.min(
                              100,
                              Math.max(0, Number(data.maxDiscountPercent) || 10),
                            ),
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
                          pushToast('success', 'Zapisano ustawienia zniżek');
                        } catch {
                          pushToast('error', 'Błąd zapisu zniżek');
                        } finally {
                          setDiscountsSaving(false);
                        }
                      }}
                    >
                      {discountsSaving ? 'Zapisywanie…' : 'Zapisz zniżki'}
                    </button>
                  </div>

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
                        ? `Wyniki: ${filteredComplimentaryCandidates.length} z ${complimentaryCandidates.length} kandydatów`
                        : `Kandydaci: ${complimentaryCandidates.length} (konta rodziców + zgłoszenia bez konta)`}
                      {complimentarySearch.trim()
                        ? ` · ${filteredComplimentaryParents.length} na liście`
                        : complimentaryParents.length > 0
                          ? ` · ${complimentaryParents.length} na liście`
                          : ''}
                    </p>
                    <div className="mt-3 space-y-2">
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
                    <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
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
                    disabled={schoolYearLoading || schoolYears.length === 0}
                  >
                    {schoolYears.length === 0 ? (
                      <option value="">Brak lat szkolnych</option>
                    ) : (
                      schoolYears
                        .slice()
                        .sort((a, b) => String(b.date_from).localeCompare(String(a.date_from), 'pl'))
                        .map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name}
                            {y.isActive ?? y.active ? ' (bieżący)' : ''}
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

              {historyLoading || schoolYearLoading ? (
                <div className="space-y-2">
                  <div className="h-20 animate-pulse rounded-xl bg-emerald-100/80" />
                  <div className="h-32 animate-pulse rounded-xl bg-emerald-100/60" />
                </div>
              ) : !historyData ? (
                <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                  Wybierz rok szkolny, aby zobaczyć podsumowanie.
                </p>
              ) : (
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
          Zgoda na odebranie dziecka przez lektora — przy generowaniu umowy rodzic otrzyma Załącznik
          nr 2 do podpisania.
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
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700">Nazwa grupy</label>
            <input
              className="w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={groupForm.name}
              onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700">Poziom</label>
            <input
              type="text"
              className="w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={groupForm.level}
              onChange={(e) => setGroupForm((p) => ({ ...p, level: e.target.value }))}
            />
          </div>
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
            <label className="block text-sm font-medium text-zinc-700">Lokalizacja</label>
            <select
              className="w-full rounded-xl border border-emerald-200 px-3 py-2"
              value={groupForm.locationId}
              onChange={(e) => setGroupForm((p) => ({ ...p, locationId: e.target.value }))}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:col-span-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">Stawka ratalna (PLN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Brak w bazie"
                value={groupForm.priceMonthly}
                onChange={(e) => setGroupForm((p) => ({ ...p, priceMonthly: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">Stawka jednorazowa (PLN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Brak w bazie"
                value={groupForm.priceYearly}
                onChange={(e) => setGroupForm((p) => ({ ...p, priceYearly: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-zinc-700">Stawka za pojedyncze zajęcia (PLN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                placeholder="Brak w bazie"
                value={groupForm.pricePerLesson}
                onChange={(e) => setGroupForm((p) => ({ ...p, pricePerLesson: e.target.value }))}
              />
            </div>
          </div>
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
        <p className="mt-3 text-xs text-zinc-500">
          Stawki ratalna i jednorazowa dla tej grupy — zapisują się tutaj i trafiają do umowy rodzica.
        </p>
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
    const futureLessonsCount = detail?.generatedLessons?.futureCount ?? 0;
    const completedLessonsCount = detail?.generatedLessons?.completedCount ?? 0;
    const totalGeneratedLessons = futureLessonsCount + completedLessonsCount;
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
                            ? `${st.completed_lessons_count} odbytych`
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Generowanie zajęć</h4>
              <p className="text-sm text-zinc-500">Wygeneruj kalendarz zajęć na podstawie harmonogramu grupy.</p>
              {disabled && (
                <p className="mt-1 text-xs text-amber-700">Najpierw zapisz grupę, aby wygenerować zajęcia.</p>
              )}
              {!disabled && totalGeneratedLessons > 0 && (
                <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Zajęcia wygenerowane —{' '}
                  {[
                    futureLessonsCount > 0 ? `${futureLessonsCount} nadchodzących` : null,
                    completedLessonsCount > 0 ? `${completedLessonsCount} odbytych` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}{' '}
                  w kalendarzu.
                </p>
              )}
              {!disabled && scheduleTemplates.length > 0 && totalGeneratedLessons === 0 && (
                <p className="mt-2 text-xs text-zinc-500">Harmonogram jest ustawiony, ale zajęcia nie zostały jeszcze wygenerowane.</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => openGenerateModal()}
              >
                Generuj zajęcia z harmonogramu
              </button>
              {futureLessonsCount > 0 && (
                <button
                  type="button"
                  disabled={disabled || busy}
                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    if (!groupId) return;
                    setDeleteFutureLessonsModal({
                      groupId,
                      count: futureLessonsCount,
                      quietReload,
                    });
                  }}
                >
                  Usuń zajęcia z kalendarza
                </button>
              )}
            </div>
          </div>
        </section>
      </>
    );
  };

  const renderGroupManageSections = (detail: GroupDetail, groupId: string, opts?: { quietReload?: boolean }) => {
    const quietReload = opts?.quietReload === true;
    const reloadDetail = () => loadGroupDetail(groupId, quietReload ? { quiet: true } : getGroupDetailReloadOptions(groupId));
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
            {detail.students.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-zinc-600">
                Brak uczniów w grupie.
              </p>
            ) : (
              detail.students.map((st) => (
                <div key={st.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 p-3">
                  <div>
                    <p>
                      {st.first_name} {st.last_name}
                    </p>
                    <p className="text-zinc-600">
                      {st.birth_date} · {st.left_at ? 'były' : 'aktywny'}
                    </p>
                    {!st.left_at && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="block text-xs text-zinc-600">
                          Ratalna (indyw.)
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={st.monthly_unit_price ?? ''}
                            placeholder="Domyślna"
                            className="mt-1 w-full rounded-lg border border-emerald-200 px-2 py-1 text-sm"
                            onBlur={async (e) => {
                              const value = e.target.value.trim();
                              const res = await fetch(`/api/admin/group-students/${st.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ monthlyUnitPrice: value || null }),
                              });
                              if (!res.ok) {
                                pushToast('error', 'Nie udało się zapisać stawki ratalnej');
                                return;
                              }
                              pushToast('success', 'Stawka ratalna zapisana');
                              await reloadDetail();
                            }}
                          />
                        </label>
                        <label className="block text-xs text-zinc-600">
                          Jednorazowa (indyw.)
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={st.yearly_unit_price ?? ''}
                            placeholder="Domyślna"
                            className="mt-1 w-full rounded-lg border border-emerald-200 px-2 py-1 text-sm"
                            onBlur={async (e) => {
                              const value = e.target.value.trim();
                              const res = await fetch(`/api/admin/group-students/${st.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ yearlyUnitPrice: value || null }),
                              });
                              if (!res.ok) {
                                pushToast('error', 'Nie udało się zapisać stawki jednorazowej');
                                return;
                              }
                              pushToast('success', 'Stawka jednorazowa zapisana');
                              await reloadDetail();
                            }}
                          />
                        </label>
                        <label className="block text-xs text-zinc-600">
                          Za poj. zajęcia (indyw.)
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={st.lesson_unit_price ?? ''}
                            placeholder="Domyślna"
                            className="mt-1 w-full rounded-lg border border-emerald-200 px-2 py-1 text-sm"
                            onBlur={async (e) => {
                              const value = e.target.value.trim();
                              const res = await fetch(`/api/admin/group-students/${st.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ lessonUnitPrice: value || null }),
                              });
                              if (!res.ok) {
                                pushToast('error', 'Nie udało się zapisać stawki za pojedyncze zajęcia');
                                return;
                              }
                              pushToast('success', 'Stawka za pojedyncze zajęcia zapisana');
                              await reloadDetail();
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  {!st.left_at && (
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
                  )}
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

    if (selectedGroupId && groupDetail && groupsSubTab !== 'organize' && groupsSubTab !== 'add') {
      return (
        <div className="space-y-4">
          {renderGroupEditForm({ showBackButton: true })}
          {initialGroupId ? renderGroupManageSections(groupDetail, selectedGroupId) : null}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-emerald-100 bg-white p-4">
          <GroupSubTabButtons
            active={groupsSubTab}
            setGroupsSubTab={setGroupsSubTab}
            onOrganizeStateReset={() => {
              setOrganizeExpandedGroupId(null);
              setSelectedGroupId(null);
              setGroupDetail(null);
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-emerald-50 text-zinc-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Nazwa</th>
                    <th className="px-4 py-3 text-left">Poziom</th>
                    <th className="px-4 py-3 text-left">Nauczyciel</th>
                    <th className="px-4 py-3 text-left">Lokalizacja</th>
                    <th className="px-4 py-3 text-left">Termin zajęć</th>
                    <th className="px-4 py-3 text-left">Ceny</th>
                    <th className="px-4 py-3 text-left">Uczniowie</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const priceLines = formatGroupPriceLines(g);
                    return (
                    <tr
                      key={g.id}
                      className="cursor-pointer border-t border-emerald-50 hover:bg-emerald-50/40"
                      onClick={() => loadGroupDetail(g.id)}
                    >
                      <td className="px-4 py-3">{g.name}</td>
                      <td className="px-4 py-3">{g.level ?? '-'}</td>
                      <td className="px-4 py-3">{g.teacher_name ?? '-'}</td>
                      <td className="px-4 py-3">{g.location_name ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-normal text-zinc-700">{g.schedule ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-700">
                        {priceLines.length > 0 ? (
                          <div className="space-y-0.5">
                            {priceLines.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
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
          ) : groupsSubTab === 'add' ? (
            <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
              <h3 className="text-lg font-semibold">{groupForm.id ? 'Edycja grupy' : 'Nowa grupa'}</h3>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Nazwa grupy</label>
                <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" placeholder="Nazwa grupy" value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Poziom</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  placeholder="Poziom"
                  value={groupForm.level}
                  onChange={(e) => setGroupForm((p) => ({ ...p, level: e.target.value }))}
                />
              </div>
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
                <label className="block text-sm font-medium text-zinc-700">Lokalizacja</label>
                <select
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={groupForm.locationId}
                  onChange={(e) => setGroupForm((p) => ({ ...p, locationId: e.target.value }))}
                >
                  <option value="">Brak lokalizacji</option>
                  {schoolLocations.filter((loc) => loc.active).map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Maksymalna liczba uczniów</label>
                <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="number" min="1" value={groupForm.maxStudents} onChange={(e) => setGroupForm((p) => ({ ...p, maxStudents: Number(e.target.value || 12) }))} />
              </div>
              {renderParentContractConsentFields()}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">Stawka ratalna (PLN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                    placeholder="Brak w bazie"
                    value={groupForm.priceMonthly}
                    onChange={(e) => setGroupForm((p) => ({ ...p, priceMonthly: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">Stawka jednorazowa (PLN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                    placeholder="Brak w bazie"
                    value={groupForm.priceYearly}
                    onChange={(e) => setGroupForm((p) => ({ ...p, priceYearly: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">Stawka za pojedyncze zajęcia (PLN)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                    placeholder="Brak w bazie"
                    value={groupForm.pricePerLesson}
                    onChange={(e) => setGroupForm((p) => ({ ...p, pricePerLesson: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Stawki dla tej grupy — ratalna, jednorazowa i za pojedyncze zajęcia — trafiają do umowy rodzica.
              </p>
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
                    if (!groupForm.name.trim()) {
                      pushToast('error', 'Podaj nazwę grupy');
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
                          name: groupForm.name.trim(),
                          level: groupForm.level.trim() || null,
                          teacherId: groupForm.teacherId,
                          maxStudents: groupForm.maxStudents,
                          active: groupForm.active,
                          schoolId: groupForm.schoolId || null,
                          locationId: groupForm.locationId || null,
                          priceMonthly: groupForm.priceMonthly.trim() ? Number(groupForm.priceMonthly) : null,
                          priceYearly: groupForm.priceYearly.trim() ? Number(groupForm.priceYearly) : null,
                          pricePerLesson: groupForm.pricePerLesson.trim() ? Number(groupForm.pricePerLesson) : null,
                          teacherPickupConsent: groupForm.teacherPickupConsent,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        pushToast('error', data.message ?? 'Nie udało się zapisać grupy');
                        return;
                      }
                      pushToast('success', 'Grupa zapisana');
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
      if (s === 'PAID') return 'Opłacona';
      if (s === 'PENDING' || s === 'UNPAID') return 'Oczekuje';
      if (s === 'CANCELLED') return 'Anulowana';
      return status || '—';
    };

    const invoiceKindLabel = (kind: string) => {
      if (kind === 'MONTHLY') return 'Ratalna';
      if (kind === 'YEARLY') return 'Jednorazowa';
      if (kind === 'PER_LESSON') return 'Za zajęcia';
      return 'Inna';
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
    ) => {
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
                <th className="px-3 py-2 text-left">Status</th>
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
                      {line.alreadyInvoiced ? (
                        <span className="text-emerald-700">Wystawiona</span>
                      ) : (
                        <span className="text-amber-700">Do wystawienia</span>
                      )}
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
            Zestawienie planowanych kwot, wystawione faktury, płatności za zajęcia oraz ustawienia
            generowania.
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
                  Podpisane umowy miesięczne (bez trybu bez opłat). Kwoty z umów — tak trafią na
                  fakturę.
                  {monthlyInvoicePreview?.dueDate
                    ? ` Termin płatności: ${monthlyInvoicePreview.dueDate}.`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {renderMonthPicker()}
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
                  {monthlyInvoicesGenerating ? 'Generowanie…' : 'Wygeneruj faktury'}
                </button>
              </div>
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
              {renderMonthPicker()}
            </div>

            {issuedInvoicesLoading ? (
              <p className="text-sm text-zinc-600">Wczytywanie…</p>
            ) : issuedInvoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
                Brak wystawionych faktur w wybranym miesiącu.
              </p>
            ) : (
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
            )}
          </div>
        ) : billingSubTab === 'payments' ? (
          renderLessonBilling()
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

  const renderLessonBilling = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="font-semibold text-[#0f6e56]">Płatności za pojedyncze zajęcia</h4>
          <p className="mt-1 text-sm text-zinc-600">
            Rozliczenie umów za pojedyncze zajęcia — obecności są informacyjne.
          </p>
        </div>
        <label className="text-sm text-zinc-700">
          Miesiąc
          <input
            type="month"
            className="ml-2 rounded-lg border border-emerald-200 px-3 py-2"
            value={lessonBillingMonth}
            onChange={(e) => setLessonBillingMonth(e.target.value)}
          />
        </label>
      </div>

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
      return <ManagerDashboardPanel />;
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
                <MessagesTabLabel
                  label={tab.label}
                  unreadCount={enrollmentsPendingCount + resignationsOpenCount}
                  isActive={activeTab === 'enrollments'}
                  badgeAriaLabel={(n) =>
                    n === 1
                      ? '1 oczekujące zgłoszenie lub rezygnacja'
                      : `${n} oczekujących zgłoszeń lub rezygnacji`
                  }
                />
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
              anulowanie zaplanowanych zajęć i wygaśnięcie subskrypcji. Grupy szkoły pozostaną aktywne, a
              dzieci zostaną przypisane do tych samych grup w kolejnym roku (jeśli jest zaplanowany).
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
                        : 'Rok zamknięty. ') +
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
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/admin/school-years/${editYearModal.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: editYearModal.name.trim(),
                        date_from: editYearModal.date_from.slice(0, 10),
                        date_to: editYearModal.date_to.slice(0, 10),
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

      {deleteFutureLessonsModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Usuń zajęcia z kalendarza</h3>
            <p className="mt-3 text-sm text-zinc-600">
              Czy na pewno chcesz usunąć{' '}
              <strong>{deleteFutureLessonsModal.count} nadchodzących zajęć</strong> tej grupy z kalendarza?
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Zajęcia, które już się odbyły, pozostaną bez zmian. Tej operacji nie można cofnąć.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold"
                onClick={() => setDeleteFutureLessonsModal(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={async () => {
                  const { groupId, quietReload } = deleteFutureLessonsModal;
                  setBusy(true);
                  try {
                    const res = await fetch('/api/admin/lessons/future', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Nie udało się usunąć zajęć');
                      return;
                    }
                    pushToast('success', data.message ?? 'Usunięto zajęcia');
                    setDeleteFutureLessonsModal(null);
                    setClassesCalRefreshSignal((s) => s + 1);
                    await loadGroupDetail(
                      groupId,
                      quietReload ? { quiet: true } : getGroupDetailReloadOptions(groupId),
                    );
                  } catch {
                    pushToast('error', 'Nie udało się usunąć zajęć');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Usuń z kalendarza
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
                    pushToast('success', 'Termin dodany');
                    setScheduleModalOpen(false);
                    await loadGroupDetail(selectedGroupId, getGroupDetailReloadOptions(selectedGroupId));
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
                    pushToast('success', 'Uczeń dodany do grupy');
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

      {generateModalOpen && selectedGroupId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">Generuj zajęcia</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Na podstawie harmonogramu grupy system utworzy pojedyncze terminy zajęć w wybranym okresie.
              Dni wolne z roku szkolnego są pomijane automatycznie. Wszystkie terminy — także z przeszłości —
              trafiają do kalendarza jako zaplanowane.
            </p>
            <div className="mt-4 space-y-3">
              {isRetroactiveGenerateRange(generateForm.dateFrom) && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <span className="font-semibold">Generowanie wsteczne.</span> Data początkowa jest w
                  przeszłości — minione terminy też pojawią się w kalendarzu (zielone, zaplanowane).
                </p>
              )}
              {activeSchoolYear ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 px-3 py-2.5 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={generateWholeSchoolYear}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setGenerateWholeSchoolYear(checked);
                      if (checked) {
                        const yearDates = getSchoolYearGenerateDates();
                        if (yearDates) setGenerateForm(yearDates);
                      }
                    }}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span>
                    <span className="font-semibold text-zinc-900">Cały rok szkolny</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {activeSchoolYear.name} ({activeSchoolYear.date_from.slice(0, 10)} —{' '}
                      {activeSchoolYear.date_to.slice(0, 10)})
                    </span>
                  </span>
                </label>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Brak aktywnego roku szkolnego — ustaw daty ręcznie.
                </p>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Od — pierwsze zajęcia</span>
                <input
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 disabled:bg-zinc-100 disabled:text-zinc-500"
                  type="date"
                  value={generateForm.dateFrom}
                  disabled={generateWholeSchoolYear}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, dateFrom: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-zinc-500">Od tej daty system zacznie tworzyć zajęcia.</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-zinc-700">Do — ostatnie zajęcia</span>
                <input
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2 disabled:bg-zinc-100 disabled:text-zinc-500"
                  type="date"
                  value={generateForm.dateTo}
                  disabled={generateWholeSchoolYear}
                  onChange={(e) => setGenerateForm((p) => ({ ...p, dateTo: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-zinc-500">Ostatni dzień, w którym mogą powstać zajęcia.</span>
              </label>
              <div className="flex justify-end gap-2">
                <button className="rounded-xl bg-zinc-200 px-3 py-2" onClick={() => setGenerateModalOpen(false)}>Anuluj</button>
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    const res = await fetch('/api/admin/lessons/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId: selectedGroupId, ...generateForm }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Błąd generowania');
                      return;
                    }
                    pushToast('success', data.message ?? `Wygenerowano ${data.created ?? 0} zajęć`);
                    setGenerateModalOpen(false);
                    setClassesCalRefreshSignal((s) => s + 1);
                    await loadGroupDetail(selectedGroupId, getGroupDetailReloadOptions(selectedGroupId));
                  }}
                >
                  Generuj
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
