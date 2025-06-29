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

export default function CalendarBodyMonth({
  hideTotalColumn = false,
}: {
  hideTotalColumn?: boolean;
}) {
  const { date, events, setDate, setMode } = useCalendarContext();

  // Same calculations as before...
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
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

  const calculateDayHours = (day: Date) => {
    const dayEvents = visibleEvents.filter((event: CalendarEventType) =>
      isSameDay(event.start, day)
    );
    return dayEvents.reduce((total, event) => {
      const hours =
        (event.end.getTime() - event.start.getTime()) / (1000 * 60 * 60);
      return total + hours;
    }, 0);
  };

  const calculateWeekHours = (weekDays: Date[]) => {
    return weekDays.reduce((total, day) => total + calculateDayHours(day), 0);
  };

  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col">
      {/* Week days header - sticky below calendar header */}
      <div
        className={clsxm(
          hideTotalColumn ? 'grid-cols-7' : 'grid-cols-7 lg:grid-cols-8',
          'grid bg-appPrimary text-white sticky top-[135px] z-40 shadow-md border-b border-cyan-400'
        )}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="py-2 lg:py-3 text-center text-xs lg:text-sm font-medium border-r border-cyan-400 last:border-r-0"
          >
            {day}
          </div>
        ))}
        {!hideTotalColumn && (
          <div className="py-2 lg:py-3 text-center text-xs lg:text-sm font-medium bg-appPrimary hidden lg:block">
            Total
          </div>
        )}
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
                className={clsxm(
                  hideTotalColumn
                    ? 'grid-cols-7'
                    : 'grid-cols-7 lg:grid-cols-8',
                  'grid border-b border-gray-200'
                )}
              >
                {week.map((day) => {
                  const dayEvents = visibleEvents.filter(
                    (event: CalendarEventType) => isSameDay(event.start, day)
                  );
                  const isToday = isSameDay(day, today);
                  const isCurrentMonth = isSameMonth(day, date);
                  const totalHours = calculateDayHours(day);

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
                      <div
                        className={clsxm(
                          'text-xs lg:text-sm font-medium w-fit p-0.5 lg:p-1 flex flex-col items-center justify-center rounded-full aspect-square mb-1 lg:mb-2',
                          isToday && 'bg-appPrimary text-white',
                          !isCurrentMonth && 'text-gray-400'
                        )}
                      >
                        {format(day, 'd')}
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
                                setDate(day);
                                setMode('day');
                              }}
                            >
                              +{dayEvents.length - 1} more
                            </motion.div>
                          )}
                        </div>
                      </AnimatePresence>
                      {totalHours > 0 && (
                        <div className="text-right text-[10px] lg:text-xs text-appPrimary mt-0.5 lg:mt-1 font-medium">
                          {Math.round(totalHours)} hrs
                        </div>
                      )}
                    </div>
                  );
                })}

                {!hideTotalColumn && (
                  <div
                    className={clsxm(
                      'border-r border-gray-200 p-1 lg:p-2 min-h-[80px] lg:min-h-[120px] bg-gray-50 items-center',
                      'hidden lg:flex flex-col justify-center'
                    )}
                  >
                    <div className="text-xs lg:text-sm font-bold text-appPrimary">
                      {Math.round(calculateWeekHours(week))} hrs
                    </div>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
