import { CalendarEvent as CalendarEventType } from './types';
import { useCalendarContext } from './CalendarContext';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { clsxm } from '@/lib/utils';
import { motion, MotionConfig, AnimatePresence } from 'framer-motion';

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
  zIndex: number;
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

  // Better overlap handling - stack events with slight offset
  const totalEvents = overlappingEvents.length + 1;
  let width: string;
  let left: string;
  let zIndex: number;

  if (totalEvents === 1) {
    // Single event takes full width
    width = '95%';
    left = '2%';
    zIndex = 1;
  } else {
    // Multiple events - use stacking approach for better visibility
    const stackOffset = position * 4; // 4px offset per event
    const maxWidth = Math.max(60, 95 - (totalEvents - 1) * 15); // Minimum 60% width

    width = `${maxWidth}%`;
    left = `${2 + stackOffset}px`;
    zIndex = totalEvents - position; // Higher events have higher z-index
  }

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
  const height = Math.max((duration / 60) * 128, 40); // Minimum height of 40px

  return {
    left,
    width,
    top: `${topPosition}px`,
    height: `${height}px`,
    zIndex,
  };
}

type ColorKey =
  | 'blue'
  | 'red'
  | 'green'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'yellow'
  | 'indigo';

const getEventStyles = (color: string, isMonth: boolean = false) => {
  const colorMap = {
    blue: {
      bg: isMonth ? 'bg-appPrimary' : 'bg-appPrimary border-appPrimary',
      border: isMonth ? 'border-l-appPrimary' : 'border-l-appPrimary',
      text: isMonth ? 'text-white' : 'text-white',
      shadow: 'shadow-appPrimary',
    },
    red: {
      bg: isMonth ? 'bg-red-100' : 'bg-red-100 border-red-300',
      border: isMonth ? 'border-l-red-500' : 'border-l-red-500',
      text: isMonth ? 'text-red-700' : 'text-red-800',
      shadow: 'shadow-red-100',
    },
    green: {
      bg: isMonth ? 'bg-green-100' : 'bg-green-100 border-green-300',
      border: isMonth ? 'border-l-green-500' : 'border-l-green-500',
      text: isMonth ? 'text-green-700' : 'text-green-800',
      shadow: 'shadow-green-100',
    },
    purple: {
      bg: isMonth ? 'bg-purple-100' : 'bg-purple-100 border-purple-300',
      border: isMonth ? 'border-l-purple-500' : 'border-l-purple-500',
      text: isMonth ? 'text-purple-700' : 'text-purple-800',
      shadow: 'shadow-purple-100',
    },
    pink: {
      bg: isMonth ? 'bg-pink-100' : 'bg-pink-100 border-pink-300',
      border: isMonth ? 'border-l-pink-500' : 'border-l-pink-500',
      text: isMonth ? 'text-pink-700' : 'text-pink-800',
      shadow: 'shadow-pink-100',
    },
    orange: {
      bg: isMonth ? 'bg-orange-100' : 'bg-orange-100 border-orange-300',
      border: isMonth ? 'border-l-orange-500' : 'border-l-orange-500',
      text: isMonth ? 'text-orange-700' : 'text-orange-800',
      shadow: 'shadow-orange-100',
    },
    yellow: {
      bg: isMonth ? 'bg-yellow-100' : 'bg-yellow-100 border-yellow-300',
      border: isMonth ? 'border-l-yellow-500' : 'border-l-yellow-500',
      text: isMonth ? 'text-yellow-700' : 'text-yellow-800',
      shadow: 'shadow-yellow-100',
    },
    indigo: {
      bg: isMonth ? 'bg-indigo-100' : 'bg-indigo-100 border-indigo-300',
      border: isMonth ? 'border-l-indigo-500' : 'border-l-indigo-500',
      text: isMonth ? 'text-indigo-700' : 'text-indigo-800',
      shadow: 'shadow-indigo-100',
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
  const style = month ? { zIndex: 1 } : calculateEventPosition(event, events);
  const eventStyles = getEventStyles(event.color, month);

  // Generate a unique key that includes the current month to prevent animation conflicts
  const isEventInCurrentMonth = isSameMonth(event.start, date);
  const animationKey = `${event.id}-${
    isEventInCurrentMonth ? 'current' : 'adjacent'
  }`;

  // Safety check for event data
  const safeTitle = event.title || 'Untitled Event';
  const safeStart = event.start || new Date();
  const safeEnd = event.end || new Date();

  if (month) {
    // Month view styling - compact format with proper truncation
    return (
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait">
          <motion.div
            className={clsxm(
              'px-1.5 lg:px-2 py-0.5 lg:py-1 rounded text-[10px] lg:text-xs cursor-pointer transition-all duration-200 border-l-2 mb-0.5 lg:mb-1',
              eventStyles.bg,
              eventStyles.border,
              eventStyles.text,
              'hover:shadow-sm',
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
                ease: 'easeOut',
              },
            }}
            transition={{
              duration: 0.2,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            layoutId={`event-${animationKey}-month`}
          >
            <div className="flex items-center justify-between min-w-0">
              <span
                className="font-medium truncate mr-1 flex-1 min-w-0 text-[10px] sm:text-xs"
                title={safeTitle} // Show full title on hover
              >
                {/* Show abbreviated title on very small screens */}
                <span className="hidden sm:inline">{safeTitle}</span>
                <span className="sm:hidden">
                  {safeTitle.length > 6
                    ? `${safeTitle.substring(0, 6)}...`
                    : safeTitle}
                </span>
              </span>
              <span className="text-[10px] sm:text-xs opacity-80 flex-shrink-0">
                {format(safeStart, 'h:mm')}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </MotionConfig>
    );
  }

  // Week/Day view styling - improved format with better truncation and responsive design
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          className={clsxm(
            'px-1 sm:px-1.5 lg:px-2 py-1 lg:py-1.5 rounded-lg cursor-pointer transition-all duration-200 border border-l-4',
            eventStyles.bg,
            eventStyles.border,
            eventStyles.text,
            eventStyles.shadow,
            'hover:shadow-md hover:scale-[1.02] hover:brightness-105',
            'absolute overflow-hidden backdrop-blur-sm min-w-0',
            className
          )}
          style={{
            ...style,
            zIndex: style.zIndex,
          }}
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
              ease: 'easeOut',
            },
          }}
          transition={{
            duration: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
            opacity: {
              duration: 0.2,
              ease: 'linear',
            },
            layout: {
              duration: 0.2,
              ease: 'easeOut',
            },
          }}
          layoutId={`event-${animationKey}-day`}
        >
          <motion.div
            className="flex items-center justify-between w-full h-full min-w-0 px-1"
            layout="position"
          >
            {/* Title with smart responsive display */}
            <span
              className="font-semibold truncate mr-1 flex-1 min-w-0 text-xs sm:text-sm"
              title={safeTitle} // Show full title on hover
            >
              {/* Show abbreviated title on very small screens */}
              <span className="hidden sm:inline">{safeTitle}</span>
              <span className="sm:hidden">
                {safeTitle.length > 8
                  ? `${safeTitle.substring(0, 8)}...`
                  : safeTitle}
              </span>
            </span>

            {/* Time display - responsive */}
            <span className="text-[10px] sm:text-xs opacity-75 flex-shrink-0 whitespace-nowrap">
              {/* Mobile: show shorter time format */}
              <span className="sm:hidden">
                {format(safeStart, 'h:mm')}-{format(safeEnd, 'h:mm')}
              </span>
              {/* Desktop: show full time format */}
              <span className="hidden sm:inline">
                {format(safeStart, 'h:mm a')} - {format(safeEnd, 'h:mm a')}
              </span>
            </span>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
