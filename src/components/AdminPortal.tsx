'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import type { EnrollmentStatus } from '@/lib/enrollment-status';
import { normalizePolishPhone } from '@/lib/phone';
import ClassesCalendarPanel from '@/src/components/admin/ClassesCalendarPanel';

type TabKey =
  | 'organization'
  | 'users'
  | 'groups'
  | 'classes'
  | 'enrollment'
  | 'announcements'
  | 'payments';
type MobileTab = 'organization' | 'users' | 'groups' | 'more';
type UsersSubTab = 'parents' | 'children' | 'teachers' | 'managers' | 'add';
type OrganizationSubTab = 'schoolYear' | 'teachers' | 'locations' | 'history';
type TeacherOrgSubTab = 'list' | 'add';
type LocationOrgSubTab = 'list' | 'add' | 'edit';
type GroupsSubTab = 'list' | 'add' | 'organize';

/** Zgodnie z kolumną `users.role` (TEXT): ADMIN, MANAGER, TEACHER, PARENT, CHILD */
type AdminPortalUserRole = 'ADMIN' | 'MANAGER' | 'TEACHER' | 'PARENT' | 'CHILD';

interface AdminUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role?: AdminPortalUserRole;
  confirmed: boolean;
  active: boolean;
  access_level?: 'PENDING' | 'PROPOSED' | 'CONTRACT_SENT' | 'ACTIVE';
  phone?: string | null;
}

interface ChildRow {
  child_id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  active: boolean;
  confirmed: boolean;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  group_name: string | null;
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
  school_year_id: string | null;
  students_count: string;
  active: boolean;
  max_students: number;
  teacher_id: string | null;
}

interface GroupDetail {
  group: {
    id: string;
    school_id?: string | null;
    school_year_id?: string | null;
    location_id?: string | null;
    created_at?: string | null;
    name: string;
    level: string | null;
    teacher_id: string | null;
    teacher_name: string | null;
    location_name?: string | null;
    max_students: number;
    active: boolean;
  };
  scheduleTemplates: Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    duration_min: number;
    location_id: string;
    location_name: string | null;
  }>;
  students: Array<{
    id: string;
    child_id: string;
    first_name: string;
    last_name: string;
    birth_date: string;
    left_at: string | null;
    confirmed: boolean;
  }>;
  nearestLessons: Array<{ id: string; scheduled_at: string; status: string }>;
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
}

const topTabs: Array<{ key: TabKey; label: string }> = [
  { key: 'organization', label: 'Organizacja szkoły' },
  { key: 'users', label: 'Użytkownicy' },
  { key: 'groups', label: 'Grupy' },
  { key: 'classes', label: 'Zajęcia' },
  { key: 'enrollment', label: 'Zgłoszenia' },
  { key: 'announcements', label: 'Wiadomości' },
  { key: 'payments', label: 'Płatności' },
];

const mobileTabs: Array<{ key: MobileTab; label: string }> = [
  { key: 'organization', label: 'Szkoła' },
  { key: 'users', label: 'Uczniowie' },
  { key: 'groups', label: 'Grupy' },
  { key: 'more', label: 'Więcej' },
];

