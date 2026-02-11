import CalendarBodyDay from "./Day/CalendarBodyDay";
import CalendarBodyWeek from "./Week/CalendarBodyWeek";
import CalendarBodyMonth from "./Month/CalendarBodyMonth";
import { useCalendarContext } from "../CalendarContext";

export default function CalendarBody({
  hideHeaderActions = false,
  hideHeaderDate = false,
}: {
  hideTotalColumn?: boolean;
  hideHeaderActions?: boolean;
  hideHeaderDate?: boolean;
}) {
  const { mode } = useCalendarContext();
  const noHeaderSpacing = hideHeaderActions && hideHeaderDate;

  return (
    <>
      {mode === "day" && <CalendarBodyDay noHeaderSpacing={noHeaderSpacing} />}
      {mode === "week" && <CalendarBodyWeek noHeaderSpacing={noHeaderSpacing} />}
      {mode === "month" && <CalendarBodyMonth noHeaderSpacing={noHeaderSpacing} />}
    </>
  );
}
