'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import type { CalendarApi } from '@fullcalendar/core';
import { visibleRangeToInclusiveYmd } from '@/lib/calendar-range';

const TZ = 'Europe/Warsaw';

const ClassesCalendarInner = dynamic(() => import('./ClassesCalendarInner'), {
  ssr: false,
  loading: () => <div className="h-[680px] w-full animate-pulse rounded-xl bg-emerald-50/80" />,
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
  group_ids?: string[];
  applies_to_all_groups?: boolean;
  /** all = pełny dzień wolny (szary); preschool/school/mixed = połowiczny (żółty) */
  scope?: 'all' | 'preschool' | 'school' | 'mixed';
  audience_label?: string | null;
};

function addDaysYmd(ymd: string, days: number): string {
  const [y, mo, da] = ymd.split('-').map(Number);
  const d = new Date(y, mo - 1, da + days);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Stała paleta kolorów lektorów na kalendarzu (kolejność = kolejność na liście filtrów). */
const TEACHER_COLOR_PALETTE: Array<{ backgroundColor: string; borderColor: string }> = [
  { backgroundColor: '#0d9488', borderColor: '#0f766e' }, // teal
  { backgroundColor: '#2563eb', borderColor: '#1d4ed8' }, // blue
  { backgroundColor: '#7c3aed', borderColor: '#6d28d9' }, // violet
  { backgroundColor: '#db2777', borderColor: '#be185d' }, // pink
  { backgroundColor: '#ca8a04', borderColor: '#a16207' }, // yellow
  { backgroundColor: '#059669', borderColor: '#047857' }, // green
  { backgroundColor: '#0891b2', borderColor: '#0e7490' }, // cyan
  { backgroundColor: '#4f46e5', borderColor: '#4338ca' }, // indigo
  { backgroundColor: '#c026d3', borderColor: '#a21caf' }, // fuchsia
  { backgroundColor: '#ea580c', borderColor: '#c2410c' }, // orange
  { backgroundColor: '#0f766e', borderColor: '#115e59' }, // dark teal
  { backgroundColor: '#be123c', borderColor: '#9f1239' }, // rose
];

function teacherColorIndex(teacherId: string, teacherIdsInOrder: string[]): number {
  const idx = teacherIdsInOrder.indexOf(teacherId);
  if (idx >= 0) return idx % TEACHER_COLOR_PALETTE.length;
  let hash = 0;
  for (let i = 0; i < teacherId.length; i++) {
    hash = (hash * 31 + teacherId.charCodeAt(i)) >>> 0;
  }
  return hash % TEACHER_COLOR_PALETTE.length;
}

function colorsForTeacher(
  teacherId: string | null | undefined,
  teacherIdsInOrder: string[],
): { backgroundColor: string; borderColor: string } {
  if (!teacherId) {
    return { backgroundColor: '#64748b', borderColor: '#475569' };
  }
  return TEACHER_COLOR_PALETTE[teacherColorIndex(teacherId, teacherIdsInOrder)];
}

function lessonColors(
  status: string,
  teacherId: string | null | undefined,
  teacherIdsInOrder: string[],
): { backgroundColor: string; borderColor: string } {
  if (status === 'COMPLETED') {
    return { backgroundColor: '#6b7280', borderColor: '#4b5563' };
  }
  if (status === 'CANCELLED') {
    return { backgroundColor: '#f97316', borderColor: '#c2410c' };
  }
  return colorsForTeacher(teacherId, teacherIdsInOrder);
}

function lessonDisplayTitle(row: CalendarLessonRow): string {
  return row.group_name?.trim() || 'Zajęcia';
}

function lessonTooltip(row: CalendarLessonRow): string {
  const parts = [row.group_name?.trim() || 'Zajęcia'];
  const loc = row.location_name?.trim();
  if (loc) parts.push(loc);
  const teacher = row.teacher_name?.trim();
  if (teacher) parts.push(teacher);
  if (row.status && row.status !== 'SCHEDULED') parts.push(row.status);
  return parts.join(' · ');
}

function holidayIsFullDay(h: CalendarHolidayRow): boolean {
  if (String(h.type).toUpperCase() === 'PUBLIC') return true;
  if (h.scope === 'preschool' || h.scope === 'school' || h.scope === 'mixed') return false;
  if (h.scope === 'all') return true;
  if (h.applies_to_all_groups) return true;
  if (!h.group_ids || h.group_ids.length === 0) return true;
  return true;
}

function holidayTitle(h: CalendarHolidayRow): string {
  const audience = h.audience_label?.trim();
  if (audience && !holidayIsFullDay(h)) {
    return `Dzień wolny: ${h.name} · ${audience}`;
  }
  return `Dzień wolny: ${h.name}`;
}

function buildEventInputs(
  lessons: CalendarLessonRow[],
  holidays: CalendarHolidayRow[],
  teacherIdsInOrder: string[],
): EventInput[] {
  const holidayEv: EventInput[] = [];
  const seenLabelKeys = new Set<string>();

  for (const h of holidays) {
    const full = holidayIsFullDay(h);
    const label = holidayTitle(h);
    const end = addDaysYmd(h.date_to, 1);
    holidayEv.push({
      id: `holiday-bg-${h.id}`,
      // Pusty title — inaczej FC czasem dubluje napis obok eventContent.
      title: '',
      start: h.date_from,
      end,
      allDay: true,
      display: 'background',
      color: full ? 'rgba(161, 161, 170, 0.42)' : 'rgba(250, 204, 21, 0.28)',
      extendedProps: {
        isHoliday: true,
        holidayScope: full ? 'all' : h.scope ?? 'mixed',
        audienceLabel: h.audience_label ?? null,
      },
    });

    const labelKey = `${h.date_from}|${h.date_to}|${label}`;
    if (seenLabelKeys.has(labelKey)) continue;
    seenLabelKeys.add(labelKey);

    holidayEv.push({
      id: `holiday-label-${h.id}`,
      title: '',
      start: h.date_from,
      end,
      allDay: true,
      display: 'block',
      classNames: ['classes-fc-holiday-label'],
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      textColor: full ? '#3f3f46' : '#854d0e',
      editable: false,
      extendedProps: {
        isHolidayLabel: true,
        holidayScope: full ? 'all' : h.scope ?? 'mixed',
        audienceLabel: h.audience_label ?? null,
        labelText: label,
        tooltip: label,
      },
    });
  }

  const lessonEv: EventInput[] = lessons.map((l) => {
    const startMs = new Date(l.scheduled_at).getTime();
    const endMs = startMs + l.duration_min * 60_000;
    const c = lessonColors(l.status, l.teacher_id, teacherIdsInOrder);
    return {
      id: l.id,
      title: lessonDisplayTitle(l),
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      backgroundColor: c.backgroundColor,
      borderColor: c.borderColor,
      textColor: '#ffffff',
      extendedProps: {
        status: l.status,
        groupName: lessonDisplayTitle(l),
        teacherName: l.teacher_name?.trim() || null,
        locationName: l.location_name?.trim() || null,
        durationMin: l.duration_min,
        tooltip: lessonTooltip(l),
        teacherId: l.teacher_id,
      },
    };
  });

  return [...holidayEv, ...lessonEv];
}

type LessonDetailPopup = {
  id: string;
  groupName: string;
  teacherName: string;
  locationName: string;
  whenLabel: string;
  timeRangeLabel: string;
  status: string;
  durationMin: number;
};

function statusLabelPl(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'zakończone';
    case 'CANCELLED':
      return 'anulowane';
    default:
      return 'zaplanowane';
  }
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
  const filtersReadyRef = useRef(false);
  const knownLocationIdsRef = useRef<Set<string>>(new Set());
  const knownTeacherIdsRef = useRef<Set<string>>(new Set());
  const knownGroupIdsRef = useRef<Set<string>>(new Set());
  const [range, setRange] = useState<{ fromYmd: string; toYmd: string } | null>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [selLocations, setSelLocations] = useState<string[]>([]);
  const [selTeachers, setSelTeachers] = useState<string[]>([]);
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [pickDate, setPickDate] = useState('');
  const [localRefresh, setLocalRefresh] = useState(0);
  const [lessonPopup, setLessonPopup] = useState<LessonDetailPopup | null>(null);
  const [cancelLessonParentMessage, setCancelLessonParentMessage] = useState('');
  const [cancelLessonBusy, setCancelLessonBusy] = useState(false);

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
    const locIds = locations.map((l) => l.id);
    const teacherIds = teachers.map((t) => t.id);
    const groupIds = groups.map((g) => g.id);

    if (!filtersReadyRef.current) {
      if (locIds.length === 0 && teacherIds.length === 0 && groupIds.length === 0) return;
      setSelLocations(locIds);
      setSelTeachers(teacherIds);
      setSelGroups(groupIds);
      knownLocationIdsRef.current = new Set(locIds);
      knownTeacherIdsRef.current = new Set(teacherIds);
      knownGroupIdsRef.current = new Set(groupIds);
      filtersReadyRef.current = true;
      return;
    }

    // Usuń zniknięte ID; nowo pojawiające się zaznaczaj — nie nadpisuj pustego wyboru użytkownika.
    setSelLocations((prev) => {
      const kept = prev.filter((id) => locIds.includes(id));
      const added = locIds.filter((id) => !knownLocationIdsRef.current.has(id));
      knownLocationIdsRef.current = new Set(locIds);
      return [...new Set([...kept, ...added])];
    });
    setSelTeachers((prev) => {
      const kept = prev.filter((id) => teacherIds.includes(id));
      const added = teacherIds.filter((id) => !knownTeacherIdsRef.current.has(id));
      knownTeacherIdsRef.current = new Set(teacherIds);
      return [...new Set([...kept, ...added])];
    });
    setSelGroups((prev) => {
      const kept = prev.filter((id) => groupIds.includes(id));
      const added = groupIds.filter((id) => !knownGroupIdsRef.current.has(id));
      knownGroupIdsRef.current = new Set(groupIds);
      return [...new Set([...kept, ...added])];
    });
  }, [locations, teachers, groups]);

  const teacherIdsInOrder = useMemo(() => teachers.map((t) => t.id), [teachers]);

  useEffect(() => {
    if (!isActive || !range) return;
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from: range.fromYmd, to: range.toYmd });
        // Wysyłaj parametry zawsze gdy lista filtrów istnieje — pusta lista = brak zajęć
        // (API: obecność klucza + pusta wartość → FALSE). Brak klucza = bez filtra.
        if (locations.length > 0) qs.set('location_ids', selLocations.join(','));
        if (teachers.length > 0) qs.set('teacher_ids', selTeachers.join(','));
        if (groups.length > 0) qs.set('group_ids', selGroups.join(','));
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
        if (!cancelled) setEvents(buildEventInputs(lessons, holidays, teacherIdsInOrder));
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
  }, [
    isActive,
    range,
    filterKey,
    refreshSignal,
    localRefresh,
    selLocations,
    selTeachers,
    selGroups,
    locations.length,
    teachers.length,
    groups.length,
    teacherIdsInOrder,
  ]);

  const handleLessonClick = useCallback((arg: EventClickArg) => {
    const id = arg.event.id;
    if (!id || id.startsWith('holiday-') || arg.event.extendedProps?.isHolidayLabel) return;

    const props = arg.event.extendedProps ?? {};
    const status = String(props.status ?? 'SCHEDULED');
    const start = arg.event.start;
    const end = arg.event.end;
    const whenLabel = start
      ? start.toLocaleString('pl-PL', {
          timeZone: TZ,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '—';
    const timeRangeLabel = (() => {
      if (!start) return '—';
      const startT = start.toLocaleTimeString('pl-PL', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
      });
      if (!end) return startT;
      const endT = end.toLocaleTimeString('pl-PL', {
        timeZone: TZ,
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${startT} – ${endT}`;
    })();

    setCancelLessonParentMessage('');
    setLessonPopup({
      id,
      groupName:
        (props.groupName as string | undefined)?.trim() ||
        arg.event.title ||
        'Zajęcia',
      teacherName: (props.teacherName as string | null | undefined)?.trim() || '—',
      locationName: (props.locationName as string | null | undefined)?.trim() || '—',
      whenLabel,
      timeRangeLabel,
      status,
      durationMin: Number(props.durationMin) || 0,
    });
  }, []);

  const closeLessonPopup = () => {
    setLessonPopup(null);
    setCancelLessonParentMessage('');
  };

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const allIdsSelected = (selected: string[], allIds: string[]) =>
    allIds.length > 0 && allIds.every((id) => selected.includes(id));

  const clearFilters = () => {
    setSelLocations(locations.map((l) => l.id));
    setSelTeachers(teachers.map((t) => t.id));
    setSelGroups(groups.map((g) => g.id));
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
          Strefa czasowa: {TZ}. Kolory bloków = lektorzy. Szare zakończone, pomarańczowe anulowane.
          Tło: weekendy/święta (szare) oraz dni wolne szkoła/przedszkole (żółte).
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
                    teachers.map((t, i) => {
                      const color =
                        TEACHER_COLOR_PALETTE[i % TEACHER_COLOR_PALETTE.length];
                      return (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={selTeachers.includes(t.id)}
                            onChange={() => toggleId(selTeachers, setSelTeachers, t.id)}
                            className="rounded border-emerald-300 text-emerald-700"
                          />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color.backgroundColor }}
                            aria-hidden
                          />
                          <span className="truncate">
                            {t.first_name} {t.last_name}
                          </span>
                        </label>
                      );
                    })
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
            onLessonClick={handleLessonClick}
          />
        </div>
      </div>

      {lessonPopup && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !cancelLessonBusy) closeLessonPopup();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lesson-popup-title"
            className="w-full max-w-lg rounded-2xl border border-emerald-100 bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="lesson-popup-title" className="text-lg font-semibold text-zinc-900">
                  Szczegóły zajęć
                </h3>
                <p className="mt-1 text-base font-semibold leading-snug text-[#0f6e56]">
                  {lessonPopup.groupName}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                disabled={cancelLessonBusy}
                onClick={closeLessonPopup}
                aria-label="Zamknij"
              >
                ✕
              </button>
            </div>

            <dl className="mt-4 space-y-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3.5 text-[15px] leading-snug">
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-zinc-500">Kiedy</dt>
                <dd className="min-w-0 capitalize text-zinc-900">
                  {lessonPopup.whenLabel}
                  <span className="mt-1 block text-base font-semibold normal-case text-zinc-800">
                    {lessonPopup.timeRangeLabel}
                    {lessonPopup.durationMin > 0 ? (
                      <span className="font-normal text-zinc-500">
                        {' '}
                        · {lessonPopup.durationMin} min
                      </span>
                    ) : null}
                  </span>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-zinc-500">Prowadzi</dt>
                <dd className="min-w-0 text-base font-semibold text-zinc-900">
                  {lessonPopup.teacherName}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-zinc-500">Lokalizacja</dt>
                <dd className="min-w-0 text-zinc-900">{lessonPopup.locationName}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-zinc-500">Status</dt>
                <dd className="min-w-0">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-sm font-semibold ${
                      lessonPopup.status === 'COMPLETED'
                        ? 'bg-zinc-200 text-zinc-700'
                        : lessonPopup.status === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {statusLabelPl(lessonPopup.status)}
                  </span>
                </dd>
              </div>
            </dl>

            {lessonPopup.status === 'SCHEDULED' ? (
              <>
                <div className="mt-4 border-t border-emerald-100 pt-3">
                  <p className="text-sm font-semibold text-zinc-800">Anuluj zajęcia</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Rodzice dostaną wiadomość w panelu i e-mail. System doda kolejny termin w
                    harmonogramie grupy, jeśli jest wolny slot do końca roku.
                  </p>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block font-medium text-zinc-700">
                      Wiadomość do rodziców
                    </span>
                    <span className="mb-1.5 block text-xs text-zinc-500">
                      Opcjonalnie. Puste pole = domyślny tekst powiadomienia.
                    </span>
                    <textarea
                      className="min-h-[88px] w-full rounded-xl border border-emerald-200 px-3 py-2 text-sm"
                      value={cancelLessonParentMessage}
                      onChange={(e) => setCancelLessonParentMessage(e.target.value)}
                      placeholder="Np. Zajęcia odbędą się w innym terminie — informacja wkrótce."
                      disabled={cancelLessonBusy}
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={cancelLessonBusy}
                    onClick={closeLessonPopup}
                  >
                    Zamknij
                  </button>
                  <button
                    type="button"
                    disabled={cancelLessonBusy}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={async () => {
                      setCancelLessonBusy(true);
                      try {
                        const res = await fetch(
                          `/api/admin/lessons/${lessonPopup.id}/cancel`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              parent_message: cancelLessonParentMessage.trim() || undefined,
                            }),
                          },
                        );
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          pushToast('error', data.message ?? 'Nie udało się anulować zajęć');
                          return;
                        }
                        pushToast('success', data.message ?? 'Zajęcia anulowane');
                        closeLessonPopup();
                        setLocalRefresh((s) => s + 1);
                      } catch {
                        pushToast('error', 'Nie udało się anulować zajęć');
                      } finally {
                        setCancelLessonBusy(false);
                      }
                    }}
                  >
                    {cancelLessonBusy ? 'Anulowanie…' : 'Anuluj i powiadom rodziców'}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-semibold"
                  onClick={closeLessonPopup}
                >
                  Zamknij
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
