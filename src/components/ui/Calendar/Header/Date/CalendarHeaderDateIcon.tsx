import { format } from "date-fns";
import { useCalendarContext } from "../../../Calendar";

export default function CalendarHeaderDateIcon() {
  const { calendarIconIsToday, date: calendarDate } = useCalendarContext();
  const date = calendarIconIsToday ? new Date() : calendarDate;
  return (
    <div className="flex items-center gap-2 bg-blue-500 text-white px-3 py-1 rounded">
      <div className="flex size-6 flex-col items-center justify-center">
        <p className="text-xs font-semibold uppercase">{format(date, "MMM")}</p>
        <p className="text-lg font-bold leading-none">{format(date, "dd")}</p>
      </div>
    </div>
  );
}
