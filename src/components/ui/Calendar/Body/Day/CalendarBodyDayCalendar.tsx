import { useCalendarContext } from "../../../Calendar";
import { Calendar } from "@/components/ui/DatePicker/Calendar";

export default function CalendarBodyDayCalendar() {
  const { date, setDate } = useCalendarContext();
  return (
    <Calendar
      selected={date}
      onSelect={(date: Date | undefined) => date && setDate(date)}
      mode="single"
    />
  );
}
