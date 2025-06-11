import { useCalendarContext } from "../../../Calendar";
import { isSameDay } from "date-fns";
import { hours } from "./CalendarBodyMarginDayMargin";
import { type CalendarEvent as CalendarEventType } from "../../types";
import CalendarBodyHeader from "../CalendarBodyHeader";
import CalendarEvent from "../../CalendarEvent";

export default function CalendarBodyDayContent({
  date,
  hideHeader = false,
}: {
  date: Date;
  hideHeader?: boolean;
}) {
  const { events, mode } = useCalendarContext();

  const dayEvents = events.filter((event: CalendarEventType) =>
    isSameDay(event.start, date)
  );

  return (
    <div className="flex flex-col flex-grow">
      {/* Only show header in day mode, hide in week mode */}
      {!hideHeader && mode !== "week" && <CalendarBodyHeader date={date} />}

      <div className="flex-1 relative">
        {/* Hour grid lines */}
        {hours.map((hour) => (
          <div key={hour} className="h-32 border-b border-border/50 group" />
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
}
