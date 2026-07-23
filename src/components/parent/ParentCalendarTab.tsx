'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';
import { formatLessonDateTime } from '@/src/components/parent/parent-portal-utils';
import { formatSchoolTime, schoolYmd } from '@/lib/school-timezone';

type CalendarLesson = {
  id: string;
  childId: string;
  childFirstName: string;
  childLastName: string;
  groupName: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  locationName: string | null;
};

type CalendarHoliday = {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  type: string | null;
};

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function weekdayMonFirst(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 6 : w - 1;
}

export default function ParentCalendarTab({ userInfo }: { userInfo: UserInfo }) {
  const children = userInfo.children ?? [];
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [selectedChildId, setSelectedChildId] = useState('all');
  const [lessons, setLessons] = useState<CalendarLesson[]>([]);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = toYmd(cursor);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const to = toYmd(last);
    return { from, to };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (selectedChildId !== 'all') qs.set('childId', selectedChildId);
      const r = await fetch(`/api/parent/calendar?${qs.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await r.json().catch(() => ({}))) as {
        lessons?: CalendarLesson[];
        holidays?: CalendarHoliday[];
        message?: string;
      };
      if (!r.ok) {
        setError(data.message ?? 'Nie udało się pobrać kalendarza');
        setLessons([]);
        setHolidays([]);
        return;
      }
      setLessons(data.lessons ?? []);
      setHolidays(data.holidays ?? []);
    } catch {
      setError('Błąd połączenia z serwerem');
      setLessons([]);
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, selectedChildId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, CalendarLesson[]>();
    for (const l of lessons) {
      const key = schoolYmd(l.scheduledAt);
      const list = map.get(key) ?? [];
      list.push(l);
      map.set(key, list);
    }
    return map;
  }, [lessons]);

  const holidayDays = useMemo(() => {
    const set = new Set<string>();
    for (const h of holidays) {
      const start = new Date(`${h.dateFrom}T12:00:00`);
      const end = new Date(`${h.dateTo}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(toYmd(d));
      }
    }
    return set;
  }, [holidays]);

  const totalDays = daysInMonth(cursor);
  const offset = weekdayMonFirst(cursor);
  const cells: Array<{ day: number | null; ymd: string | null }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, ymd: null });
  for (let day = 1; day <= totalDays; day++) {
    const ymd = toYmd(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    cells.push({ day, ymd });
  }

  return (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Kalendarz zajęć</h2>
          <p className="mt-1 text-sm text-zinc-600">Widok miesięczny z anulowanymi lekcjami i dniami wolnymi.</p>
        </div>
        {children.length > 1 ? (
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="all">Wszystkie dzieci</option>
            {children.map((c) => (
              <option key={c.childId ?? c.firstName} value={c.childId ?? ''}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-800"
        >
          ← Poprzedni
        </button>
        <p className="text-sm font-semibold capitalize text-zinc-900">{monthLabel(cursor)}</p>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-800"
        >
          Następny →
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600">Ładowanie…</p>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-500">
            {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (!cell.day || !cell.ymd) {
                return <div key={`empty-${idx}`} className="min-h-16 rounded-lg bg-zinc-50/50" />;
              }
              const dayLessons = lessonsByDay.get(cell.ymd) ?? [];
              const isHoliday = holidayDays.has(cell.ymd);
              const hasCancelled = dayLessons.some((l) => l.status === 'CANCELLED');
              const hasScheduled = dayLessons.some((l) => l.status === 'SCHEDULED');

              return (
                <div
                  key={cell.ymd}
                  className={`min-h-16 rounded-lg border p-1 text-left ${
                    isHoliday
                      ? 'border-sky-200 bg-sky-50'
                      : hasCancelled
                        ? 'border-rose-200 bg-rose-50/60'
                        : hasScheduled
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-zinc-100 bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-800">{cell.day}</div>
                  {isHoliday ? (
                    <div className="mt-0.5 text-[10px] leading-tight text-sky-800">Wolne</div>
                  ) : null}
                  {dayLessons.slice(0, 2).map((l) => (
                    <div
                      key={l.id}
                      className={`mt-0.5 truncate text-[10px] leading-tight ${
                        l.status === 'CANCELLED' ? 'text-rose-700 line-through' : 'text-emerald-800'
                      }`}
                      title={formatLessonDateTime(l.scheduledAt)}
                    >
                      {formatSchoolTime(l.scheduledAt)}{' '}
                      {l.childFirstName.charAt(0)}.
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {holidays.length > 0 ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">Dni wolne w tym miesiącu</p>
              <ul className="mt-1 list-inside list-disc">
                {holidays.map((h) => (
                  <li key={h.id}>
                    {h.name} ({h.dateFrom}
                    {h.dateTo !== h.dateFrom ? ` – ${h.dateTo}` : ''})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
