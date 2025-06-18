import CalendarBodyDay from "./Day/CalendarBodyDay";
import CalendarBodyWeek from "./Week/CalendarBodyWeek";
import CalendarBodyMonth from "./Month/CalendarBodyMonth";
import { useCalendarContext } from "../CalendarContext";

export default function CalendarBody({
  hideTotalColumn = false,
}: {
  hideTotalColumn?: boolean;
}) {
  const { mode } = useCalendarContext();

  return (
    <>
      {mode === "day" && <CalendarBodyDay />}
      {mode === "week" && <CalendarBodyWeek />}
      {mode === "month" && (
        <CalendarBodyMonth hideTotalColumn={hideTotalColumn} />
      )}
    </>
  );
}
