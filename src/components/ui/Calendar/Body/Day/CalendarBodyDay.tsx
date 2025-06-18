import CalendarBodyDayCalendar from "./CalendarBodyDayCalendar";
import CalendarBodyDayEvents from "./CalendarBodyDayEvents";
import { useCalendarContext } from "../../../Calendar";
import CalendarBodyDayContent from "./CalendarBodyDayContent";
import CalendarBodyMarginDayMargin from "./CalendarBodyMarginDayMargin";
import { format, isSameDay } from "date-fns";

export default function CalendarBodyDay() {
  const { date } = useCalendarContext();
  const today = new Date();
  const isToday = isSameDay(date, today);

  return (
    <div className="flex divide-x flex-grow overflow-hidden">
      {/* Main calendar area */}
      <div className="flex flex-col flex-grow divide-y overflow-hidden">
        {/* Day header for main area only */}
        <div className="flex bg-appPrimary text-white">
          {/* Time column header */}
          <div className="hidden lg:block w-20 py-3 px-4 border-r border-cyan-400 flex-shrink-0"></div>

          {/* Day header */}
          <div className="flex-1 py-2 lg:py-3 px-2 text-center">
            <div
              className={`text-xs lg:text-sm font-medium ${
                isToday ? "font-bold" : ""
              }`}
            >
              {format(date, "EEEE")}
            </div>
            <div className="text-xs lg:text-sm">{format(date, "dd")}</div>
          </div>
        </div>

        {/* Day content */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="relative flex flex-1">
            <CalendarBodyMarginDayMargin />
            <CalendarBodyDayContent date={date} hideHeader={true} />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden lg:flex flex-col flex-grow divide-y max-w-[276px]">
        <CalendarBodyDayCalendar />
        <CalendarBodyDayEvents />
      </div>
    </div>
  );
}
