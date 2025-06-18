import type { CalendarProps } from "./types";
import CalendarHeader from "./Header/CalendarHeader";
import CalendarBody from "./Body/CalendarBody";
import CalendarHeaderActions from "./Header/Actions/CalendarHeaderActions";
import CalendarHeaderDate from "./Header/Date/CalendarHeaderDate";
import CalendarHeaderActionsMode from "./Header/Actions/CalendarHeaderActionsMode";
import CalendarProvider from "./CalendarProvider";

export default function Calendar({
  events,
  setEvents,
  mode,
  setMode,
  date,
  setDate,
  calendarIconIsToday = true,
  hideTotalColumn = false,
}: CalendarProps) {
  return (
    <CalendarProvider
      events={events}
      setEvents={setEvents}
      mode={mode}
      setMode={setMode}
      date={date}
      setDate={setDate}
      calendarIconIsToday={calendarIconIsToday}
    >
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode />
        </CalendarHeaderActions>
      </CalendarHeader>
      <CalendarBody hideTotalColumn={hideTotalColumn} />
    </CalendarProvider>
  );
}
