import { useRef } from 'react';
import CalendarBodyDayCalendar from './CalendarBodyDayCalendar';
import CalendarBodyDayEvents from './CalendarBodyDayEvents';
import { useCalendarContext } from '../../../Calendar';
import CalendarBodyDayContent from './CalendarBodyDayContent';
import CalendarBodyMarginDayMargin from './CalendarBodyMarginDayMargin';
import { format, isSameDay } from 'date-fns';
import { useCalendarAutoScroll } from '../../hooks';

export default function CalendarBodyDay() {
  const { date, events } = useCalendarContext();
  const today = new Date();
  const isToday = isSameDay(date, today);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use the auto-scroll hook
  useCalendarAutoScroll({
    scrollContainerRef,
    date,
    events,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Day header - sticky below calendar header */}
      <div className="sticky top-[135px] z-40 flex bg-appPrimary text-white shadow-md border-b border-cyan-400">
        {/* Time column header */}
        <div className="hidden lg:block w-20 py-3 px-4 border-r border-cyan-400 flex-shrink-0"></div>

        {/* Day header */}
        <div className="flex-1 py-2 lg:py-3 px-2 text-center">
          <div
            className={`text-xs lg:text-sm font-medium ${
              isToday ? 'font-bold' : ''
            }`}
          >
            {format(date, 'EEEE')}
          </div>
          <div className="text-xs lg:text-sm">{format(date, 'dd')}</div>
        </div>

        {/* Sidebar header spacer */}
        <div className="hidden lg:block w-[276px] py-3 px-4 border-l border-cyan-400"></div>
      </div>

      {/* Content area with scroll */}
      <div className="flex divide-x flex-grow overflow-hidden">
        {/* Main calendar area */}
        <div className="flex flex-col flex-grow overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="flex flex-col flex-1 overflow-y-auto"
          >
            <div className="relative flex flex-1">
              <CalendarBodyMarginDayMargin />
              <CalendarBodyDayContent date={date} hideHeader={true} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:flex flex-col flex-grow divide-y max-w-[276px]">
          <CalendarBodyDayCalendar />
          <CalendarBodyDayEvents />
        </div>
      </div>
    </div>
  );
}
