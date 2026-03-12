import { useRef } from 'react';
import CalendarBodyDayCalendar from './CalendarBodyDayCalendar';
import CalendarBodyDayEvents from './CalendarBodyDayEvents';
import { useCalendarContext } from '../../../Calendar';
import CalendarBodyDayContent from './CalendarBodyDayContent';
import CalendarBodyMarginDayMargin from './CalendarBodyMarginDayMargin';
import { format, isSameDay } from 'date-fns';
import { useCalendarAutoScroll } from '../../hooks';
import { clsxm } from '@/lib/utils';

export default function CalendarBodyDay({
  noHeaderSpacing = false,
}: {
  noHeaderSpacing?: boolean;
}) {
  const { date, events, dayBadges } = useCalendarContext();
  const today = new Date();
  const isToday = isSameDay(date, today);
  
  // Get badges for this day
  const dateKey = format(date, 'yyyy-MM-dd');
  const badges = dayBadges?.[dateKey];
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
      <div
        className={clsxm(
          'sticky z-40 flex bg-appPrimary text-white shadow-md border-b border-cyan-400',
          noHeaderSpacing ? 'top-0' : 'top-[135px]'
        )}
      >
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
          {badges && badges.length > 0 && (
            <div className="flex items-center justify-center gap-1 mt-1 text-[10px] lg:text-xs font-medium">
              {badges.map((badge, index) => (
                <span
                  key={index}
                  className="relative inline-flex group"
                >
                  <span
                    className={clsxm(
                      'flex items-center rounded px-1.5 py-0.5 cursor-default',
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
            <div className="relative flex">
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
