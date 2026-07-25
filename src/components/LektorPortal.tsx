'use client';

import { useCallback, useEffect, useState } from 'react';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import TeacherAttendanceTab from '@/src/components/teacher/TeacherAttendanceTab';
import TeacherWeekTab from '@/src/components/teacher/TeacherWeekTab';
import { formatSchoolDateTimeMedium } from '@/lib/school-timezone';

type LektorTab = 'week' | 'attendance' | 'materials' | 'groups' | 'messages';

type TeacherGroup = {
  id: string;
  name: string;
  level: string | null;
  schedule: string;
  students: Array<{ childId: string; firstName: string; lastName: string }>;
};

type TeacherLesson = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
};

type AttendanceRow = {
  childId: string;
  firstName: string;
  lastName: string;
  billedPerLesson?: boolean;
  status: string | null;
  note: string | null;
};

const ATTENDANCE_OPTIONS = [
  { value: 'PRESENT', label: 'Obecny' },
  { value: 'ABSENT', label: 'Nieobecny' },
  { value: 'EXCUSED', label: 'Usprawiedliwiony' },
  { value: 'LATE', label: 'Spóźniony' },
] as const;

const tabs: Array<{ key: LektorTab; label: string }> = [
  { key: 'week', label: 'Plan tygodnia' },
  { key: 'attendance', label: 'Obecność' },
  { key: 'groups', label: 'Moje grupy' },
  { key: 'materials', label: 'Materiały' },
  { key: 'messages', label: 'Wiadomości' },
];

function formatLessonDate(value: string): string {
  return formatSchoolDateTimeMedium(value);
}

