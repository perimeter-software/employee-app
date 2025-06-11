import { format } from "date-fns";
import { clsxm } from "@/lib/utils";

export const hours = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarBodyMarginDayMargin({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={clsxm(
        "w-20 bg-background border-r border-gray-200 flex-shrink-0",
        className
      )}
    >
      {/* Time labels */}
      <div className="relative w-full">
        {hours.map((hour) => (
          <div key={hour} className="relative h-32">
            {hour !== 0 && (
              <span className="absolute text-xs text-muted-foreground -top-2.5 left-2">
                {format(new Date().setHours(hour, 0, 0, 0), "h a")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
