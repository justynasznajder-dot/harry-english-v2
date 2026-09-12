'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatSchoolDateTimeMedium,
  formatSchoolTime,
  schoolYmd,
  todayYmdSchool,
} from '@/lib/school-timezone';
import { addDaysYmd, mondayOfWeekContaining } from '@/lib/week-ymd';
import AttendanceToggleButtons from '@/src/components/teacher/AttendanceToggleButtons';

type WeekLesson = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  groupId: string;
  groupName: string;
  locationName: string | null;
};

type AttendanceRow = {
  childId: string;
  firstName: string;
  lastName: string;
  confirmed?: boolean;
  billedPerLesson: boolean;
  status: string | null;
  note: string | null;
};

function weekLabel(mondayYmd: string): string {
  const sundayYmd = addDaysYmd(mondayYmd, 6);
  const start = new Date(`${mondayYmd}T12:00:00`);
  const end = new Date(`${sundayYmd}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = start.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: sameMonth && sameYear ? undefined : 'long',
    year: sameYear ? undefined : 'numeric',
  });
  const endFmt = end.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startFmt} – ${endFmt}`;
}

function lessonStatusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Zakończona';
  if (status === 'CANCELLED') return 'Anulowana';
  return 'Zaplanowana';
}

export default function TeacherAttendanceTab() {
  const [weekMonday, setWeekMonday] = useState(() =>
    mondayOfWeekContaining(todayYmdSchool()),
  );
  const [lessons, setLessons] = useState<WeekLesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingChildId, setSavingChildId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDaysYmd(weekMonday, 6), [weekMonday]);
  const todayYmd = todayYmdSchool();
  const currentWeekMonday = mondayOfWeekContaining(todayYmd);
  const isCurrentWeek = weekMonday === currentWeekMonday;

  const loadLessons = useCallback(async () => {
    setLessonsLoading(true);
    setLessonsError(null);
    try {
      const qs = new URLSearchParams({ from: weekMonday, to: weekEnd });
      const res = await fetch(`/api/teacher/lessons?${qs.toString()}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        lessons?: WeekLesson[];
        message?: string;
      };
      if (!res.ok) {
        setLessonsError(data.message ?? 'Nie udało się wczytać lekcji');
        setLessons([]);
        return;
      }
      const next = (data.lessons ?? []).filter((l) => l.status !== 'CANCELLED');
      setLessons(next);
    } catch {
      setLessonsError('Błąd połączenia z serwerem');
      setLessons([]);
    } finally {
      setLessonsLoading(false);
    }
  }, [weekMonday, weekEnd]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    setSelectedLessonId(null);
    setAttendance([]);
    setStatusMessage(null);
  }, [weekMonday]);

  useEffect(() => {
    if (!selectedLessonId) return;
    if (!lessons.some((l) => l.id === selectedLessonId)) {
      setSelectedLessonId(null);
      setAttendance([]);
    }
  }, [lessons, selectedLessonId]);

  const loadAttendance = useCallback(async (lessonId: string) => {
    setAttendanceLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/attendance`, {
        cache: 'no-store',
      });
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
          // PER_LESSON: bez domyślnego PRESENT — null dopóki lektor nie wybierze.
          status: row.billedPerLesson
            ? row.status
            : (row.status ?? 'PRESENT'),
        })),
      );
    } catch {
      setStatusMessage('Błąd wczytywania obecności');
      setAttendance([]);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLessonId) {
      void loadAttendance(selectedLessonId);
    }
  }, [selectedLessonId, loadAttendance]);

  const unmarkedBillable = useMemo(
    () => attendance.filter((row) => row.billedPerLesson && !row.status),
    [attendance],
  );

  const markAttendance = async (childId: string, status: 'PRESENT' | 'ABSENT') => {
    if (!selectedLessonId || savingChildId === childId) return;
    const row = attendance.find((item) => item.childId === childId);
    if (!row || row.status === status) return;

    const previousStatus = row.status;
    setAttendance((prev) =>
      prev.map((item) => (item.childId === childId ? { ...item, status } : item)),
    );
    setSavingChildId(childId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/teacher/lessons/${selectedLessonId}/attendance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance: [
            {
              childId,
              status,
              note: row.note,
            },
          ],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setAttendance((prev) =>
          prev.map((item) =>
            item.childId === childId ? { ...item, status: previousStatus } : item,
          ),
        );
        setStatusMessage(data.message ?? 'Nie udało się zapisać obecności');
      }
    } catch {
      setAttendance((prev) =>
        prev.map((item) =>
          item.childId === childId ? { ...item, status: previousStatus } : item,
        ),
      );
      setStatusMessage('Błąd zapisu obecności');
    } finally {
      setSavingChildId((current) => (current === childId ? null : current));
    }
  };

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, WeekLesson[]>();
    for (const lesson of lessons) {
      const key = schoolYmd(lesson.scheduledAt);
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }
    return map;
  }, [lessons]);

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) ?? null;

  return (
    <div className="space-y-4 rounded-3xl bg-[#f8f6f3] p-6 shadow-xl md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#1f2933]">Obecność</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Kliknij ✓ (obecny) lub ✕ (nieobecny) — zapisuje się od razu. Dzieci z umową
            miesięczną/roczną są domyślnie obecne. Za pojedyncze zajęcia oznacz obowiązkowo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekMonday((m) => addDaysYmd(m, -7))}
            className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#175244] hover:bg-emerald-50"
          >
            ← Poprzedni
          </button>
          <span className="min-w-[11rem] text-center text-sm font-semibold capitalize text-zinc-800">
            {weekLabel(weekMonday)}
          </span>
          <button
            type="button"
            onClick={() => setWeekMonday((m) => addDaysYmd(m, 7))}
            className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#175244] hover:bg-emerald-50"
          >
            Następny →
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekMonday(currentWeekMonday)}
              className="rounded-full bg-[#175244] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0f6e56]"
            >
              Bieżący tydzień
            </button>
          )}
        </div>
      </header>

      {statusMessage && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {statusMessage}
        </p>
      )}
      {lessonsError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {lessonsError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-2xl border border-emerald-100 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-800">Zajęcia w tygodniu</p>
          {lessonsLoading ? (
            <p className="text-sm text-zinc-500">Wczytywanie…</p>
          ) : lessons.length === 0 ? (
            <p className="text-sm text-zinc-500">Brak zajęć w tym tygodniu.</p>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {[...lessonsByDay.entries()].map(([ymd, dayLessons]) => (
                <div key={ymd}>
                  <p
                    className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
                      ymd === todayYmd ? 'text-[#0f6e56]' : 'text-zinc-500'
                    }`}
                  >
                    {new Date(`${ymd}T12:00:00`).toLocaleDateString('pl-PL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })}
                    {ymd === todayYmd ? ' · dziś' : ''}
                  </p>
                  <div className="space-y-1.5">
                    {dayLessons.map((lesson) => (
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
                          {formatSchoolTime(lesson.scheduledAt)} · {lesson.groupName}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {lessonStatusLabel(lesson.status)}
                          {lesson.locationName ? ` · ${lesson.locationName}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Lista uczniów</p>
            {selectedLesson && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {formatSchoolDateTimeMedium(selectedLesson.scheduledAt)} ·{' '}
                {selectedLesson.groupName}
              </p>
            )}
          </div>

          {!selectedLessonId ? (
            <p className="text-sm text-zinc-500">Wybierz zajęcia z listy po lewej.</p>
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
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                      row.billedPerLesson && !row.status
                        ? 'border-amber-300 bg-amber-50/70'
                        : 'border-zinc-200 bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-zinc-900">
                        {row.firstName} {row.lastName}
                      </span>
                      {row.confirmed === false ? (
                        <span className="mt-0.5 block text-xs font-semibold text-amber-800">
                          Niepotwierdzony (brak podpisanej umowy)
                        </span>
                      ) : null}
                      {row.billedPerLesson ? (
                        <span className="mt-0.5 block text-xs text-amber-800">
                          Za pojedyncze zajęcia — oznacz obowiązkowo
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-xs text-emerald-700">
                          Domyślnie obecny
                        </span>
                      )}
                    </div>
                    <AttendanceToggleButtons
                      status={row.status}
                      disabled={savingChildId === row.childId}
                      onSelect={(status) => void markAttendance(row.childId, status)}
                    />
                  </div>
                ))}
              </div>
              {unmarkedBillable.length > 0 ? (
                <p className="text-xs text-amber-800">
                  Oznacz obecność u {unmarkedBillable.length}{' '}
                  {unmarkedBillable.length === 1 ? 'dziecka' : 'dzieci'} z rozliczeniem za zajęcia.
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
