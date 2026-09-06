'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import plLocale from '@fullcalendar/core/locales/pl';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import { SCHOOL_TIMEZONE } from '@/lib/school-timezone';

export type ClassesCalendarInnerProps = {
  events: EventInput[];
  initialView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  onDatesSet: (arg: DatesSetArg) => void;
  onLessonClick?: (arg: EventClickArg) => void;
};

export default function ClassesCalendarInner({
  events,
  initialView,
  onDatesSet,
  onLessonClick,
}: ClassesCalendarInnerProps) {
  return (
    <div className="classes-fc min-h-[520px] w-full text-sm">
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
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        allDaySlot
        events={events}
        datesSet={onDatesSet}
        eventClick={(arg) => {
          if (!onLessonClick) return;
          if (arg.event.display === 'background') return;
          onLessonClick(arg);
        }}
        eventClassNames={(arg) =>
          arg.event.display === 'background' ? [] : ['cursor-pointer']
        }
        height="auto"
        nowIndicator
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
      />
    </div>
  );
}
