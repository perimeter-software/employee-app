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

// Check if two events overlap in time and are on the same day
function eventsOverlap(event1: CalendarEventType, event2: CalendarEventType): boolean {
  if (event1.id === event2.id) return false;
  
  // Check if events are on the same day
  if (!isSameDay(event1.start, event2.start)) return false;
  
  // Check if events overlap in time
  // Two events overlap if: event1.start < event2.end AND event1.end > event2.start
  return (
    event1.start < event2.end &&
    event1.end > event2.start
  );
}

// Find all events that overlap with the current event, including transitive overlaps
// This ensures that if A overlaps B, and B overlaps C, then A, B, and C are all grouped together
function getOverlappingEvents(
  currentEvent: CalendarEventType,
  events: CalendarEventType[]
): CalendarEventType[] {
  const result: CalendarEventType[] = [];
  const visited = new Set<string>();
  const queue: CalendarEventType[] = [currentEvent];
  visited.add(currentEvent.id);
  
  // Use BFS to find all connected overlapping events
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Check all events to find ones that overlap with current
    for (const event of events) {
      if (visited.has(event.id)) continue;
      
      if (eventsOverlap(current, event)) {
        result.push(event);
        visited.add(event.id);
        queue.push(event); // Add to queue to find events that overlap with this one
      }
    }
  }
  
  return result;
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
  // Show a few visible events, then use overflow dropdown for the rest
  // Week view: 2 columns for readability
  // Day view: 3 columns, then overflow dropdown for the rest
  const MAX_VISIBLE_COLUMNS = isWeekView ? 2 : 3; // Show 2-3 visible events, rest in dropdown
  const COLUMN_GAP_PERCENT = isWeekView ? 1.5 : 1; // Gap between columns
  const BASE_LEFT_PERCENT = isWeekView ? 0.5 : 1; // Minimal margin
  const MIN_COLUMN_WIDTH_PERCENT = isWeekView ? 48 : 30; // Reasonable width for day view events

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

    // Calculate overflow count: total events minus visible columns
    const hiddenCount = Math.max(0, totalEvents - MAX_VISIBLE_COLUMNS);
    // Show overflow badge on the first visible event (position 0) if there are hidden events
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
  // For week view, ensure minimum height for readability (at least 50px for text and time)
  const minHeight = isWeekView ? 50 : 40;
  const height = Math.max((duration / 60) * 128, minHeight);

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
  const { events, setSelectedEvent, setManageEventDialogOpen, date, mode, onOverflowClick } =
    useCalendarContext();
  const isWeekView = mode === 'week';
  
  // Memoize expensive calculations
  const style = useMemo(() => {
    return month ? { zIndex: 1 } : calculateEventPosition(event, events, isWeekView);
  }, [month, event, events, isWeekView]);

  // Get all overlapping events for overflow dropdown (including hidden ones)
  // Use the same transitive grouping logic to ensure all connected events are included
  const allOverlappingEvents = useMemo(() => {
    if (month) return [];
    // Use the same getOverlappingEvents function to ensure consistency
    return getOverlappingEvents(event, events);
  }, [month, event, events]);
  
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
                ? 'px-2.5 py-1.5 rounded-lg cursor-pointer transition-all duration-200 border border-l-4'
                : 'px-2 sm:px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-lg cursor-pointer transition-all duration-200 border border-l-4',
              futureStyles ? futureStyles.bg : eventStyles.bg,
              futureStyles ? futureStyles.border : eventStyles.border,
              futureStyles ? futureStyles.text : eventStyles.text,
              futureStyles ? futureStyles.shadow : eventStyles.shadow,
              'hover:shadow-md hover:scale-[1.01] hover:brightness-105',
              'absolute overflow-visible backdrop-blur-sm',
              className
            )}
          style={{
            ...style,
            zIndex: style.zIndex, // Calendar events have z-index 1-4, dropdown will be 9999
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
            className={`flex flex-col w-full h-full min-w-0 relative ${weekViewContext ? 'gap-0.5' : 'px-2 py-1 gap-1'} ${!!(style as EventPosition).overflowCount ? 'pt-4' : ''}`}
            layout="position"
          >
            {/* Overflow badge when many overlapping events exist - positioned at top-right, outside content flow */}
            {!!(style as EventPosition).overflowCount && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOverflowClick) {
                    // Include the current event and all overlapping events
                    // Sort by start time for consistent ordering
                    const allEvents = [event, ...allOverlappingEvents].sort(
                      (a, b) => a.start.getTime() - b.start.getTime()
                    );
                    onOverflowClick(event, allEvents, e.nativeEvent);
                  }
                }}
                className="absolute top-0 right-0 text-[9px] leading-tight px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-sm text-white font-semibold z-[9997] shadow-sm hover:bg-black/60 transition-colors cursor-pointer"
                style={{ zIndex: 9997 }}
              >
                +{(style as EventPosition).overflowCount}
              </button>
            )}

            {/* Event content with avatar */}
            <div className={`flex items-start gap-1.5 w-full min-w-0 ${weekViewContext ? 'flex-row' : 'flex-row'}`}>
              {/* Avatar */}
              {event.profileImg && (
                <Avatar className={`${weekViewContext ? 'h-5 w-5 flex-shrink-0' : 'h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0'}`}>
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
                <Avatar className={`${weekViewContext ? 'h-5 w-5 flex-shrink-0' : 'h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0'}`}>
                  <div className={`h-full w-full bg-gray-200 flex items-center justify-center text-gray-500 ${weekViewContext ? 'text-[10px]' : 'text-[10px] sm:text-xs'} font-medium`}>
                    {event.firstName[0]}
                    {event.lastName[0]}
                  </div>
                </Avatar>
              )}
              
              {/* Name and time - stacked vertically in week view for better space usage */}
              <div className={`flex flex-col min-w-0 flex-1 ${weekViewContext ? 'gap-0' : 'gap-0.5'}`}>
                {/* Title - allow wrapping in week view */}
                <span
                  className={`font-semibold ${weekViewContext ? 'text-xs leading-tight break-words' : 'text-xs sm:text-sm leading-tight truncate'} block min-w-0`}
                  title={safeTitle}
                  style={weekViewContext ? { wordBreak: 'break-word', overflowWrap: 'break-word' } : {}}
                >
                  {safeTitle}
                </span>

                {/* Time display - smaller and on separate line */}
                <span className={`${weekViewContext ? 'text-[9px] leading-tight' : 'text-[10px] sm:text-xs leading-tight'} opacity-90 font-medium`}>
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
