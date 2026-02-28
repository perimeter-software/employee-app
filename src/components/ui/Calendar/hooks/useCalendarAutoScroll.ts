import { useEffect, useRef, RefObject } from 'react';
import { isSameDay, startOfDay } from 'date-fns';
import type { CalendarEvent } from '../types';

interface UseCalendarAutoScrollProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  date: Date;
  events: CalendarEvent[];
  weekDays?: Date[]; // For week view
  enableAutoScroll?: boolean; // Allow disabling auto-scroll
}

export function useCalendarAutoScroll({
  scrollContainerRef,
  date,
  events,
  weekDays,
  enableAutoScroll = true,
}: UseCalendarAutoScrollProps) {
  const timeoutIdsRef = useRef<NodeJS.Timeout[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    timeoutIdsRef.current = [];

    if (!enableAutoScroll || !events?.length) return;

    // Filter events based on view type
    const relevantEvents = weekDays
      ? events.filter((event) =>
          weekDays.some((day) => isSameDay(event.start, day))
        )
      : events.filter((event) => isSameDay(event.start, date));

    if (relevantEvents.length === 0) return;

    // Day view: earliest event by timestamp. Week view: earliest by time-of-day (topmost on grid)
    const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));
    const timeOfDayHours = (d: Date | string) => {
      const date = toDate(d);
      return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    };

    const earliestEvent = weekDays
      ? (() => {
          let minTod = Infinity;
          let best = relevantEvents[0];
          for (const e of relevantEvents) {
            const tod = timeOfDayHours(e.start);
            if (tod < minTod) {
              minTod = tod;
              best = e;
            }
          }
          return best;
        })()
      : relevantEvents.reduce((earliest, current) =>
          toDate(current.start).getTime() < toDate(earliest.start).getTime()
            ? current
            : earliest
        );

    // Scroll to first event minus 1 hour
    const earliestDate = new Date(earliestEvent.start);
    let targetTime = new Date(earliestDate.getTime() - 1 * 60 * 60 * 1000);

    // Clamp to period start so we never scroll before top (e.g. first event at 00:30 → show top)
    const periodStart = weekDays
      ? startOfDay(weekDays[0])
      : startOfDay(date);
    if (targetTime.getTime() < periodStart.getTime()) {
      targetTime = periodStart;
    }

    // Fractional hours for scroll position (relative to midnight)
    const targetHours =
      targetTime.getHours() +
      targetTime.getMinutes() / 60 +
      targetTime.getSeconds() / 3600;

    // Retry mechanism with proper cleanup tracking
    const maxAttempts = 20;
    const retryDelay = 100;
    let currentAttempt = 0;

    const attemptScroll = () => {
      if (!isMountedRef.current) return;

      if (!scrollContainerRef.current) {
        currentAttempt++;
        if (currentAttempt < maxAttempts) {
          const timeoutId = setTimeout(attemptScroll, retryDelay);
          timeoutIdsRef.current.push(timeoutId);
        }
        return;
      }

      // Detect actual hour height from DOM (responsive: 80px mobile, 96px sm, 128px lg)
      const container = scrollContainerRef.current;
      const hourGridRows = container.querySelectorAll('.h-20');
      
      let hourHeight = 128;
      if (hourGridRows.length > 0) {
        const computedHeight = hourGridRows[0].getBoundingClientRect().height;
        if (computedHeight > 0) {
          hourHeight = computedHeight;
        }
      }

      const rawPosition = targetHours * hourHeight;
      const maxScroll = container.scrollHeight - container.clientHeight;
      const scrollPosition = Math.max(0, Math.min(rawPosition, maxScroll));

      container.scrollTo({
        top: scrollPosition,
        behavior: 'smooth',
      });
    };

    // Start first attempt immediately
    const initialTimeoutId = setTimeout(attemptScroll, 0);
    timeoutIdsRef.current.push(initialTimeoutId);

    // Cleanup: cancel all pending retries
    return () => {
      isMountedRef.current = false;
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, [scrollContainerRef, date, events, weekDays, enableAutoScroll]);

  // Return a function to manually trigger scroll to a specific time
  const scrollToTime = (hour: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const hourHeight = 128;
    const rawPosition = Math.max(0, Math.min(23, hour)) * hourHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const scrollPosition = Math.min(rawPosition, maxScroll);

    container.scrollTo({
      top: scrollPosition,
      behavior: 'smooth',
    });
  };

  return { scrollToTime };
}
