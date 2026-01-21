import { useMemo, memo } from 'react';
import { useCalendarContext } from '../../../Calendar';
import { isSameDay } from 'date-fns';
import { hours } from './CalendarBodyMarginDayMargin';
import { type CalendarEvent as CalendarEventType } from '../../types';
import CalendarBodyHeader from '../CalendarBodyHeader';
import CalendarEvent from '../../CalendarEvent';

const CalendarBodyDayContent = memo(function CalendarBodyDayContent({
  date,
  hideHeader = false,
}: {
  date: Date;
  hideHeader?: boolean;
}) {
  const { events, mode } = useCalendarContext();

  // Memoize event filtering for performance - only recalculate when events, date, or mode changes
  // Filter events for this day - ERROR-PROOF: Only show events that actually occur on this day
  // For week view: Only show events on the day they START (prevents duplication)
  // For day view: Show events that start OR span this day
  const dayEvents = useMemo(() => {
    // Normalize target day once
    const targetDay = new Date(date);
    targetDay.setHours(0, 0, 0, 0);
    const targetDayTime = targetDay.getTime();
    
    return events.filter((event: CalendarEventType) => {
      // Normalize dates to start of day for comparison
      const eventStartDay = new Date(event.start);
      eventStartDay.setHours(0, 0, 0, 0);
      const eventEndDay = new Date(event.end);
      eventEndDay.setHours(0, 0, 0, 0);
      
      // Primary check: Event starts on this day
      const startsOnDay = eventStartDay.getTime() === targetDayTime;
      
      // For week view: ONLY show events that start on this day (prevents duplication)
      if (mode === 'week') {
        return startsOnDay;
      }
      
      // For day view: Show events that start, end, or span this day
      const endsOnDay = eventEndDay.getTime() === targetDayTime;
      
      // Event spans this day if it starts before this day AND ends after this day
      const spansDay = eventStartDay.getTime() < targetDayTime && 
                        eventEndDay.getTime() > targetDayTime;
      
      const matches = startsOnDay || endsOnDay || spansDay;
      
      return matches;
    });
  }, [events, date, mode]);

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
});

export default CalendarBodyDayContent;
