'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatSchoolTime,
  schoolYmd,
  todayYmdSchool,
} from '@/lib/school-timezone';
import { addDaysYmd, mondayOfWeekContaining } from '@/lib/week-ymd';

type WeekLesson = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  groupId: string;
  groupName: string;
  locationName: string | null;
};

const WEEKDAY_LABELS = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
] as const;

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

function dayHeaderLabel(ymd: string, weekdayIndex: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  const datePart = d.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
  return `${WEEKDAY_LABELS[weekdayIndex]} · ${datePart}`;
}

function statusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Zakończona';
  if (status === 'CANCELLED') return 'Anulowana';
  return 'Zaplanowana';
}

function statusClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'CANCELLED') return 'bg-zinc-100 text-zinc-600 line-through';
  return 'bg-sky-50 text-sky-900';
}

export default function TeacherWeekTab() {
  const [weekMonday, setWeekMonday] = useState(() =>
    mondayOfWeekContaining(todayYmdSchool()),
  );
  const [lessons, setLessons] = useState<WeekLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDaysYmd(weekMonday, 6), [weekMonday]);
  const todayYmd = todayYmdSchool();
  const currentWeekMonday = mondayOfWeekContaining(todayYmd);
  const isCurrentWeek = weekMonday === currentWeekMonday;

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        index: i,
        ymd: addDaysYmd(weekMonday, i),
      })),
    [weekMonday],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        setError(data.message ?? 'Nie udało się wczytać planu tygodnia');
        setLessons([]);
        return;
      }
      setLessons(data.lessons ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, [weekMonday, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-4 rounded-3xl bg-[#f8f6f3] p-6 shadow-xl md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#1f2933]">Plan tygodnia</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Podgląd zajęć we wszystkich Twoich grupach. Domyślnie bieżący tydzień —
            możesz wrócić do wcześniejszych.
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

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-600">Wczytywanie planu…</p>
      ) : (
        <div className="space-y-3">
          {days.map(({ index, ymd }) => {
            const dayLessons = lessonsByDay.get(ymd) ?? [];
            const isToday = ymd === todayYmd;
            return (
              <section
                key={ymd}
                className={`rounded-2xl border bg-white p-4 ${
                  isToday ? 'border-[#0f6e56] shadow-sm' : 'border-emerald-100'
                }`}
              >
                <h3
                  className={`text-sm font-semibold ${
                    isToday ? 'text-[#0f6e56]' : 'text-zinc-800'
                  }`}
                >
                  {dayHeaderLabel(ymd, index)}
                  {isToday ? ' · dziś' : ''}
                </h3>
                {dayLessons.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Brak zajęć</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {dayLessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className={`rounded-xl border border-zinc-100 px-3 py-2 ${statusClass(lesson.status)}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold">
                            {formatSchoolTime(lesson.scheduledAt)}
                            <span className="ml-2 font-medium">{lesson.groupName}</span>
                          </span>
                          <span className="text-xs opacity-80">
                            {statusLabel(lesson.status)} · {lesson.durationMin} min
                          </span>
                        </div>
                        {lesson.locationName && (
                          <p className="mt-0.5 text-xs opacity-80">{lesson.locationName}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
