import { useCalendarContext } from '../../../Calendar';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  isWithinInterval,
} from 'date-fns';
import { clsxm } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type { CalendarEvent as CalendarEventType } from '../../../Calendar/types';
import CalendarEvent from '../../CalendarEvent';
import { getDayNamesFromWeekStartsOn } from '@/lib/utils/date-utils';

export default function CalendarBodyMonth({
  noHeaderSpacing = false,
}: {
  noHeaderSpacing?: boolean;
}) {
  const { date, events, setDate, setMode, onOverflowClick, dayBadges } = useCalendarContext();

  // Get weekStartsOn from context, default to Sunday
  const { weekStartsOn = 0 } = useCalendarContext();

  // Same calculations as before...
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const today = new Date();

  const visibleEvents = events.filter(
    (event: CalendarEventType) =>
      isWithinInterval(event.start, {
        start: calendarStart,
        end: calendarEnd,
      }) ||
      isWithinInterval(event.end, { start: calendarStart, end: calendarEnd })
  );

  // Removed calculateDayHours and calculateWeekHours - totals are no longer displayed

  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col">
      {/* Week days header - sticky below calendar header */}
      <div
        className={clsxm(
          'grid grid-cols-7 bg-appPrimary text-white sticky z-40 shadow-md border-b border-cyan-400',
          noHeaderSpacing ? 'top-0' : 'top-[135px]'
        )}
      >
        {getDayNamesFromWeekStartsOn(weekStartsOn).map((day) => (
          <div
            key={day}
            className="py-2 lg:py-3 text-center text-xs lg:text-sm font-medium border-r border-cyan-400 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Month content */}
      <div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={monthStart.toISOString()}
            className="relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: 'easeInOut',
            }}
          >
            {weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                className="grid grid-cols-7 border-b border-gray-200"
              >
                {week.map((day) => {
                  const dayEvents = visibleEvents.filter(
                    (event: CalendarEventType) => isSameDay(event.start, day)
                  );
                  const isToday = isSameDay(day, today);
                  const isCurrentMonth = isSameMonth(day, date);
                  
                  // Get badges for this day
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const badges = dayBadges?.[dateKey];

                  return (
                    <div
                      key={day.toISOString()}
                      className={clsxm(
                        'relative flex flex-col border-r border-gray-200 p-1 lg:p-2 min-h-[80px] lg:min-h-[120px] cursor-pointer bg-white hover:bg-gray-50 transition-colors',
                        !isCurrentMonth && 'bg-gray-50'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDate(day);
                        setMode('day');
                      }}
                    >
                      <div className="flex items-center gap-1 mb-1 lg:mb-2">
                        <div
                          className={clsxm(
                            'text-xs lg:text-sm font-medium w-fit p-0.5 lg:p-1 flex flex-col items-center justify-center rounded-full aspect-square',
                            isToday && 'bg-appPrimary text-white',
                            !isCurrentMonth && 'text-gray-400'
                          )}
                        >
                          {format(day, 'd')}
                        </div>
                        {badges && badges.length > 0 && (
                          <div className="flex items-center gap-0.5 text-[9px] lg:text-[10px] font-medium">
                            {badges.map((badge, index) => (
                              <span
                                key={index}
                                className="relative inline-flex group"
                              >
                                <span
                                  className={clsxm(
                                    'flex items-center rounded px-1 py-0.5 cursor-default',
                                    badge.color,
                                    badge.textColor || 'text-white'
                                  )}
                                  title={badge.label}
                                >
                                  {badge.value}
                                </span>
                                {badge.label && (
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] font-medium text-background opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                  >
                                    {badge.label}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <AnimatePresence mode="wait">
                        <div className="flex flex-col gap-0.5 lg:gap-1 flex-1">
                          {dayEvents
                            .slice(0, 1)
                            .map((event: CalendarEventType) => (
                              <CalendarEvent
                                key={event.id}
                                event={event}
                                className="relative h-auto text-[10px] lg:text-xs"
                                month
                              />
                            ))}
                          {dayEvents.length > 1 && (
                            <motion.div
                              key={`more-${day.toISOString()}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{
                                duration: 0.2,
                              }}
                              className="text-[10px] lg:text-xs text-muted-foreground cursor-pointer hover:text-appPrimary"
                              onClick={(e) => {
                                e.stopPropagation();
                                // If onOverflowClick is provided, use it; otherwise navigate to day view
                                if (onOverflowClick && dayEvents.length > 2) {
                                  const firstEvent = dayEvents[0];
                                  onOverflowClick(firstEvent, dayEvents, e.nativeEvent);
                                } else {
                                  setDate(day);
                                  setMode('day');
                                }
                              }}
                            >
                              +{dayEvents.length - 1} more
                            </motion.div>
                          )}
                        </div>
                      </AnimatePresence>
                    </div>
                  );
                })}

              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
