import { useCalendarContext } from '../../../Calendar';
import { isSameDay } from 'date-fns';
import { hours } from './CalendarBodyMarginDayMargin';
import { type CalendarEvent as CalendarEventType } from '../../types';
import CalendarBodyHeader from '../CalendarBodyHeader';
import CalendarEvent from '../../CalendarEvent';

export default function CalendarBodyDayContent({
  date,
  hideHeader = false,
}: {
  date: Date;
  hideHeader?: boolean;
}) {
  const { events, mode } = useCalendarContext();

  // Debug logging
  console.log('🔍 CalendarBodyDayContent Debug:', {
    mode,
    date: date.toISOString(),
    dateFormatted: date.toLocaleDateString(),
    totalEvents: events.length,
    events: events.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      startDate: e.start.toLocaleDateString(),
      endDate: e.end.toLocaleDateString(),
    })),
  });

  // Filter events for this day - check if event starts on this day OR spans across this day
  const dayEvents = events.filter((event: CalendarEventType) => {
    // Normalize dates to start of day for comparison
    const eventStartDay = new Date(event.start);
    eventStartDay.setHours(0, 0, 0, 0);
    const eventEndDay = new Date(event.end);
    eventEndDay.setHours(0, 0, 0, 0);
    const targetDay = new Date(date);
    targetDay.setHours(0, 0, 0, 0);
    
    // Check if event starts on this day
    const startsOnDay = eventStartDay.getTime() === targetDay.getTime();
    // Check if event ends on this day (for events that span multiple days)
    const endsOnDay = eventEndDay.getTime() === targetDay.getTime();
    // Check if event spans across this day (starts before and ends after)
    const spansDay = event.start <= new Date(targetDay.getTime() + 24 * 60 * 60 * 1000 - 1) && 
                      event.end >= targetDay;
    
    const matches = startsOnDay || endsOnDay || spansDay;
    
    if (mode === 'day') {
      console.log(`📅 Event "${event.title}":`, {
        eventStart: event.start.toISOString(),
        eventEnd: event.end.toISOString(),
        eventStartDay: eventStartDay.toISOString(),
        eventEndDay: eventEndDay.toISOString(),
        targetDay: targetDay.toISOString(),
        startsOnDay,
        endsOnDay,
        spansDay,
        matches,
      });
    }
    
    return matches;
  });

  console.log('✅ Filtered dayEvents:', {
    count: dayEvents.length,
    events: dayEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
    })),
  });

  return (
    <div className="flex flex-col flex-grow">
      {/* Only show header in day mode, hide in week mode */}
      {!hideHeader && mode !== 'week' && <CalendarBodyHeader date={date} />}

      <div className="flex-1 relative">
        {/* Hour grid lines - responsive height */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="h-20 sm:h-24 lg:h-32 border-b border-border/50 group"
          />
        ))}

        {/* Events positioned absolutely */}
        <div className="absolute inset-0">
          {dayEvents.map((event: CalendarEventType) => (
            <CalendarEvent key={event.id} event={event} />
          ))}
        </div>
      </div>
    </div>
  );
}
