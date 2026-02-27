import { useEffect, useCallback, RefObject } from 'react';
import { isSameDay } from 'date-fns';
import type { CalendarEvent } from '../types';

interface UseCalendarAutoScrollProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  date: Date;
  events: CalendarEvent[];
  weekDays?: Date[]; // For week view
  enableAutoScroll?: boolean; // Allow disabling auto-scroll
  /** Pixels to leave at top so the first shift appears below sticky header (week/day view). */
  stickyHeaderOffset?: number;
}

// Extended event interface that matches the actual events passed from calendars
interface ExtendedCalendarEvent extends CalendarEvent {
  punchData?: {
    clockInCoordinates?: {
      latitude: number;
      longitude: number;
      accuracy: number;
    };
    timeIn: string;
  };
  status?: 'active' | 'completed' | 'scheduled' | 'missed';
  // Optional flag used by some calendars (e.g. time & attendance)
  // to mark future, "available" shifts or events
  isFuture?: boolean;
}

export function useCalendarAutoScroll({
  scrollContainerRef,
  date,
  events,
  weekDays,
  enableAutoScroll = true,
  stickyHeaderOffset = 0,
}: UseCalendarAutoScrollProps) {
  useEffect(() => {
    if (!enableAutoScroll || !events?.length) return;

    // Cast events to extended type for better type checking
    const extendedEvents = events as ExtendedCalendarEvent[];

    // Filter events based on view type
    const relevantEvents = weekDays
      ? extendedEvents.filter((event) =>
          weekDays.some((day) => isSameDay(event.start, day))
        )
      : extendedEvents.filter((event) => isSameDay(event.start, date));

    if (relevantEvents.length === 0) return;

    // Prioritize events with geolocation data (actual punches with coordinates)
    const punchEventsWithLocation = relevantEvents.filter((event) => {
      return (
        event.punchData?.clockInCoordinates?.latitude !== undefined &&
        event.punchData?.clockInCoordinates?.longitude !== undefined &&
        event.punchData?.clockInCoordinates?.accuracy !== undefined
      );
    });

    // Prefer future/available events (e.g. upcoming shifts) when present
    const futureEvents = relevantEvents.filter((event) => event.isFuture);

    // Also prioritize completed or active punches over scheduled ones
    const actualPunches = relevantEvents.filter(
      (event) => event.status === 'completed' || event.status === 'active'
    );

    // Choose the best events to consider for auto-scroll.
    // Order of preference:
    // 1) Future/available events (e.g. upcoming shifts)
    // 2) Events with precise geolocation
    // 3) Completed or active punches
    // 4) Any relevant events
    let eventsToConsider: ExtendedCalendarEvent[];
    if (futureEvents.length > 0) {
      eventsToConsider = futureEvents;
    } else if (punchEventsWithLocation.length > 0) {
      eventsToConsider = punchEventsWithLocation;
    } else if (actualPunches.length > 0) {
      eventsToConsider = actualPunches;
    } else {
      eventsToConsider = relevantEvents;
    }

    // Find the earliest event time
    const earliestEvent = eventsToConsider.reduce((earliest, current) =>
      current.start < earliest.start ? current : earliest
    );

    // Calculate 1 hour before the earliest punch
    const targetTime = new Date(earliestEvent.start);
    const originalHour = targetTime.getHours();
    const oneHourBefore = Math.max(0, originalHour - 1);

    // Smart scrolling logic:
    // - For very early punches (before 7 AM), scroll to 6 AM
    // - For normal work hours, scroll to 1 hour before
    // - For late punches (after 10 PM), scroll to 6 PM
    let scrollToHour: number;
    if (originalHour <= 7) {
      scrollToHour = 6;
    } else if (originalHour >= 22) {
      scrollToHour = 18; // 6 PM
    } else {
      scrollToHour = oneHourBefore;
    }

    // Match calendar hour row height (CalendarBodyDayContent / CalendarBodyWeek use h-20 sm:h-24 lg:h-32 = 80/96/128px)
    const hourHeight = 128;
    const scrollPosition = Math.max(0, scrollToHour * hourHeight - stickyHeaderOffset);

    // Returns true if a scroll was performed (so we can skip the retry when layout was ready)
    const runScroll = (): boolean => {
      const refEl = scrollContainerRef.current;
      if (!refEl) return false;
      let el: HTMLElement | null = refEl;
      let maxScroll = el.scrollHeight - el.clientHeight;
      let top = scrollPosition;
      // If this element isn't scrollable (e.g. parent has overflow), use nearest scrollable ancestor
      if (maxScroll <= 0) {
        let parent: HTMLElement | null = refEl.parentElement;
        while (parent && parent !== document.body) {
          const style = getComputedStyle(parent);
          const overflowY = style.overflowY;
          if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
            const parentMax = parent.scrollHeight - parent.clientHeight;
            if (parentMax > 0) {
              el = parent;
              maxScroll = parentMax;
              top = refEl.offsetTop + scrollPosition;
              break;
            }
          }
          parent = parent.parentElement;
        }
        if (!el || maxScroll <= 0) return false;
      }
      top = Math.min(Math.max(0, top), maxScroll);
      el.scrollTo({ top, behavior: 'smooth' });
      return true;
    };

    // Delay so the scroll container is mounted, laid out, and has correct scrollHeight
    let retryId: ReturnType<typeof setTimeout> | undefined;
    const timeoutId = setTimeout(() => {
      const didScroll = runScroll();
      // Retry once only if first attempt didn't scroll (ref/layout not ready); avoids double scroll when ready
      if (!didScroll) retryId = setTimeout(runScroll, 250);
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      if (retryId !== undefined) clearTimeout(retryId);
    };
  }, [scrollContainerRef, date, events, weekDays, enableAutoScroll, stickyHeaderOffset]);

  const scrollToTime = useCallback(
    (hour: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const hourHeight = 128;
      const scrollPosition = Math.max(0, Math.min(23, hour)) * hourHeight;
      el.scrollTo({ top: scrollPosition, behavior: 'smooth' });
    },
    [scrollContainerRef]
  );

  return { scrollToTime };
}
