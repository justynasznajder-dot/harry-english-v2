'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import plLocale from '@fullcalendar/core/locales/pl';
import type { DatesSetArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import { SCHOOL_TIMEZONE } from '@/lib/school-timezone';

export type ClassesCalendarInnerProps = {
  events: EventInput[];
  initialView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  onDatesSet: (arg: DatesSetArg) => void;
  onLessonClick?: (arg: EventClickArg) => void;
};

function renderEventContent(arg: EventContentArg) {
  if (arg.event.display === 'background') {
    return true;
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

export default function ClassesCalendarInner({
  events,
  initialView,
  onDatesSet,
  onLessonClick,
}: ClassesCalendarInnerProps) {
  return (
    <div className="classes-fc h-[680px] w-full text-sm">
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
          if (!onLessonClick) return;
          if (arg.event.display === 'background') return;
          onLessonClick(arg);
        }}
        eventContent={renderEventContent}
        eventDidMount={(info) => {
          if (info.event.display === 'background') return;
          const tip = info.event.extendedProps?.tooltip as string | undefined;
          if (tip) info.el.setAttribute('title', tip);
        }}
        eventClassNames={(arg) =>
          arg.event.display === 'background' ? [] : ['cursor-pointer', 'classes-fc-lesson']
        }
        height="100%"
        nowIndicator
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />
    </div>
  );
}
