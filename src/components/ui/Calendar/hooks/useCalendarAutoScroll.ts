import { useEffect, RefObject } from 'react';
import { isSameDay } from 'date-fns';
import type { CalendarEvent } from '../types';

interface UseCalendarAutoScrollProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  date: Date;
  events: CalendarEvent[];
  weekDays?: Date[]; // For week view
  enableAutoScroll?: boolean; // Allow disabling auto-scroll
}

// Extended event interface that matches the actual events passed from ShiftsSection
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
}

export function useCalendarAutoScroll({
  scrollContainerRef,
  date,
  events,
  weekDays,
  enableAutoScroll = true,
}: UseCalendarAutoScrollProps) {
  useEffect(() => {
    if (!enableAutoScroll || !scrollContainerRef.current || !events?.length)
      return;

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

    // Also prioritize completed or active punches over scheduled ones
    const actualPunches = relevantEvents.filter(
      (event) => event.status === 'completed' || event.status === 'active'
    );

    // Choose the best events to consider for auto-scroll (prioritize actual punches with location)
    let eventsToConsider: ExtendedCalendarEvent[];
    if (punchEventsWithLocation.length > 0) {
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

    // Calculate scroll position (each hour is 128px - h-32 class = 8rem = 128px)
    const hourHeight = 128;
    const scrollPosition = scrollToHour * hourHeight;

    // Add slight randomization for smooth performance with multiple rapid changes
    const delay = 150 + Math.random() * 50;

    // Scroll to the calculated position with a slight delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollPosition,
          behavior: 'smooth',
        });
      }
    }, delay);

    // Cleanup timeout on unmount or dependency change
    return () => clearTimeout(timeoutId);
  }, [scrollContainerRef, date, events, weekDays, enableAutoScroll]);

  // Return a function to manually trigger scroll to a specific time
  const scrollToTime = (hour: number) => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const hourRow = container.querySelector<HTMLElement>('[data-hour-row]');
    const hourHeight =
      hourRow?.offsetHeight ?? FALLBACK_HOUR_HEIGHT_PX;
    const scrollPosition = Math.max(0, Math.min(23, hour)) * hourHeight;

    container.scrollTo({
      top: scrollPosition,
      behavior: 'smooth',
    });
  };

  return { scrollToTime };
}
