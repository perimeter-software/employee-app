import { Button } from "@/components/ui/Button";
import { useCalendarContext } from "../../../Calendar";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
} from "date-fns";

export default function CalendarHeaderDateChevrons() {
  const { mode, date, setDate } = useCalendarContext();

  function handleDateBackward() {
    switch (mode) {
      case "month":
        setDate(subMonths(date, 1));
        break;
      case "week":
        setDate(subWeeks(date, 1));
        break;
      case "day":
        setDate(subDays(date, 1));
        break;
    }
  }

  function handleDateForward() {
    switch (mode) {
      case "month":
        setDate(addMonths(date, 1));
        break;
      case "week":
        setDate(addWeeks(date, 1));
        break;
      case "day":
        setDate(addDays(date, 1));
        break;
    }
  }

  // Generate the appropriate date display based on mode
  const getDateDisplay = () => {
    switch (mode) {
      case "month":
        return format(date, "MMMM yyyy"); // "June 2025"
      case "week":
        const weekStart = startOfWeek(date, { weekStartsOn: 0 }); // Sunday
        const weekEnd = endOfWeek(date, { weekStartsOn: 0 }); // Saturday
        return `${format(weekStart, "MMMM dd")} - ${format(
          weekEnd,
          "MMMM dd, yyyy"
        )}`; // "June 01 - June 07, 2025"
      case "day":
        return format(date, "MMMM d, yyyy"); // "April 2, 2025"
      default:
        return format(date, "MMMM d, yyyy");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className="h-7 w-7 p-1"
        onClick={handleDateBackward}
      >
        <ChevronLeft className="min-w-5 min-h-5" />
      </Button>

      <span className="min-w-[140px] text-center font-medium">
        {getDateDisplay()}
      </span>

      <Button
        variant="outline"
        className="h-7 w-7 p-1"
        onClick={handleDateForward}
      >
        <ChevronRight className="min-w-5 min-h-5" />
      </Button>
    </div>
  );
}
