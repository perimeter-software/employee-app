import { useCalendarContext } from '../../../Calendar';
import { startOfWeek, addDays, format } from 'date-fns';
import CalendarBodyDayContent from '../Day/CalendarBodyDayContent';

// Time hours array
const hours = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarBodyWeek() {
  const { date } = useCalendarContext();

  // Start week on Sunday (weekStartsOn: 0)
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col flex-grow overflow-hidden">
      {/* Week header - using flex to match body layout */}
      <div className="flex bg-appPrimary text-white">
        {/* Time column header */}
        <div className="w-16 xl:w-20 py-3 px-2 xl:px-4 border-r border-cyan-400 flex-shrink-0"></div>

        {/* Day headers */}
        <div className="flex flex-1 overflow-x-auto">
          {weekDays.map((day, index) => {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            return (
              <div
                key={day.toISOString()}
                className="flex-1 py-2 lg:py-3 px-1 lg:px-2 text-center border-r border-cyan-400 last:border-r-0 min-w-[100px] sm:min-w-[120px] lg:min-w-0"
              >
                <div className="text-xs lg:text-sm font-medium">
                  {dayNames[index]}
                </div>
                <div className="text-xs lg:text-sm">{format(day, 'dd')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Week body */}
      <div className="flex flex-grow overflow-hidden">
        <div className="flex flex-col flex-grow overflow-hidden">
          <div className="flex flex-col flex-1 overflow-y-auto">
            <div className="relative flex flex-1">
              {/* Time column - made narrower to give more space to day columns */}
              <div className="w-16 xl:w-20 bg-background border-r border-gray-200 flex-shrink-0">
                {/* Time labels */}
                <div className="relative">
                  {hours.map((hour) => (
                    <div key={hour} className="relative h-32">
                      {hour !== 0 && (
                        <span className="absolute text-xs text-muted-foreground -top-2.5 left-1 xl:left-2">
                          {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day columns - increased minimum width for better readability */}
              <div className="flex flex-1 overflow-x-auto">
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex-1 border-r border-gray-200 last:border-r-0 min-w-[100px] sm:min-w-[120px] lg:min-w-0"
                  >
                    <CalendarBodyDayContent date={day} hideHeader={true} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
