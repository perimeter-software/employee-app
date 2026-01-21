import { CalendarEvent as CalendarEventType } from './types';
import { useCalendarContext } from './CalendarContext';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { clsxm } from '@/lib/utils';
import { motion, MotionConfig, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { useMemo, memo } from 'react';

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
  zIndex: number;
  hidden?: boolean;
  overflowCount?: number;
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
  allEvents: CalendarEventType[],
  isWeekView: boolean = false
): EventPosition {
  const overlappingEvents = getOverlappingEvents(event, allEvents);
  const group = [event, ...overlappingEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const position = group.indexOf(event);

  // Improved overlap handling - use column-based layout for better readability
  const totalEvents = overlappingEvents.length + 1;
  let width: string;
  let left: string;
  let zIndex: number;
  let hidden: boolean | undefined;
  let overflowCount: number | undefined;

  // When many events overlap, use a column-based layout instead of cramped stacking
  // Week view has narrower columns, so prioritize readability over showing many columns
  const MAX_VISIBLE_COLUMNS = isWeekView ? 2 : 4; // Only 2 columns in week view for better readability
  const COLUMN_GAP_PERCENT = isWeekView ? 0.3 : 1; // Minimal gap in week view
  const BASE_LEFT_PERCENT = isWeekView ? 0.3 : 2; // Minimal margin in week view
  const MIN_COLUMN_WIDTH_PERCENT = isWeekView ? 48 : 20; // Very high minimum in week view (48% per column) to ensure readability

  if (totalEvents === 1) {
    // Single event takes full width
    width = isWeekView ? 'calc(100% - 2px)' : 'calc(100% - 16px)';
    left = isWeekView ? '1px' : '8px';
    zIndex = 1;
  } else {
    // Multiple events - use column-based layout with better spacing
    const visiblePosition = Math.min(position, MAX_VISIBLE_COLUMNS - 1);
    
    // Hide events beyond the visible columns
    if (position >= MAX_VISIBLE_COLUMNS) {
      hidden = true;
    }

    // Calculate column width based on available space and number of columns
    const effectiveColumns = Math.min(totalEvents, MAX_VISIBLE_COLUMNS);
    const totalGapPercent = (effectiveColumns - 1) * COLUMN_GAP_PERCENT;
    const totalMarginPercent = BASE_LEFT_PERCENT * 2;
    const availableWidthPercent = 100 - totalMarginPercent - totalGapPercent;
    
    // Calculate width per column, ensuring minimum readability
    // For week view, prioritize readability over showing more columns
    const columnWidthPercent = Math.max(
      availableWidthPercent / effectiveColumns,
      MIN_COLUMN_WIDTH_PERCENT
    );
    
    width = `${columnWidthPercent}%`;
    
    // Calculate left position based on column (percentage-based for better responsiveness)
    const leftPercent = BASE_LEFT_PERCENT + 
                       visiblePosition * (columnWidthPercent + COLUMN_GAP_PERCENT);
    left = `${leftPercent}%`;
    
    zIndex = MAX_VISIBLE_COLUMNS - visiblePosition; // Higher z-index for leftmost columns

    const hiddenCount = Math.max(0, totalEvents - MAX_VISIBLE_COLUMNS);
    if (hiddenCount > 0 && position === 0) {
      overflowCount = hiddenCount;
    }
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
    hidden,
    overflowCount,
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

const CalendarEvent = memo(function CalendarEvent({
  event,
  month = false,
  className,
}: {
  event: CalendarEventType;
  month?: boolean;
  className?: string;
}) {
  const { events, setSelectedEvent, setManageEventDialogOpen, date, mode } =
    useCalendarContext();
  const isWeekView = mode === 'week';
  
  // Memoize expensive calculations
  const style = useMemo(() => {
    return month ? { zIndex: 1 } : calculateEventPosition(event, events, isWeekView);
  }, [month, event, events, isWeekView]);
  
  const eventStyles = useMemo(() => getEventStyles(event.color, month), [event.color, month]);
  
  // Store isWeekView for use in the render section
  const weekViewContext = isWeekView;
  
  // Override styles for future events to use light blue background
  const isFuture = useMemo(() => {
    return event.isFuture || new Date(event.start).getTime() > Date.now();
  }, [event.isFuture, event.start]);
  
  const futureStyles = useMemo(() => {
    return isFuture ? {
      bg: month ? 'bg-blue-50' : 'bg-blue-50 border-blue-200',
      border: month ? 'border-l-blue-300' : 'border-l-blue-300',
      text: month ? 'text-blue-700' : 'text-blue-800',
      shadow: 'shadow-blue-50',
    } : null;
  }, [isFuture, month]);

  // Generate a unique key that includes the current month to prevent animation conflicts
  const isEventInCurrentMonth = useMemo(() => isSameMonth(event.start, date), [event.start, date]);
  const animationKey = useMemo(() => `${event.id}-${
    isEventInCurrentMonth ? 'current' : 'adjacent'
  }`, [event.id, isEventInCurrentMonth]);

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
              futureStyles ? futureStyles.bg : eventStyles.bg,
              futureStyles ? futureStyles.border : eventStyles.border,
              futureStyles ? futureStyles.text : eventStyles.text,
              'hover:shadow-sm',
              className
            )}
            onClick={(e) => {
              e.stopPropagation();
              console.log('🖱️ CalendarEvent (month view) clicked:', {
                eventId: event.id,
                eventTitle: event.title,
              });
              setSelectedEvent(event);
              setManageEventDialogOpen(true);
              console.log('✅ CalendarEvent (month): setSelectedEvent and setManageEventDialogOpen called');
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

  // If this event is part of a large overlap group, we may hide it to prevent slivers
  if (!month && (style as EventPosition).hidden) {
    return null;
  }

  // Week/Day view styling - improved format with better truncation and responsive design
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
          <motion.div
            className={clsxm(
              weekViewContext 
                ? 'px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 border border-l-4'
                : 'px-2 sm:px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-lg cursor-pointer transition-all duration-200 border border-l-4',
              futureStyles ? futureStyles.bg : eventStyles.bg,
              futureStyles ? futureStyles.border : eventStyles.border,
              futureStyles ? futureStyles.text : eventStyles.text,
              futureStyles ? futureStyles.shadow : eventStyles.shadow,
              'hover:shadow-md hover:scale-[1.01] hover:brightness-105',
              'absolute overflow-hidden backdrop-blur-sm min-w-0',
              className
            )}
          style={{
            ...style,
            zIndex: style.zIndex,
          }}
          onClick={(e) => {
            e.stopPropagation();
            console.log('🖱️ CalendarEvent clicked:', {
              eventId: event.id,
              eventTitle: event.title,
            });
            setSelectedEvent(event);
            setManageEventDialogOpen(true);
            console.log('✅ CalendarEvent: setSelectedEvent and setManageEventDialogOpen called');
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
            className={`flex flex-col w-full h-full min-w-0 relative ${weekViewContext ? 'px-2.5 py-1.5 gap-1.5' : 'px-2 py-1 gap-1'} ${!!(style as EventPosition).overflowCount ? 'pt-4' : ''}`}
            layout="position"
          >
            {/* Overflow badge when many overlapping events exist - positioned at top-right, outside content flow */}
            {!!(style as EventPosition).overflowCount && (
              <span className="absolute top-0 right-0 text-[9px] leading-tight px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white font-semibold z-10 pointer-events-none shadow-sm">
                +{(style as EventPosition).overflowCount}
              </span>
            )}

            {/* Event content with avatar */}
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Avatar */}
              {event.profileImg && (
                <Avatar className={`${weekViewContext ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6'} flex-shrink-0`}>
                  <Image
                    src={event.profileImg}
                    alt={event.title}
                    width={24}
                    height={24}
                    className="h-full w-full object-cover"
                  />
                </Avatar>
              )}
              {!event.profileImg && event.firstName && event.lastName && (
                <Avatar className={`${weekViewContext ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6'} flex-shrink-0`}>
                  <div className={`h-full w-full bg-gray-200 flex items-center justify-center text-gray-500 ${weekViewContext ? 'text-xs' : 'text-[10px] sm:text-xs'} font-medium`}>
                    {event.firstName[0]}
                    {event.lastName[0]}
                  </div>
                </Avatar>
              )}
              {/* Title and time */}
              <div className="flex-1 min-w-0">
                {/* Title with smart responsive display */}
                <span
                  className={`font-semibold truncate ${weekViewContext ? 'text-sm leading-snug' : 'text-xs sm:text-sm leading-tight'} block`}
                  title={safeTitle} // Show full title on hover
                >
                  {safeTitle}
                </span>

                {/* Time display - responsive, always visible */}
                <span className={`${weekViewContext ? 'text-xs leading-snug' : 'text-[10px] sm:text-xs leading-tight'} opacity-90 font-medium`}>
                  {format(safeStart, 'h:mm a')} - {format(safeEnd, 'h:mm a')}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
});

export default CalendarEvent;
