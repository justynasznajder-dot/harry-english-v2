'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatesSetArg, EventInput } from '@fullcalendar/core';
import type { CalendarApi } from '@fullcalendar/core';
import { visibleRangeToInclusiveYmd } from '@/lib/calendar-range';

const TZ = 'Europe/Warsaw';

const ClassesCalendarInner = dynamic(() => import('./ClassesCalendarInner'), {
  ssr: false,
  loading: () => <div className="min-h-[520px] w-full animate-pulse rounded-xl bg-emerald-50/80" />,
});

export type CalendarLessonRow = {
  id: string;
  group_id: string;
  scheduled_at: string;
  duration_min: number;
  status: string;
  location_id: string;
  teacher_id: string;
  schedule_template_id: string | null;
  group_name: string;
  location_name: string;
  teacher_name: string | null;
};

export type CalendarHolidayRow = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  type: string;
};

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, da] = ymd.split('-').map(Number);
  const d = new Date(y, mo - 1, da + days);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function lessonColors(status: string): { backgroundColor: string; borderColor: string } {
  switch (status) {
    case 'COMPLETED':
      return { backgroundColor: '#6b7280', borderColor: '#4b5563' };
    case 'CANCELLED':
      return { backgroundColor: '#f97316', borderColor: '#c2410c' };
    default:
      return { backgroundColor: '#0d9488', borderColor: '#0f766e' };
  }
}

function lessonTitle(row: CalendarLessonRow): string {
  const t = row.teacher_name ? ` — ${row.teacher_name}` : '';
  const loc = row.location_name?.trim() ? row.location_name : '—';
  return `${row.group_name}${t} · ${loc}`;
}

function buildEventInputs(lessons: CalendarLessonRow[], holidays: CalendarHolidayRow[]): EventInput[] {
  const holidayBg: EventInput[] = holidays.map((h) => ({
    id: `holiday-${h.id}`,
    title: `Dzień wolny: ${h.name}`,
    start: h.date_from,
    end: addDaysYmd(h.date_to, 1),
    allDay: true,
    display: 'background',
    color: 'rgba(250, 204, 21, 0.28)',
  }));

  const lessonEv: EventInput[] = lessons.map((l) => {
    const startMs = new Date(l.scheduled_at).getTime();
    const endMs = startMs + l.duration_min * 60_000;
    const c = lessonColors(l.status);
    return {
      id: l.id,
      title: lessonTitle(l),
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      backgroundColor: c.backgroundColor,
      borderColor: c.borderColor,
      textColor: '#ffffff',
      extendedProps: {
        status: l.status,
        groupName: l.group_name,
      },
    };
  });

  return [...holidayBg, ...lessonEv];
}

type ToastKind = 'success' | 'error';

type ClassesCalendarPanelProps = {
  isActive: boolean;
  refreshSignal: number;
  teachers: Array<{ id: string; first_name: string; last_name: string }>;
  locations: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  pushToast: (kind: ToastKind, message: string) => void;
};

