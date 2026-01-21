import { useRef, useMemo } from 'react';
import { useCalendarContext } from '../../../Calendar';
import { startOfWeek, addDays, format } from 'date-fns';
import CalendarBodyDayContent from '../Day/CalendarBodyDayContent';
import { useCalendarAutoScroll } from '../../hooks';
import { getDayNamesFromWeekStartsOn } from '@/lib/utils/date-utils';

// Time hours array - moved outside component to prevent recreation on every render
const hours = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarBodyWeek() {
  const { date, events, weekStartsOn = 0 } = useCalendarContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Memoize week calculations - only recalculate when date or weekStartsOn changes
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn }), [date, weekStartsOn]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  
  // Memoize day names - only recalculate when weekStartsOn changes
  const adjustedDayNames = useMemo(() => getDayNamesFromWeekStartsOn(weekStartsOn), [weekStartsOn]);

  // Use the auto-scroll hook for week view
  useCalendarAutoScroll({
    scrollContainerRef,
    date,
    events,
    weekDays,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Week header - sticky below calendar header */}
      <div className="sticky top-[135px] z-40 flex bg-appPrimary text-white shadow-md border-b border-cyan-400">
        {/* Time column header */}
        <div className="w-12 sm:w-16 xl:w-20 py-2 sm:py-3 px-1 sm:px-2 xl:px-4 border-r border-cyan-400 flex-shrink-0"></div>

        {/* Day headers */}
        <div className="flex flex-1 overflow-x-auto">
          {weekDays.map((day, index) => {
            return (
              <div
                key={day.toISOString()}
                className="flex-1 py-2 lg:py-3 px-0.5 sm:px-1 lg:px-2 text-center border-r border-cyan-400 last:border-r-0 min-w-[50px] sm:min-w-[100px] md:min-w-[120px] lg:min-w-[150px]"
              >
                <div className="text-xs lg:text-sm font-medium">
                  {/* Show abbreviated day names on very small screens */}
                  <span className="sm:hidden">
                    {adjustedDayNames[index].slice(0, 2)}
                  </span>
                  <span className="hidden sm:inline">
                    {adjustedDayNames[index]}
                  </span>
                </div>
                <div className="text-xs lg:text-sm">{format(day, 'dd')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Week body with scroll */}
      <div className="flex flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex flex-1 overflow-y-auto overflow-x-auto"
        >
          <div className="flex flex-1 min-w-max">
            {/* Time column */}
            <div className="w-12 sm:w-16 xl:w-20 bg-background border-r border-gray-200 flex-shrink-0">
              {/* Time labels */}
              <div className="relative">
                {hours.map((hour) => (
                  <div key={hour} className="relative h-20 sm:h-24 lg:h-32">
                    {hour !== 0 && (
                      <span className="absolute text-[10px] sm:text-xs text-muted-foreground -top-2 sm:-top-2.5 left-0.5 sm:left-1 xl:left-2">
                        {/* Mobile: shorter format */}
                        <span className="sm:hidden">
                          {format(new Date().setHours(hour, 0, 0, 0), 'ha')}
                        </span>
                        {/* Desktop: full format */}
                        <span className="hidden sm:inline">
                          {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                        </span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Day columns */}
            <div className="flex flex-1">
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className="flex-1 border-r border-gray-200 last:border-r-0 min-w-[50px] sm:min-w-[100px] md:min-w-[120px] lg:min-w-[150px]"
                >
                  <CalendarBodyDayContent date={day} hideHeader={true} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
