import { useMemo } from "react";
import { useCalendarContext } from "../../../Calendar";
import type { CalendarEvent } from "@/components/ui/Calendar/types";

export default function CalendarBodyDayEvents() {
  const { events, date, setManageEventDialogOpen, setSelectedEvent, mode } =
    useCalendarContext();
  
  // Use the same filtering logic as CalendarBodyDayContent for consistency
  // Filter events for this day - show events that start, end, or span this day
  const dayEvents = useMemo(() => {
    // Normalize target day once
    const targetDay = new Date(date);
    targetDay.setHours(0, 0, 0, 0);
    const targetDayTime = targetDay.getTime();
    
    return events.filter((event: CalendarEvent) => {
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
      
      return startsOnDay || endsOnDay || spansDay;
    });
  }, [events, date, mode]);

  return !!dayEvents.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">Events</p>
      <div className="flex flex-col gap-2">
        {dayEvents.map((event: CalendarEvent) => (
          <div
            key={event.id}
            className="flex items-center gap-2 px-2 cursor-pointer"
            onClick={() => {
              setSelectedEvent(event);
              setManageEventDialogOpen(true);
            }}
          >
            <div className="flex items-center gap-2">
              <div className={`size-2 rounded-full bg-${event.color}-500`} />
              <p className="text-muted-foreground text-sm font-medium">
                {event.title}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="p-2 text-muted-foreground">No events today...</div>
  );
}