export default function LektorPortal() {
  const [activeTab, setActiveTab] = useState<LektorTab>('week');
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);
  const [userId, setUserId] = useState('');
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<TeacherLesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.id) setUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch('/api/teacher/groups', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        groups?: TeacherGroup[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać grup');
        setGroups([]);
        return;
      }
      setGroups(data.groups ?? []);
    } catch {
      setStatusMessage('Błąd wczytywania grup');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadLessons = useCallback(async (groupId: string) => {
    setLessonsLoading(true);
    try {
      const res = await fetch(`/api/teacher/lessons?groupId=${encodeURIComponent(groupId)}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        lessons?: TeacherLesson[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać lekcji');
        setLessons([]);
        return;
      }
      setLessons(data.lessons ?? []);
    } catch {
      setStatusMessage('Błąd wczytywania lekcji');
    } finally {
      setLessonsLoading(false);
    }
  }, []);

  const loadAttendance = useCallback(async (lessonId: string) => {
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/attendance`, { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as {
        attendance?: AttendanceRow[];
        message?: string;
      };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się wczytać obecności');
        setAttendance([]);
        return;
      }
      setAttendance(
        (data.attendance ?? []).map((row) => ({
          ...row,
          billedPerLesson: Boolean(row.billedPerLesson),
          status: row.billedPerLesson ? (row.status ?? 'PRESENT') : row.status,
        })),
      );
    } catch {
      setStatusMessage('Błąd wczytywania obecności');
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'groups') {
      void loadGroups();
    }
  }, [activeTab, loadGroups]);

  useEffect(() => {
    if (selectedGroupId) {
      setSelectedLessonId(null);
      setAttendance([]);
      void loadLessons(selectedGroupId);
    }
  }, [selectedGroupId, loadLessons]);

  useEffect(() => {
    if (selectedLessonId) {
      void loadAttendance(selectedLessonId);
    }
  }, [selectedLessonId, loadAttendance]);

  const saveAttendance = async () => {
    if (!selectedLessonId) return;
    const billable = attendance.filter((row) => row.billedPerLesson);
    if (billable.length === 0) {
      setStatusMessage('Brak dzieci z rozliczeniem za pojedyncze zajęcia do zapisania');
      return;
    }
    setSavingAttendance(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/teacher/lessons/${selectedLessonId}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance: billable.map((row) => ({
            childId: row.childId,
            status: row.status ?? 'PRESENT',
            note: row.note,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setStatusMessage(data.message ?? 'Nie udało się zapisać obecności');
        return;
      }
      setStatusMessage('Obecności zapisane');
    } catch {
      setStatusMessage('Błąd zapisu obecności');
    } finally {
      setSavingAttendance(false);
    }
  };

  return (
    <div className="space-y-4">
      <nav className="no-scrollbar overflow-x-auto rounded-3xl border border-emerald-100 bg-[#f8f6f3] p-2 shadow-xl">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === 'messages' && activeTab === 'messages') {
                  setMessagesListResetToken((t) => t + 1);
                }
                setActiveTab(tab.key);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#175244] text-white'
                  : 'bg-white text-[#1f2933] hover:bg-emerald-50'
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

      {activeTab === 'week' && <TeacherWeekTab />}

      {activeTab === 'attendance' && <TeacherAttendanceTab />}

      {activeTab === 'messages' && (
        <MessagesPanel
          mode="teacher"
          currentUserId={userId || undefined}
          listResetToken={messagesListResetToken}
          onInboxChange={refreshMessagesUnreadCount}
        />
      )}

      {activeTab === 'materials' && (
        <div className="rounded-3xl bg-[#f8f6f3] p-8 shadow-xl">
          <h2 className="mb-6 text-2xl font-bold text-[#1f2933]">Materiały do nauki</h2>
          <p className="text-gray-600">
            Tutaj znajdziesz materiały edukacyjne, ćwiczenia i zasoby do prowadzenia zajęć.
          </p>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="space-y-4 rounded-3xl bg-[#f8f6f3] p-6 shadow-xl md:p-8">
          <h2 className="text-2xl font-bold text-[#1f2933]">Moje grupy</h2>
          {statusMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
              {statusMessage}
            </p>
          )}
          {groupsLoading ? (
            <p className="text-sm text-zinc-600">Wczytywanie grup…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-zinc-600">Brak przypisanych grup.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 rounded-2xl border border-emerald-100 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-800">Grupy</p>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedGroupId === group.id
                        ? 'border-[#0f6e56] bg-emerald-50'
                        : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="font-medium text-zinc-900">{group.name}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {group.students.length} uczniów · {group.schedule}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-2 rounded-2xl border border-emerald-100 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-800">Lekcje</p>
                {!selectedGroupId ? (
                  <p className="text-sm text-zinc-500">Wybierz grupę.</p>
                ) : lessonsLoading ? (
                  <p className="text-sm text-zinc-500">Wczytywanie…</p>
                ) : lessons.length === 0 ? (
                  <p className="text-sm text-zinc-500">Brak lekcji w tej grupie.</p>
                ) : (
                  lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setSelectedLessonId(lesson.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        selectedLessonId === lesson.id
                          ? 'border-[#0f6e56] bg-emerald-50'
                          : 'border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <span className="font-medium text-zinc-900">
                        {formatLessonDate(lesson.scheduledAt)}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {lesson.status === 'COMPLETED' ? 'Zakończona' : 'Zaplanowana'}
                        {lesson.locationName ? ` · ${lesson.locationName}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
                <p className="text-sm font-semibold text-zinc-800">Obecności</p>
                <p className="text-xs text-zinc-500">
                  Obecność oznaczasz tylko u dzieci z rozliczeniem za pojedyncze zajęcia. Pełny
                  widok tygodnia: zakładka „Obecność”.
                </p>
                {!selectedLessonId ? (
                  <p className="text-sm text-zinc-500">Wybierz lekcję.</p>
                ) : attendanceLoading ? (
                  <p className="text-sm text-zinc-500">Wczytywanie…</p>
                ) : attendance.length === 0 ? (
                  <p className="text-sm text-zinc-500">Brak uczniów w grupie.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {attendance.map((row) => (
                        <div
                          key={row.childId}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                            row.billedPerLesson
                              ? 'border-zinc-200'
                              : 'border-zinc-100 bg-zinc-50'
                          }`}
                        >
                          <div>
                            <span className="text-sm font-medium text-zinc-900">
                              {row.firstName} {row.lastName}
                            </span>
                            {!row.billedPerLesson && (
                              <span className="mt-0.5 block text-xs text-zinc-500">
                                Bez oznaczania — inny typ rozliczenia
                              </span>
                            )}
                          </div>
                          {row.billedPerLesson ? (
                            <select
                              className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                              value={row.status ?? 'PRESENT'}
                              onChange={(e) =>
                                setAttendance((prev) =>
                                  prev.map((item) =>
                                    item.childId === row.childId
                                      ? { ...item, status: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {ATTENDANCE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
                              —
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={
                        savingAttendance || !attendance.some((row) => row.billedPerLesson)
                      }
                      onClick={() => void saveAttendance()}
                      className="rounded-xl bg-[#0f6e56] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingAttendance ? 'Zapisywanie…' : 'Zapisz obecności'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
