import { format, isSameDay } from "date-fns";
import { clsxm } from "@/lib/utils";

export default function CalendarBodyHeader({
  date,
  onlyDay = false,
  hideInWeekView = false,
}: {
  date: Date;
  onlyDay?: boolean;
  hideInWeekView?: boolean;
}) {
  const isToday = isSameDay(date, new Date());

  // Don't render header in week view since we have the top header
  if (hideInWeekView) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-1 py-2 w-full sticky top-0 bg-background z-10 border-b">
      <span
        className={clsxm(
          "text-xs font-medium",
          isToday ? "text-primary" : "text-muted-foreground"
        )}
      >
        {format(date, "EEE")}
      </span>
      {!onlyDay && (
        <span
          className={clsxm(
            "text-xs font-medium",
            isToday ? "text-primary font-bold" : "text-foreground"
          )}
        >
          {format(date, "dd")}
        </span>
      )}
    </div>
  );
}
