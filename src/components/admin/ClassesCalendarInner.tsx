'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import plLocale from '@fullcalendar/core/locales/pl';
import type {
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SCHOOL_TIMEZONE } from '@/lib/school-timezone';

export type ClassesCalendarInnerProps = {
  events: EventInput[];
  initialView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  onDatesSet: (arg: DatesSetArg) => void;
  onLessonClick?: (arg: EventClickArg) => void;
};

type HoverTip = {
  eventId: string;
  groupName: string;
  teacherName: string;
  locationName: string;
  timeLabel: string;
  statusLabel: string;
  x: number;
  y: number;
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

function formatTimeRange(start: Date | null, end: Date | null): string {
  if (!start) return '—';
  const startT = start.toLocaleTimeString('pl-PL', {
    timeZone: SCHOOL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!end) return startT;
  const endT = end.toLocaleTimeString('pl-PL', {
    timeZone: SCHOOL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  const day = start.toLocaleDateString('pl-PL', {
    timeZone: SCHOOL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${day}, ${startT} – ${endT}`;
}

function clampTipPosition(x: number, y: number, tipW: number, tipH: number) {
  const pad = 12;
  const maxX = window.innerWidth - tipW - pad;
  const maxY = window.innerHeight - tipH - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

function renderEventContent(arg: EventContentArg) {
  if (arg.event.display === 'background') {
    return true;
  }
  if (arg.event.extendedProps?.isHolidayLabel) {
    const text =
      String(arg.event.extendedProps?.labelText ?? '').trim() ||
      arg.event.title ||
      'Dzień wolny';
    return {
      html: `<div class="classes-fc-holiday-label-body">${escapeHtml(text)}</div>`,
    };
  }
  const groupName =
    (arg.event.extendedProps?.groupName as string | undefined)?.trim() ||
    arg.event.title;
  const timeText = arg.timeText?.trim();

  return (
    <div className="fc-event-main-frame classes-fc-event-body">
      {timeText ? <div className="fc-event-time">{timeText}</div> : null}
      <div className="fc-event-title-container">
        <div className="fc-event-title fc-sticky">{groupName}</div>
      </div>
    </div>
  );
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function ClassesCalendarInner({
  events,
  initialView,
  onDatesSet,
  onLessonClick,
}: ClassesCalendarInnerProps) {
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHideTimer(), []);

  const showTipForEvent = useCallback((event: EventApi, el: HTMLElement) => {
    if (event.display === 'background' || event.extendedProps?.isHolidayLabel) {
      return;
    }
    clearHideTimer();
    const props = event.extendedProps ?? {};
    const rect = el.getBoundingClientRect();
    const preferredX = rect.right + 10;
    const preferredY = rect.top;
    const approxW = 320;
    const approxH = 180;
    const pos = clampTipPosition(preferredX, preferredY, approxW, approxH);

    setHoverTip({
      eventId: event.id,
      groupName:
        (props.groupName as string | undefined)?.trim() ||
        event.title ||
        'Zajęcia',
      teacherName: (props.teacherName as string | null | undefined)?.trim() || '—',
      locationName: (props.locationName as string | null | undefined)?.trim() || '—',
      timeLabel: formatTimeRange(event.start, event.end),
      statusLabel: statusLabelPl(String(props.status ?? 'SCHEDULED')),
      x: pos.x,
      y: pos.y,
    });
  }, []);

  const scheduleHideTip = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setHoverTip(null), 120);
  }, []);

  useEffect(() => {
    if (!hoverTip || !tipRef.current) return;
    const tipRect = tipRef.current.getBoundingClientRect();
    const pos = clampTipPosition(hoverTip.x, hoverTip.y, tipRect.width, tipRect.height);
    if (pos.x !== hoverTip.x || pos.y !== hoverTip.y) {
      setHoverTip((prev) => (prev ? { ...prev, ...pos } : prev));
    }
    // Tylko po pierwszym renderze chmurki — nie w każdym cyklu hoverTip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot clamp
  }, [hoverTip?.eventId]);

  return (
    <div className="classes-fc relative h-[680px] w-full text-sm">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
        initialView={initialView}
        locale={plLocale}
        timeZone={SCHOOL_TIMEZONE}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{
          today: 'Dziś',
          month: 'Miesiąc',
          week: 'Tydzień',
          day: 'Dzień',
        }}
        views={{
          dayGridMonth: { weekends: true },
          timeGridWeek: { weekends: false },
          timeGridDay: { weekends: false },
        }}
        weekends={initialView === 'dayGridMonth'}
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        scrollTime="13:00:00"
        scrollTimeReset={false}
        allDaySlot
        slotEventOverlap={false}
        eventMinHeight={28}
        events={events}
        datesSet={(arg) => {
          const showWeekends = arg.view.type === 'dayGridMonth';
          if (arg.view.calendar.getOption('weekends') !== showWeekends) {
            arg.view.calendar.setOption('weekends', showWeekends);
          }
          onDatesSet(arg);
        }}
        eventClick={(arg) => {
          setHoverTip(null);
          if (!onLessonClick) return;
          if (arg.event.display === 'background') return;
          if (arg.event.extendedProps?.isHolidayLabel) return;
          onLessonClick(arg);
        }}
        eventMouseEnter={(arg) => showTipForEvent(arg.event, arg.el)}
        eventMouseLeave={scheduleHideTip}
        eventContent={renderEventContent}
        eventClassNames={(arg) => {
          if (arg.event.display === 'background') return [];
          if (arg.event.extendedProps?.isHolidayLabel) return ['classes-fc-holiday-label'];
          return ['cursor-pointer', 'classes-fc-lesson'];
        }}
        height="100%"
        nowIndicator
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />

      {hoverTip ? (
        <div
          ref={tipRef}
          role="tooltip"
          className="classes-fc-hover-tip pointer-events-none fixed z-[60] w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-emerald-200 bg-white px-4 py-3.5 shadow-xl"
          style={{ left: hoverTip.x, top: hoverTip.y }}
        >
          <p className="text-base font-semibold leading-snug text-zinc-900">
            {hoverTip.groupName}
          </p>
          <dl className="mt-2.5 space-y-1.5 text-sm leading-snug">
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 text-zinc-500">Kiedy</dt>
              <dd className="min-w-0 capitalize font-medium text-zinc-900">
                {hoverTip.timeLabel}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 text-zinc-500">Prowadzi</dt>
              <dd className="min-w-0 font-semibold text-[#0f6e56]">{hoverTip.teacherName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 text-zinc-500">Lokalizacja</dt>
              <dd className="min-w-0 text-zinc-800">{hoverTip.locationName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[5.5rem] shrink-0 text-zinc-500">Status</dt>
              <dd className="min-w-0 text-zinc-700">{hoverTip.statusLabel}</dd>
            </div>
          </dl>
          <p className="mt-2.5 text-xs text-zinc-500">Kliknij, aby anulować lub napisać do rodziców</p>
        </div>
      ) : null}
    </div>
  );
}
