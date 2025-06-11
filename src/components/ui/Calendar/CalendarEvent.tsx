import { CalendarEvent as CalendarEventType } from "./types";
import { useCalendarContext } from "./CalendarContext";
import { format, isSameDay, isSameMonth } from "date-fns";
import { clsxm } from "@/lib/utils";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
}

function getOverlappingEvents(
  currentEvent: CalendarEventType,
  events: CalendarEventType[]
): CalendarEventType[] {
  return events.filter((event) => {
    if (event.id === currentEvent.id) return false;
    return (
      currentEvent.start < event.end &&
      currentEvent.end > event.start &&
      isSameDay(currentEvent.start, event.start)
    );
  });
}

function calculateEventPosition(
  event: CalendarEventType,
  allEvents: CalendarEventType[]
): EventPosition {
  const overlappingEvents = getOverlappingEvents(event, allEvents);
  const group = [event, ...overlappingEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const position = group.indexOf(event);

  // Adjust width and positioning for better display
  const totalEvents = overlappingEvents.length + 1;
  const width = totalEvents > 1 ? `${95 / totalEvents}%` : `95%`;
  const left = totalEvents > 1 ? `${(position * 95) / totalEvents + 2}%` : `2%`;

  const startHour = event.start.getHours();
  const startMinutes = event.start.getMinutes();

  let endHour = event.end.getHours();
  let endMinutes = event.end.getMinutes();

  if (!isSameDay(event.start, event.end)) {
    endHour = 23;
    endMinutes = 59;
  }

  const topPosition = startHour * 128 + (startMinutes / 60) * 128;
  const duration = endHour * 60 + endMinutes - (startHour * 60 + startMinutes);
  const height = Math.max((duration / 60) * 128, 32); // Minimum height of 32px

  return {
    left,
    width,
    top: `${topPosition}px`,
    height: `${height}px`,
  };
}

type ColorKey =
  | "blue"
  | "red"
  | "green"
  | "purple"
  | "pink"
  | "orange"
  | "yellow"
  | "indigo";

const getEventStyles = (color: string, isMonth: boolean = false) => {
  const colorMap = {
    blue: {
      bg: isMonth ? "bg-blue-100" : "bg-blue-100",
      border: isMonth ? "border-l-blue-500" : "border-l-blue-500",
      text: isMonth ? "text-blue-700" : "text-blue-700",
    },
    red: {
      bg: isMonth ? "bg-red-100" : "bg-red-100",
      border: isMonth ? "border-l-red-500" : "border-l-red-500",
      text: isMonth ? "text-red-700" : "text-red-700",
    },
    green: {
      bg: isMonth ? "bg-green-100" : "bg-green-100",
      border: isMonth ? "border-l-green-500" : "border-l-green-500",
      text: isMonth ? "text-green-700" : "text-green-700",
    },
    purple: {
      bg: isMonth ? "bg-purple-100" : "bg-purple-100",
      border: isMonth ? "border-l-purple-500" : "border-l-purple-500",
      text: isMonth ? "text-purple-700" : "text-purple-700",
    },
    pink: {
      bg: isMonth ? "bg-pink-100" : "bg-pink-100",
      border: isMonth ? "border-l-pink-500" : "border-l-pink-500",
      text: isMonth ? "text-pink-700" : "text-pink-700",
    },
    orange: {
      bg: isMonth ? "bg-orange-100" : "bg-orange-100",
      border: isMonth ? "border-l-orange-500" : "border-l-orange-500",
      text: isMonth ? "text-orange-700" : "text-orange-700",
    },
    yellow: {
      bg: isMonth ? "bg-yellow-100" : "bg-yellow-100",
      border: isMonth ? "border-l-yellow-500" : "border-l-yellow-500",
      text: isMonth ? "text-yellow-700" : "text-yellow-700",
    },
    indigo: {
      bg: isMonth ? "bg-indigo-100" : "bg-indigo-100",
      border: isMonth ? "border-l-indigo-500" : "border-l-indigo-500",
      text: isMonth ? "text-indigo-700" : "text-indigo-700",
    },
  };

  return colorMap[color as ColorKey] || colorMap.blue;
};

export default function CalendarEvent({
  event,
  month = false,
  className,
}: {
  event: CalendarEventType;
  month?: boolean;
  className?: string;
}) {
  const { events, setSelectedEvent, setManageEventDialogOpen, date } =
    useCalendarContext();
  const style = month ? {} : calculateEventPosition(event, events);
  const eventStyles = getEventStyles(event.color, month);

  // Generate a unique key that includes the current month to prevent animation conflicts
  const isEventInCurrentMonth = isSameMonth(event.start, date);
  const animationKey = `${event.id}-${
    isEventInCurrentMonth ? "current" : "adjacent"
  }`;

  if (month) {
    // Month view styling - compact format
    return (
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait">
          <motion.div
            className={clsxm(
              "px-1 py-0.5 rounded text-xs cursor-pointer transition-all duration-200 border-l-2 mb-1",
              eventStyles.bg,
              eventStyles.border,
              eventStyles.text,
              "hover:shadow-sm",
              className
            )}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEvent(event);
              setManageEventDialogOpen(true);
            }}
            initial={{
              opacity: 0,
              y: -2,
              scale: 0.98,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              transition: {
                duration: 0.15,
                ease: "easeOut",
              },
            }}
            transition={{
              duration: 0.2,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            layoutId={`event-${animationKey}-month`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium truncate mr-1">{event.title}</span>
              <span className="text-xs opacity-80 flex-shrink-0">
                {format(event.start, "h:mm a")}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </MotionConfig>
    );
  }

  // Week/Day view styling - full format
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          className={clsxm(
            "px-2 py-1 rounded-md cursor-pointer transition-all duration-200 border-l-4",
            eventStyles.bg,
            eventStyles.border,
            eventStyles.text,
            "hover:shadow-md hover:scale-[1.02]",
            "absolute overflow-hidden",
            className
          )}
          style={style}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEvent(event);
            setManageEventDialogOpen(true);
          }}
          initial={{
            opacity: 0,
            y: -3,
            scale: 0.98,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            scale: 0.98,
            transition: {
              duration: 0.15,
              ease: "easeOut",
            },
          }}
          transition={{
            duration: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
            opacity: {
              duration: 0.2,
              ease: "linear",
            },
            layout: {
              duration: 0.2,
              ease: "easeOut",
            },
          }}
          layoutId={`event-${animationKey}-day`}
        >
          <motion.div
            className="flex flex-col w-full h-full justify-start"
            layout="position"
          >
            <p className="font-semibold truncate leading-tight text-sm">
              {event.title}
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              <span>{format(event.start, "h:mm a")}</span>
              <span className="mx-1">-</span>
              <span>{format(event.end, "h:mm a")}</span>
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