const organizationTabs: Array<{ key: OrganizationSubTab; label: string }> = [
  { key: 'schoolYear', label: 'Rok szkolny' },
  { key: 'teachers', label: 'Nauczyciele' },
  { key: 'locations', label: 'Lokalizacje' },
  { key: 'history', label: 'Historia' },
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
  const [activeTab, setActiveTab] = useState<TabKey>(initialGroupId ? 'groups' : 'organization');
  const [mobileTab, setMobileTab] = useState<MobileTab>(initialGroupId ? 'groups' : 'organization');
  const [organizationSubTab, setOrganizationSubTab] = useState<OrganizationSubTab>('schoolYear');
  const [teacherOrgSubTab, setTeacherOrgSubTab] = useState<TeacherOrgSubTab>('list');
  const [locationOrgSubTab, setLocationOrgSubTab] = useState<LocationOrgSubTab>('list');
  const [groupsSubTab, setGroupsSubTab] = useState<GroupsSubTab>('list');
  const [schoolLocations, setSchoolLocations] = useState<SchoolLocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [newLocationForm, setNewLocationForm] = useState({ name: '', address: '' });
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
  }>>([{ firstName: '', lastName: '', birthDate: '' }]);
  const [newTeacherForm, setNewTeacherForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [childModalOpen, setChildModalOpen] = useState(false);
  const [childForm, setChildForm] = useState({
    parentId: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    parentSearch: '',
  });
  const [enrollmentParents, setEnrollmentParents] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    accessLevel: EnrollmentStatus;
    children: Array<{
      id: string;
      requestId: string;
      firstName: string;
      lastName: string;
      confirmed: boolean;
      status: EnrollmentStatus;
      birthDate: string | null;
      preferredLocation: string | null;
      preferredDays: string | null;
      notes: string | null;
      proposedGroupId: string | null;
      proposedAt: string | null;
      proposalCount?: number;
      hasPendingProposal?: boolean;
    }>;
  }>>([]);
  const [enrollmentGroups, setEnrollmentGroups] = useState<Array<{
    id: string;
    name: string;
    location_name: string;
    schedule: string;
  }>>([]);
  const [proposalModalParentId, setProposalModalParentId] = useState<string | null>(null);
  const [submittingProposalRequestId, setSubmittingProposalRequestId] = useState<string | null>(null);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, { groupId: string }>>({});
  const [proposalHistoryByRequestId, setProposalHistoryByRequestId] = useState<
    Record<
      string,
      Array<{
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
      }>
    >
  >({});
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({
    id: '',
    schoolId: '',
    schoolYearId: '',
    locationId: '',
    name: '',
    level: '',
    teacherId: '',
    maxStudents: 12,
    active: true,
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [organizeExpandedGroupId, setOrganizeExpandedGroupId] = useState<string | null>(null);
  const [organizeLoadingGroupId, setOrganizeLoadingGroupId] = useState<string | null>(null);
  const [organizeFilterName, setOrganizeFilterName] = useState('');
  const [organizeFilterLocation, setOrganizeFilterLocation] = useState('');
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
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHolidayRow[]>([]);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    type: 'HOLIDAY' as 'HOLIDAY' | 'PUBLIC' | 'SCHOOL' | 'CANCELLED',
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, cRes, eRes, gRes, meRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/children'),
        fetch('/api/admin/enrollment'),
        fetch('/api/admin/groups'),
        fetch('/api/user/me'),
      ]);
      const failing: string[] = [];
      if (!uRes.ok) failing.push(`users(${uRes.status})`);
      if (!cRes.ok) failing.push(`children(${cRes.status})`);
      if (!eRes.ok) failing.push(`enrollment(${eRes.status})`);
      if (!gRes.ok) failing.push(`groups(${gRes.status})`);
      if (failing.length > 0) {
        let detail = "";
        try {
          const errBody = !eRes.ok ? await eRes.clone().json() : null;
          if (errBody?.message) detail = ` — ${errBody.message}`;
        } catch {
          /* ignore */
        }
        throw new Error(`Nie udało się pobrać danych: ${failing.join(', ')}${detail}`);
      }
      const uJson = await uRes.json();
      const cJson = await cRes.json();
      const eJson = await eRes.json();
      const gJson = await gRes.json();
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
      setUsers((uJson.users ?? []) as AdminUser[]);
      setChildren((cJson.children ?? []) as ChildRow[]);
      setEnrollmentParents(eJson.parents ?? []);
      setEnrollmentGroups(eJson.groups ?? []);
      setGroups((gJson.groups ?? []) as GroupRow[]);
    } catch (error) {
      console.error(error);
      pushToast(
        'error',
        error instanceof Error ? error.message : 'Błąd pobierania danych panelu',
      );
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  useEffect(() => {
    if (
      activeTab === 'organization' &&
      (organizationSubTab === 'schoolYear' || organizationSubTab === 'history')
    ) {
      void loadSchoolYearData();
    }
  }, [activeTab, organizationSubTab, loadSchoolYearData]);

  useEffect(() => {
    if (activeTab === 'organization' && organizationSubTab === 'locations') {
      void loadLocations();
    }
  }, [activeTab, organizationSubTab, loadLocations]);

  useEffect(() => {
    if (activeTab === 'classes') void loadLocations();
  }, [activeTab, loadLocations]);

  useEffect(() => {
    if (mobileTab === 'organization') setActiveTab('organization');
    if (mobileTab === 'users') setActiveTab('users');
    if (mobileTab === 'groups') setActiveTab('groups');
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

  const loadGroupDetail = useCallback(async (groupId: string, options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    if (quiet) setOrganizeLoadingGroupId(groupId);
    else setGroupLoading(true);
    try {
      const res = await fetch(`/api/admin/groups/${groupId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się pobrać szczegółów grupy');
      setGroupDetail(data as GroupDetail);
      setSelectedGroupId(groupId);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Błąd pobierania grupy');
    } finally {
      if (quiet) setOrganizeLoadingGroupId(null);
      else setGroupLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!initialGroupId || initialGroupLoaded) return;
    void loadGroupDetail(initialGroupId);
    setInitialGroupLoaded(true);
  }, [initialGroupId, initialGroupLoaded, loadGroupDetail]);

  useEffect(() => {
    if (!proposalModalParentId) {
      setProposalHistoryByRequestId({});
      return;
    }
    const pid = proposalModalParentId.trim();
    const parent = enrollmentParents.find((p) => {
      if (p.id === pid) return true;
      const em = (p.email ?? '').trim().toLowerCase();
      return em.length > 0 && pid.includes('@') && em === pid.toLowerCase();
    });
    if (!parent) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        parent.children.map(async (c) => {
          const r = await fetch(
            `/api/admin/enrollment/proposals?enrollmentRequestId=${encodeURIComponent(c.requestId)}`,
            { credentials: 'include' },
          );
          if (!r.ok) return [c.requestId, []] as const;
          const d = (await r.json()) as {
            proposals?: Array<{
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
            }>;
          };
          return [c.requestId, d.proposals ?? []] as const;
        }),
      );
      if (!cancelled) setProposalHistoryByRequestId(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalModalParentId, enrollmentParents]);

  const availableChildren = useMemo(() => {
    if (!groupDetail) return [];
    const activeInGroup = new Set(groupDetail.students.filter((s) => !s.left_at).map((s) => s.child_id));
    return children
      .filter((c) => c.confirmed && c.active && !activeInGroup.has(c.child_id))
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
    if (newUser.role === 'PARENT') {
      if (newParentChildren.length === 0 || newParentChildren.some((child) => !child.firstName || !child.lastName || !child.birthDate)) {
        pushToast('error', 'Dodaj co najmniej jedno dziecko i uzupełnij jego dane');
        return;
      }
    }
    setBusy(true);
    try {
      const normalizedPhone = normalizePolishPhone(newUser.phone ?? '');
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          confirmed: true,
          accessLevel: newUser.role === 'PARENT' ? 'PENDING' : 'ACTIVE',
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Nie udało się dodać użytkownika');

      if (newUser.role === 'PARENT') {
        for (const child of newParentChildren) {
          const childRes = await fetch('/api/admin/children', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              parentId: data.user.id,
              firstName: child.firstName,
              lastName: child.lastName,
              birthDate: child.birthDate,
            }),
          });
          if (!childRes.ok) {
            const childData = await childRes.json();
            throw new Error(childData.message ?? 'Nie udało się dodać dziecka');
          }
        }
        pushToast('success', 'Rodzic i dzieci zostali dodani');
      } else {
        pushToast('success', 'Dodano użytkownika');
      }

      setUsersSubTab('parents');
      setNewUser({ firstName: '', lastName: '', email: '', password: '', phone: '', role: '' });
      setNewParentChildren([{ firstName: '', lastName: '', birthDate: '' }]);
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
            </select>
            </div>

            {newUser.role === 'PARENT' && (
              <div className="rounded-xl border border-emerald-200 p-3">
                <p className="mb-2 font-semibold text-zinc-800">Dane dziecka</p>
                <div className="space-y-2">
                  {newParentChildren.map((child, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-4">
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
                    setNewParentChildren((prev) => [...prev, { firstName: '', lastName: '', birthDate: '' }])
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
                  return (
                    <tr key={user.id} className="border-t border-emerald-50">
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
                }

                return (
                  <tr key={user.id} className="border-t border-emerald-50">
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
            + Dodaj dziecko
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-emerald-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 text-left">Imię</th>
                <th className="px-4 py-3 text-left">Nazwisko</th>
                <th className="px-4 py-3 text-left">Data urodzenia</th>
                <th className="px-4 py-3 text-left">Rodzic</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Grupa</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <tr key={child.child_id} className="border-t border-emerald-50">
                  <td className="px-4 py-3">{child.first_name}</td>
                  <td className="px-4 py-3">{child.last_name}</td>
                  <td className="px-4 py-3">{child.birth_date}</td>
                  <td className="px-4 py-3">{child.parent_first_name} {child.parent_last_name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${child.confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-800'}`}>
                      {child.confirmed ? 'potwierdzony' : 'niepotwierdzony'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{child.group_name ?? '-'}</td>
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
            Konfiguracja roku szkolnego, kadry, sal oraz archiwum zmian.
          </p>
        </header>

        <div className="mt-4 flex flex-wrap gap-2">
          {organizationTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
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
                Jeden aktywny rok szkolny naraz. Generowanie zajęć i dni wolnych musi mieścić się w jego zakresie dat.
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
                    return (
                      <>
                        {active ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Aktywny rok</p>
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
                            disabled={busy || !!active}
                            onClick={() => {
                              setNewYearForm({ name: '', dateFrom: '', dateTo: '' });
                              setNewYearModalOpen(true);
                            }}
                            className="rounded-xl bg-[#0f6e56] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c5a47] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            + Nowy rok szkolny
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

                        {inactive.length > 0 && (
                          <div className="rounded-xl border border-emerald-100 bg-zinc-50/50 p-4">
                            <h4 className="text-sm font-semibold text-zinc-800">Poprzednie lata</h4>
                            <ul className="mt-2 space-y-2">
                              {inactive.map((y) => (
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
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {schoolLocations.length === 0 ? (
                        <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                          Brak lokalizacji — dodaj pierwszą w zakładce „Dodaj nową lokalizację”.
                        </p>
                      ) : (
                        schoolLocations.map((loc) => (
                          <div
                            key={loc.id}
                            className="flex flex-col justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3 sm:flex-row sm:items-center"
                          >
                            <div>
                              <p className="font-semibold text-zinc-900">{loc.name}</p>
                              {loc.address ? (
                                <p className="text-sm text-zinc-600">{loc.address}</p>
                              ) : (
                                <p className="text-xs text-zinc-500">Bez adresu</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-center">
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
                        setBusy(true);
                        try {
                          const body: { name: string; address?: string; schoolId?: string } = {
                            name,
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
                          setNewLocationForm({ name: '', address: '' });
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

          {organizationSubTab === 'history' && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-600">Zakończone lata szkolne z bazy (nieaktywne).</p>
              {schoolYearLoading ? (
                <div className="space-y-2">
                  <div className="h-20 animate-pulse rounded-xl bg-emerald-100/80" />
                  <div className="h-20 animate-pulse rounded-xl bg-emerald-100/60" />
                </div>
              ) : (
                <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                  {schoolYears.filter((y) => !(y.isActive ?? y.active)).length === 0 ? (
                    <p className="rounded-xl border border-emerald-100 px-4 py-6 text-sm text-zinc-600">
                      Brak danych — brak nieaktywnych lat szkolnych.
                    </p>
                  ) : (
                    schoolYears
                      .filter((y) => !(y.isActive ?? y.active))
                      .sort(
                        (a, b) =>
                          String(b.date_from).localeCompare(String(a.date_from), 'pl'),
                      )
                      .map((y) => (
                        <div
                          key={y.id}
                          className="rounded-xl border border-emerald-100 bg-white px-4 py-3"
                        >
                          <p className="font-semibold text-[#0f6e56]">
                            {y.name}{' '}
                            <span className="font-normal text-zinc-500">· nieaktywny</span>
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {String(y.date_from).slice(0, 10)} — {String(y.date_to).slice(0, 10)}
                          </p>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderGroupManageSections = (detail: GroupDetail, groupId: string, opts?: { quietReload?: boolean }) => {
    const quietReload = opts?.quietReload === true;
    const reloadDetail = () => loadGroupDetail(groupId, quietReload ? { quiet: true } : undefined);
    return (
      <>
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Harmonogram</h4>
              <p className="text-sm text-zinc-500">Stałe terminy grupy (dzień, godzina, czas trwania, lokalizacja).</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white"
              onClick={() => setScheduleModalOpen(true)}
            >
              + Dodaj termin
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {detail.scheduleTemplates.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-zinc-600">
                Brak zdefiniowanych terminów.
              </p>
            ) : (
              detail.scheduleTemplates.map((st) => (
                <div key={st.id} className="flex items-center justify-between rounded-xl border border-emerald-100 p-3">
                  <div>
                    <p>
                      {({ 1: 'Poniedziałek', 2: 'Wtorek', 3: 'Środa', 4: 'Czwartek', 5: 'Piątek', 6: 'Sobota', 7: 'Niedziela' } as Record<number, string>)[st.day_of_week] ?? `Dzień ${st.day_of_week}`} · {st.start_time.slice(0, 5)} · {st.duration_min} min
                    </p>
                    <p className="text-zinc-600">{st.location_name ?? '-'}</p>
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
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Uczniowie grupy</h4>
              <p className="text-sm text-zinc-500">Zarządzaj przypisaniami uczniów do tej grupy.</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm font-semibold text-white"
              onClick={() => setAddStudentModalOpen(true)}
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
                <div key={st.id} className="flex items-center justify-between rounded-xl border border-emerald-100 p-3">
                  <div>
                    <p>
                      {st.first_name} {st.last_name}
                    </p>
                    <p className="text-zinc-600">
                      {st.birth_date} · {st.left_at ? 'były' : 'aktywny'}
                    </p>
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

        <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900">Generowanie zajęć</h4>
              <p className="text-sm text-zinc-500">Wygeneruj kalendarz zajęć na podstawie harmonogramu grupy.</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => setGenerateModalOpen(true)}
            >
              Generuj zajęcia z harmonogramu
            </button>
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

    if (selectedGroupId && groupDetail && groupsSubTab !== 'organize') {
      return (
        <div className="space-y-4">
          <section className="rounded-2xl border border-emerald-100 bg-white p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-zinc-900">{groupDetail.group.name}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    Poziom: {groupDetail.group.level ?? '-'}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    Nauczyciel: {groupDetail.group.teacher_name ?? '-'}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                    Lokalizacja: {groupDetail.group.location_name ?? '-'}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    Uczniowie: {groupDetail.students.filter((s) => !s.left_at).length}/{groupDetail.group.max_students}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={() => {
                    setGroupForm({
                      id: groupDetail.group.id,
                      schoolId: groupDetail.group.school_id ?? sessionSchoolId ?? '',
                      schoolYearId: groupDetail.group.school_year_id ?? '',
                      locationId: groupDetail.group.location_id ?? '',
                      name: groupDetail.group.name,
                      level: groupDetail.group.level ?? '',
                      teacherId: groupDetail.group.teacher_id ?? '',
                      maxStudents: groupDetail.group.max_students,
                      active: groupDetail.group.active,
                    });
                    setGroupModalOpen(true);
                  }}
                >
                  Edytuj
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-zinc-200 px-3 py-2"
                  onClick={() => {
                    setSelectedGroupId(null);
                    setGroupDetail(null);
                  }}
                >
                  Wróć do listy
                </button>
              </div>
            </div>
          </section>

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
            onOrganizeStateReset={() => {
              setOrganizeExpandedGroupId(null);
              setSelectedGroupId(null);
              setGroupDetail(null);
            }}
            onEnterAddTab={() => {
              setGroupForm({
                id: '',
                schoolId: sessionSchoolId ?? '',
                schoolYearId: schoolYears.find((y) => y.isActive ?? y.active)?.id ?? '',
                locationId: '',
                name: '',
                level: '',
                teacherId: '',
                maxStudents: 12,
                active: true,
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
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-emerald-50 text-zinc-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Nazwa</th>
                    <th className="px-4 py-3 text-left">Poziom</th>
                    <th className="px-4 py-3 text-left">Nauczyciel</th>
                    <th className="px-4 py-3 text-left">Lokalizacja</th>
                    <th className="px-4 py-3 text-left">Uczniowie</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr
                      key={g.id}
                      className="cursor-pointer border-t border-emerald-50 hover:bg-emerald-50/40"
                      onClick={() => loadGroupDetail(g.id)}
                    >
                      <td className="px-4 py-3">{g.name}</td>
                      <td className="px-4 py-3">{g.level ?? '-'}</td>
                      <td className="px-4 py-3">{g.teacher_name ?? '-'}</td>
                      <td className="px-4 py-3">{g.location_name ?? '-'}</td>
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
                            setGroupForm({
                              id: g.id,
                              schoolId: sessionSchoolId ?? '',
                              schoolYearId: g.school_year_id ?? '',
                              locationId: g.location_id ?? '',
                              name: g.name,
                              level: g.level ?? '',
                              teacherId: g.teacher_id ?? '',
                              maxStudents: g.max_students,
                              active: g.active,
                            });
                            void loadLocations();
                            setGroupModalOpen(true);
                          }}
                        >
                          Edytuj
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : groupsSubTab === 'add' ? (
            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
              <h3 className="text-lg font-semibold">Nowa grupa</h3>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Rok szkolny</label>
                <select
                  className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                  value={groupForm.schoolYearId}
                  onChange={(e) => setGroupForm((p) => ({ ...p, schoolYearId: e.target.value }))}
                >
                  <option value="">Brak roku szkolnego</option>
                  {schoolYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}{(year.isActive ?? year.active) ? ' (aktywny)' : ''}
                    </option>
                  ))}
                </select>
              </div>
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
                  onClick={() => setGroupsSubTab('list')}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    if (!groupForm.name.trim()) {
                      pushToast('error', 'Podaj nazwę grupy');
                      return;
                    }
                    if (!groupForm.teacherId) {
                      pushToast('error', 'Wybierz nauczyciela dla grupy');
                      return;
                    }
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
                        schoolYearId: groupForm.schoolYearId || null,
                        locationId: groupForm.locationId || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Nie udało się zapisać grupy');
                      return;
                    }
                    pushToast('success', 'Grupa zapisana');
                    setGroupsSubTab('list');
                    await loadData();
                  }}
                >
                  Zapisz
                </button>
              </div>
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
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-3">
                                <p className="text-sm font-medium text-zinc-700">Szczegóły i edycja danych grupy</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                                    onClick={() => {
                                      setGroupForm({
                                        id: groupDetail.group.id,
                                        schoolId: groupDetail.group.school_id ?? sessionSchoolId ?? '',
                                        schoolYearId: groupDetail.group.school_year_id ?? '',
                                        locationId: groupDetail.group.location_id ?? '',
                                        name: groupDetail.group.name,
                                        level: groupDetail.group.level ?? '',
                                        teacherId: groupDetail.group.teacher_id ?? '',
                                        maxStudents: groupDetail.group.max_students,
                                        active: groupDetail.group.active,
                                      });
                                      setGroupModalOpen(true);
                                    }}
                                  >
                                    Edytuj
                                  </button>
                                  <Link
                                    href={`/portal/groups/${g.id}`}
                                    className="inline-flex items-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                                  >
                                    Pełny widok
                                  </Link>
                                </div>
                              </div>
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      );
    }
    if (activeTab === 'organization') return renderOrganization();
    if (activeTab === 'users') return renderUsers();
    if (activeTab === 'groups') return renderGroups();
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
    if (activeTab === 'payments') return <EmptyDataPanel title="Płatności" />;
    if (activeTab === 'enrollment') {
      const enrollmentRows = enrollmentParents.filter((parent) => parent.children.length > 0);
      if (enrollmentRows.length === 0) {
        return <EmptyDataPanel title="Zgłoszenia" />;
      }
      return (
        <section className="rounded-2xl border border-emerald-100 bg-white space-y-3 p-4">
          {enrollmentRows.map((parent) => (
            <div key={parent.id} className="rounded-xl border border-emerald-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {parent.firstName} {parent.lastName}
                  </p>
                  <p className="text-sm text-zinc-600">{parent.email}</p>
                  <p className="mt-1 text-xs text-zinc-500">Status: {parent.accessLevel}</p>
                </div>
                <button
                  className="rounded-xl bg-[#0f6e56] px-3 py-2 text-sm text-white"
                  onClick={() => {
                    setProposalModalParentId(parent.id);
                    setProposalDrafts(() => {
                      const next: Record<string, { groupId: string }> = {};
                      for (const child of parent.children) {
                        next[child.requestId] = {
                          groupId: child.proposedGroupId ?? '',
                        };
                      }
                      return next;
                    });
                  }}
                >
                  Zobacz szczegóły
                </button>
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                Dzieci:{' '}
                {parent.children.map((child) => `${child.firstName} ${child.lastName}`).join(', ') ||
                  'brak'}
              </p>
            </div>
          ))}
        </section>
      );
    }
    if (activeTab === 'announcements') return <EmptyDataPanel title="Wiadomości" />;
    return <EmptyDataPanel title="Panel" />;
  };
  const proposalParent =
    proposalModalParentId == null
      ? null
      : enrollmentParents.find((parent) => {
          const pid = proposalModalParentId.trim();
          if (parent.id === pid) return true;
          const em = (parent.email ?? '').trim().toLowerCase();
          if (em.length > 0 && pid.includes('@') && em === pid.toLowerCase()) return true;
          return false;
        }) ?? null;

  return (
    <div className="manager-panel pb-24" data-session-school-id={sessionSchoolId ?? ''}>
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

      <div className="mt-4">{renderContent()}</div>

      <nav className="fixed bottom-3 left-1/2 z-40 w-[min(96vw,460px)] -translate-x-1/2 rounded-2xl border border-emerald-200 bg-white p-1 shadow-lg md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {mobileTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
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
              anulowanie wszystkich zaplanowanych zajęć, zamknięcie grup i wygaśnięcie subskrypcji.
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
                    pushToast(
                      'success',
                      `Rok zamknięty: anulowano ${data.lessonsCancelled ?? 0} zajęć, ` +
                        `zamknięto ${data.groupsClosed ?? 0} grup, wygaszono ${data.subscriptionsExpired ?? 0} subskrypcji.`
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
            <h3 className="text-lg font-semibold">Nowy rok szkolny</h3>
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
                    pushToast('success', 'Utworzono rok szkolny');
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
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dzień wolny</h3>
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
                  onChange={(e) => setHolidayForm((p) => ({ ...p, dateFrom: e.target.value }))}
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
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message ?? 'Błąd');
                    pushToast('success', 'Dodano dzień wolny');
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

      {groupModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5">
            <h3 className="text-lg font-semibold">{groupForm.id ? 'Edytuj grupę' : 'Nowa grupa'}</h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-zinc-700">Rok szkolny</label>
              <select
                className="w-full rounded-xl border border-emerald-200 px-3 py-2"
                value={groupForm.schoolYearId}
                onChange={(e) => setGroupForm((p) => ({ ...p, schoolYearId: e.target.value }))}
              >
                <option value="">Brak roku szkolnego</option>
                {schoolYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}{(year.isActive ?? year.active) ? ' (aktywny)' : ''}
                  </option>
                ))}
              </select>
              </div>
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
                <button className="rounded-xl bg-zinc-200 px-3 py-2" onClick={() => setGroupModalOpen(false)}>Anuluj</button>
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-white"
                  onClick={async () => {
                    if (!groupForm.name.trim()) {
                      pushToast('error', 'Podaj nazwę grupy');
                      return;
                    }
                    if (!groupForm.teacherId) {
                      pushToast('error', 'Wybierz nauczyciela dla grupy');
                      return;
                    }
                    const endpoint = groupForm.id ? `/api/admin/groups/${groupForm.id}` : '/api/admin/groups';
                    const res = await fetch(endpoint, {
                      method: groupForm.id ? 'PUT' : 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: groupForm.name.trim(),
                        level: groupForm.level.trim() || null,
                        teacherId: groupForm.teacherId,
                        maxStudents: groupForm.maxStudents,
                        active: groupForm.active,
                        schoolId: groupForm.schoolId || null,
                        schoolYearId: groupForm.schoolYearId || null,
                        locationId: groupForm.locationId || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      pushToast('error', data.message ?? 'Nie udało się zapisać grupy');
                      return;
                    }
                    pushToast('success', groupForm.id ? 'Grupa zaktualizowana' : 'Grupa zapisana');
                    setGroupModalOpen(false);
                    await loadData();
                    if (groupForm.id) {
                      await loadGroupDetail(
                        groupForm.id,
                        groupsSubTab === 'organize' && organizeExpandedGroupId === groupForm.id
                          ? { quiet: true }
                          : undefined,
                      );
                    }
                  }}
                >
                  Zapisz
                </button>
              </div>
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
                    await loadGroupDetail(
                      selectedGroupId,
                      groupsSubTab === 'organize' && organizeExpandedGroupId === selectedGroupId
                        ? { quiet: true }
                        : undefined,
                    );
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
                    await loadGroupDetail(
                      selectedGroupId,
                      groupsSubTab === 'organize' && organizeExpandedGroupId === selectedGroupId
                        ? { quiet: true }
                        : undefined,
                    );
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
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="date" value={generateForm.dateFrom} onChange={(e) => setGenerateForm((p) => ({ ...p, dateFrom: e.target.value }))} />
              <input className="w-full rounded-xl border border-emerald-200 px-3 py-2" type="date" value={generateForm.dateTo} onChange={(e) => setGenerateForm((p) => ({ ...p, dateTo: e.target.value }))} />
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
                    await loadGroupDetail(
                      selectedGroupId,
                      groupsSubTab === 'organize' && organizeExpandedGroupId === selectedGroupId
                        ? { quiet: true }
                        : undefined,
                    );
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
            <h3 className="text-lg font-semibold">Dodaj dziecko</h3>
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
                    const res = await fetch('/api/admin/children', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        parentId: childForm.parentId,
                        firstName: childForm.firstName,
                        lastName: childForm.lastName,
                        birthDate: childForm.birthDate,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      pushToast('error', data.message ?? 'Nie udało się dodać dziecka');
                      return;
                    }
                    pushToast('success', 'Dziecko zostało dodane');
                    setChildForm({ parentId: '', firstName: '', lastName: '', birthDate: '', parentSearch: '' });
                    setChildModalOpen(false);
                    await loadData();
                  }}
                >
                  Dodaj dziecko
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {proposalModalParentId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5">
            <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-3 flex items-center justify-between border-b border-emerald-100 bg-white px-5 py-3">
              <h3 className="text-lg font-semibold">Szczegóły zgłoszenia</h3>
            </div>
            {proposalParent ? (
              <div className="mt-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Rodzic
                  </p>
                  <p className="mt-1 break-words text-lg font-semibold leading-tight text-zinc-900">
                    {proposalParent.firstName} {proposalParent.lastName}
                  </p>
                  <p className="mt-1 break-all text-sm text-zinc-600">{proposalParent.email}</p>
                </div>
                <div className="mt-4 space-y-3">
                  {proposalParent.children.map((child) => {
                    const statusLabels: Record<EnrollmentStatus, string> = {
                      NEW: 'Nowe zgłoszenie',
                      PROPOSED: 'Propozycja wysłana — oczekuje na rodzica',
                      NEGOTIATING: 'Odrzucona propozycja — oczekuje na nową z szkoły',
                      ACCEPTED: 'Zaakceptowane przez rodzica',
                      SIGNED: 'Umowa podpisana',
                      COMPLETED: 'Zakończone',
                      REJECTED: 'Odrzucone przez managera',
                    };
                    const statusColors: Record<EnrollmentStatus, string> = {
                      NEW: 'bg-amber-100 text-amber-800',
                      PROPOSED: 'bg-sky-100 text-sky-800',
                      NEGOTIATING: 'bg-amber-100 text-amber-900',
                      ACCEPTED: 'bg-emerald-100 text-emerald-800',
                      SIGNED: 'bg-emerald-200 text-emerald-900',
                      COMPLETED: 'bg-zinc-200 text-zinc-700',
                      REJECTED: 'bg-rose-100 text-rose-800',
                    };
                    const proposalAllowed =
                      child.status === 'NEW' ||
                      child.status === 'REJECTED' ||
                      child.status === 'NEGOTIATING';
                    const proposedGroup =
                      child.proposedGroupId
                        ? enrollmentGroups.find((g) => g.id === child.proposedGroupId)
                        : null;
                    const proposedAtFormatted = child.proposedAt
                      ? (() => {
                          const d = new Date(child.proposedAt as string);
                          return Number.isNaN(d.getTime())
                            ? child.proposedAt
                            : d.toLocaleString('pl-PL', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              });
                        })()
                      : null;
                    const history = proposalHistoryByRequestId[child.requestId] ?? [];
                    return (
                    <div key={child.requestId} className="rounded-xl border border-emerald-100 p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="font-semibold">
                            {child.firstName} {child.lastName}
                          </p>
                          <p className="mt-1">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[child.status] ?? 'bg-zinc-100 text-zinc-700'}`}
                            >
                              {statusLabels[child.status] ?? child.status}
                            </span>
                          </p>
                          <p className="mt-2 text-sm text-zinc-600">Data urodzenia: {child.birthDate ?? 'brak'}</p>
                          <p className="text-sm text-zinc-600">
                            Preferowana lokalizacja: {child.preferredLocation ?? 'brak'}
                          </p>
                          <p className="text-sm text-zinc-600">
                            Preferowane dni: {child.preferredDays ?? 'brak'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {child.status === 'PROPOSED' ? (
                            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm">
                              <p className="font-semibold text-sky-900">Propozycja wysłana</p>
                              {proposedGroup ? (
                                <p className="mt-1 text-sky-900">
                                  {proposedGroup.name} · {proposedGroup.location_name} ·{' '}
                                  {proposedGroup.schedule}
                                </p>
                              ) : (
                                <p className="mt-1 text-sky-900">
                                  (nie udało się dopasować grupy w aktualnej liście)
                                </p>
                              )}
                              {proposedAtFormatted && (
                                <p className="mt-1 text-xs text-sky-800">
                                  Wysłano: {proposedAtFormatted}
                                </p>
                              )}
                              {(child.proposalCount ?? 0) >= 3 && (
                                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                  To zgłoszenie ma już {child.proposalCount} propozycji grup (limit miękki: 3).
                                  Rozważ kontakt z rodzicem przed kolejną propozycją.
                                </p>
                              )}
                              <p className="mt-2 text-xs text-sky-800">
                                Czekamy na decyzję rodzica. Kolejną propozycję będzie można wysłać
                                dopiero po jej odrzuceniu.
                              </p>
                            </div>
                          ) : (
                            <>
                              {child.status === 'NEGOTIATING' && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                  Rodzic odrzucił ostatnią propozycję — możesz wysłać kolejną propozycję grupy.
                                </p>
                              )}
                              {child.status === 'REJECTED' && (
                                <p className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                                  Zgłoszenie oznaczone jako odrzucone przez szkołę — możesz zaproponować inną grupę,
                                  jeśli proces ma być kontynuowany.
                                </p>
                              )}
                              {proposalAllowed && (
                                <>
                                  {(child.proposalCount ?? 0) >= 3 && (
                                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                      To zgłoszenie ma już {child.proposalCount} propozycji grup (limit miękki: 3).
                                      Rozważ kontakt z rodzicem przed kolejną propozycją.
                                    </p>
                                  )}
                              <select
                                className="w-full rounded-xl border border-emerald-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={!proposalAllowed}
                                value={proposalDrafts[child.requestId]?.groupId ?? ''}
                                onChange={(e) =>
                                  setProposalDrafts((prev) => ({
                                    ...prev,
                                    [child.requestId]: {
                                      groupId: e.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="">Wybierz grupę</option>
                                {enrollmentGroups.map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.name} - {group.location_name} - {group.schedule}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={
                                  !proposalAllowed ||
                                  child.hasPendingProposal === true ||
                                  submittingProposalRequestId === child.requestId
                                }
                                className="rounded-xl bg-emerald-600 px-3 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={async () => {
                                  const draft = proposalDrafts[child.requestId];
                                  const groupId = draft?.groupId ?? '';
                                  if (!groupId) {
                                    pushToast('error', 'Wybierz grupę');
                                    return;
                                  }
                                  setSubmittingProposalRequestId(child.requestId);
                                  try {
                                    const res = await fetch('/api/admin/enrollment', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        requestId: child.requestId,
                                        groupId,
                                      }),
                                    });
                                    const data = (await res.json().catch(() => ({}))) as {
                                      message?: string;
                                      parentCreated?: boolean;
                                      parentId?: string;
                                      proposalCount?: number;
                                    };
                                    if (!res.ok) {
                                      pushToast(
                                        'error',
                                        data?.message ?? 'Nie udało się wysłać propozycji',
                                      );
                                      return;
                                    }
                                    const accountInfo = data?.parentCreated
                                      ? ' (utworzono konto rodzica)'
                                      : '';
                                    pushToast(
                                      'success',
                                      `Wysłano propozycję dla: ${child.firstName} ${child.lastName}${accountInfo}`,
                                    );
                                    if (
                                      typeof data.parentId === 'string' &&
                                      data.parentId.trim().length > 0
                                    ) {
                                      setProposalModalParentId(data.parentId.trim());
                                    }
                                    // Nie zamykamy modala — rodzic może mieć więcej dzieci,
                                    // dla których nadal trzeba wysłać propozycję.
                                    // Sprzątamy tylko draft tego dziecka (jego sekcja zmieni się
                                    // na "Propozycja wysłana" po loadData, ale czyścimy na wszelki wypadek).
                                    setProposalDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[child.requestId];
                                      return next;
                                    });
                                    await loadData();
                                  } catch (err) {
                                    pushToast(
                                      'error',
                                      err instanceof Error ? err.message : 'Błąd wysyłania propozycji',
                                    );
                                  } finally {
                                    setSubmittingProposalRequestId(null);
                                  }
                                }}
                              >
                                {submittingProposalRequestId === child.requestId
                                  ? 'Wysyłanie…'
                                  : 'Wyślij propozycję dla dziecka'}
                              </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/90">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-800">
                          Historia propozycji grup ({history.length})
                        </summary>
                        <div className="space-y-2 border-t border-zinc-200 px-3 py-3 text-sm">
                          {history.length === 0 ? (
                            <p className="text-xs text-zinc-500">Brak zapisanej historii.</p>
                          ) : (
                            history.map((h) => (
                              <div key={h.id} className="rounded-lg border border-white bg-white p-2 shadow-sm">
                                <p className="font-semibold text-zinc-900">{h.group_name}</p>
                                <p className="text-xs text-zinc-600">
                                  {h.location_name} · {h.schedule}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  Wysłano:{' '}
                                  {new Date(h.proposed_at).toLocaleString('pl-PL', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                  {' · '}
                                  Status: {h.status}
                                  {h.responded_at
                                    ? ` · Odpowiedź: ${new Date(h.responded_at).toLocaleString('pl-PL', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                      })}`
                                    : ''}
                                </p>
                                {h.status === 'REJECTED' && h.rejection_comment && (
                                  <p className="mt-1 text-xs text-rose-800">
                                    Komentarz rodzica: {h.rejection_comment}
                                  </p>
                                )}
                                {(h.proposed_by_first_name || h.proposed_by_last_name) && (
                                  <p className="mt-1 text-xs text-zinc-500">
                                    Wysłał(a): {h.proposed_by_first_name} {h.proposed_by_last_name}
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </details>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-600">Nie znaleziono szczegółów zgłoszenia.</p>
            )}
            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-4 flex justify-end border-t border-emerald-100 bg-white px-5 py-3">
              <button
                className="rounded-xl bg-zinc-200 px-3 py-2"
                onClick={() => setProposalModalParentId(null)}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .manager-panel :global(button:not(:disabled)) {
          transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease,
            box-shadow 180ms ease;
        }
        .manager-panel :global(button:not(:disabled):hover) {
          background-color: #d8f3ea;
          border-color: #2f8f7b;
          color: #0a4f3e;
          box-shadow: 0 0 0 2px rgba(15, 110, 86, 0.18);
        }
      `}</style>
    </div>
  );
}