export default function ClassesCalendarPanel({
  isActive,
  refreshSignal,
  teachers,
  locations,
  groups,
  pushToast,
}: ClassesCalendarPanelProps) {
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const [range, setRange] = useState<{ fromYmd: string; toYmd: string } | null>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [selLocations, setSelLocations] = useState<string[]>([]);
  const [selTeachers, setSelTeachers] = useState<string[]>([]);
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [pickDate, setPickDate] = useState('');

  const filterKey = useMemo(
    () => JSON.stringify({ selLocations, selTeachers, selGroups }),
    [selLocations, selTeachers, selGroups],
  );

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    calendarApiRef.current = arg.view.calendar;
    setRange(visibleRangeToInclusiveYmd(arg.start, arg.end, TZ));
  }, []);

  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;

  useEffect(() => {
    if (!isActive || !range) return;
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from: range.fromYmd, to: range.toYmd });
        if (selLocations.length) qs.set('location_ids', selLocations.join(','));
        if (selTeachers.length) qs.set('teacher_ids', selTeachers.join(','));
        if (selGroups.length) qs.set('group_ids', selGroups.join(','));
        const res = await fetch(`/api/admin/lessons?${qs}`, { signal: ac.signal });
        const data = (await res.json().catch(() => ({}))) as {
          lessons?: CalendarLessonRow[];
          holidays?: CalendarHolidayRow[];
          message?: string;
        };
        if (!res.ok) {
          pushToastRef.current('error', data.message ?? 'Nie udało się pobrać kalendarza zajęć');
          if (!cancelled) setEvents([]);
          return;
        }
        const lessons = data.lessons ?? [];
        const holidays = data.holidays ?? [];
        if (!cancelled) setEvents(buildEventInputs(lessons, holidays));
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('ClassesCalendarPanel fetch', e);
        if (!cancelled) {
          pushToastRef.current('error', 'Błąd sieci przy pobieraniu zajęć');
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [isActive, range, filterKey, refreshSignal, selLocations, selTeachers, selGroups]);

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const allIdsSelected = (selected: string[], allIds: string[]) =>
    allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const clearFilters = () => {
    setSelLocations([]);
    setSelTeachers([]);
    setSelGroups([]);
  };

  const goToPickedDate = () => {
    if (!pickDate || !calendarApiRef.current) return;
    calendarApiRef.current.gotoDate(pickDate);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h3 className="text-lg font-semibold text-[#0f6e56]">Zajęcia</h3>
        <p className="text-xs text-zinc-500 md:text-right">
          Strefa czasowa: {TZ}. Żółte tło: dni wolne ze słownika szkoły.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="flex w-full flex-shrink-0 flex-col gap-3 lg:w-64">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900">Filtry</p>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-600">Lokalizacje</p>
                  {locations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = locations.map((l) => l.id);
                        setSelLocations(allIdsSelected(selLocations, ids) ? [] : ids);
                      }}
                      className="shrink-0 text-[11px] font-semibold text-[#0f6e56] underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
                    >
                      {allIdsSelected(
                        selLocations,
                        locations.map((l) => l.id),
                      )
                        ? 'Odznacz wszystkie'
                        : 'Zaznacz wszystkie'}
                    </button>
                  )}
                </div>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-emerald-100 bg-white px-2 py-1.5">
                  {locations.length === 0 ? (
                    <p className="text-xs text-zinc-500">Brak lokalizacji</p>
                  ) : (
                    locations.map((loc) => (
                      <label key={loc.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selLocations.includes(loc.id)}
                          onChange={() => toggleId(selLocations, setSelLocations, loc.id)}
                          className="rounded border-emerald-300 text-emerald-700"
                        />
                        <span className="truncate">{loc.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-600">Nauczyciele</p>
                  {teachers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = teachers.map((t) => t.id);
                        setSelTeachers(allIdsSelected(selTeachers, ids) ? [] : ids);
                      }}
                      className="shrink-0 text-[11px] font-semibold text-[#0f6e56] underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
                    >
                      {allIdsSelected(
                        selTeachers,
                        teachers.map((t) => t.id),
                      )
                        ? 'Odznacz wszystkie'
                        : 'Zaznacz wszystkie'}
                    </button>
                  )}
                </div>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-emerald-100 bg-white px-2 py-1.5">
                  {teachers.length === 0 ? (
                    <p className="text-xs text-zinc-500">Brak nauczycieli</p>
                  ) : (
                    teachers.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selTeachers.includes(t.id)}
                          onChange={() => toggleId(selTeachers, setSelTeachers, t.id)}
                          className="rounded border-emerald-300 text-emerald-700"
                        />
                        <span className="truncate">
                          {t.first_name} {t.last_name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-600">Grupy</p>
                  {groups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = groups.map((g) => g.id);
                        setSelGroups(allIdsSelected(selGroups, ids) ? [] : ids);
                      }}
                      className="shrink-0 text-[11px] font-semibold text-[#0f6e56] underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
                    >
                      {allIdsSelected(
                        selGroups,
                        groups.map((g) => g.id),
                      )
                        ? 'Odznacz wszystkie'
                        : 'Zaznacz wszystkie'}
                    </button>
                  )}
                </div>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-emerald-100 bg-white px-2 py-1.5">
                  {groups.length === 0 ? (
                    <p className="text-xs text-zinc-500">Brak grup</p>
                  ) : (
                    groups.map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selGroups.includes(g.id)}
                          onChange={() => toggleId(selGroups, setSelGroups, g.id)}
                          className="rounded border-emerald-300 text-emerald-700"
                        />
                        <span className="truncate">{g.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="w-full rounded-lg border border-emerald-200 bg-white py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
              >
                Wyczyść filtry
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-zinc-600">Przejdź do daty</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={pickDate}
                onChange={(e) => setPickDate(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-emerald-200 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={goToPickedDate}
                className="rounded-lg bg-[#0f6e56] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Pokaż
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {loading && (
            <p className="mb-2 text-center text-xs text-zinc-500" aria-live="polite">
              Ładowanie…
            </p>
          )}
          <ClassesCalendarInner
            events={events}
            initialView="timeGridWeek"
            onDatesSet={handleDatesSet}
          />
        </div>
      </div>
    </section>
  );
}
