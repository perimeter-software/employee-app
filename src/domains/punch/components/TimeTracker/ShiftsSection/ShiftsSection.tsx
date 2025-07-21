'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import { CalendarEvent, Mode } from '@/components/ui/Calendar';
import CalendarProvider from '@/components/ui/Calendar/CalendarProvider';
import Calendar from '@/components/ui/Calendar/Calendar';
import { useCalendarContext } from '@/components/ui/Calendar/CalendarContext';
import { ShiftsTable } from './ShiftsTable';
import { ShiftDetailsModal } from '../ShiftDetailsModal';
import type { GignologyUser } from '@/domains/user/types';
import type { PunchWithJobInfo } from '@/domains/punch/types';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import { clsxm } from '@/lib/utils';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { startOfWeek, endOfWeek } from 'date-fns';

interface ShiftsSectionProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  allPunches?: PunchWithJobInfo[] | undefined;
  punchesLoading?: boolean;
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  onViewTypeChange?: (viewType: 'table' | 'calendar') => void;
  onDateNavigation?: (direction: number) => void;
  currentViewType?: 'table' | 'calendar';
}

// Enhanced CalendarEvent interface for shift data
interface ShiftCalendarEvent extends CalendarEvent {
  punchData?: PunchWithJobInfo;
  jobData?: GignologyJob;
  shiftData?: Shift;
  status: 'active' | 'completed' | 'scheduled' | 'missed';
  totalHours?: number;
  punchCount?: number;
  allPunches?: PunchWithJobInfo[];
}

// Creates INDIVIDUAL events for each punch (no grouping)
const generateShiftEvents = (
  userData: GignologyUser,
  startDate: Date,
  endDate: Date,
  allPunches?: PunchWithJobInfo[]
): ShiftCalendarEvent[] => {
  if (!userData?.jobs || !allPunches?.length) return [];

  const events: ShiftCalendarEvent[] = [];

  // Create a separate event for EACH punch - NO GROUPING
  allPunches.forEach((punch) => {
    const punchStart = new Date(punch.timeIn);

    // Only include punches within our date range
    if (punchStart >= startDate && punchStart <= endDate) {
      const job = userData.jobs?.find((j) => j._id === punch.jobId);
      if (!job) return;

      const shift = job.shifts?.find((s) => s.slug === punch.shiftSlug);
      const shiftName =
        punch.shiftName ||
        shift?.shiftName ||
        punch.shiftSlug ||
        'Unknown Shift';

      // Calculate working time for this specific punch
      let totalWorkingMinutes = 0;
      let status: 'active' | 'completed' | 'scheduled' | 'missed';
      let color: string;
      let punchEnd: Date;

      if (punch.timeOut) {
        // Completed punch
        punchEnd = new Date(punch.timeOut);
        totalWorkingMinutes =
          (punchEnd.getTime() - punchStart.getTime()) / (1000 * 60);
        color = 'blue';
        status = 'completed';
      } else {
        // Active punch - use current time as end
        punchEnd = new Date();
        totalWorkingMinutes =
          (punchEnd.getTime() - punchStart.getTime()) / (1000 * 60);
        color = 'green';
        status = 'active';
      }

      const totalHours = Math.round((totalWorkingMinutes / 60) * 100) / 100;

      // Create individual event for each punch with unique ID
      events.push({
        id: `punch-${punch._id}`, // Use actual punch ID for modal
        title: `${job.title} - ${shiftName}`,
        // Optional: Add time info to title
        // title: `${job.title} - ${shiftName} (${startTime}-${endTime})`,
        color,
        start: punchStart,
        end: punchEnd,
        punchData: punch, // This will have the correct punch ID
        jobData: job,
        shiftData: shift,
        status,
        totalHours,
        punchCount: 1, // Each event represents exactly 1 punch
        allPunches: [punch], // Each event contains only this specific punch
      });
    }
  });

  return events;
};

// Component that listens to calendar context for event selections
const CalendarEventHandler = ({
  shiftEvents,
  onShiftClick,
}: {
  shiftEvents: ShiftCalendarEvent[];
  onShiftClick: (shiftEvent: ShiftCalendarEvent) => void;
}) => {
  const { selectedEvent, manageEventDialogOpen, setManageEventDialogOpen } =
    useCalendarContext();

  useEffect(() => {
    // When calendar selects an event and opens the dialog
    if (selectedEvent && manageEventDialogOpen) {
      // Find the corresponding shift event
      const shiftEvent = shiftEvents.find(
        (event) => event.id === selectedEvent.id
      );

      if (shiftEvent) {
        // Close the calendar's default dialog
        setManageEventDialogOpen(false);

        // Open our custom shift modal
        onShiftClick(shiftEvent);
      }
    }
  }, [
    selectedEvent,
    manageEventDialogOpen,
    shiftEvents,
    onShiftClick,
    setManageEventDialogOpen,
  ]);

  return null; // This component doesn't render anything
};

export function ShiftsSection({
  userData,
  openPunches,
  allPunches,
  punchesLoading,
  dateRange: propDateRange,
  onViewTypeChange,
  onDateNavigation,
  currentViewType: parentViewType,
}: ShiftsSectionProps) {
  // Get company work week settings
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();

  // Use parent's view type if provided, otherwise use local state
  const [localViewType, setLocalViewType] = useState<'table' | 'calendar'>(
    'table'
  );
  const viewType = parentViewType || localViewType;

  // Initialize currentDate to start of current week based on company work week settings
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: weekStartsOn || 0 });
  });
  const [mode, setMode] = useState<Mode>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: weekStartsOn || 0 });
  });

  // Shift Details Modal State
  const [selectedShift, setSelectedShift] = useState<ShiftCalendarEvent | null>(
    null
  );
  const [showShiftModal, setShowShiftModal] = useState(false);

  // Query client for data refresh
  const queryClient = useQueryClient();

  // Update dates when company work week settings change
  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      const now = new Date();
      const newStartDate = startOfWeek(now, { weekStartsOn });
      setCurrentDate(newStartDate);
      setCalendarDate(newStartDate);
    }
  }, [weekStartsOn, companyLoading]);

  // Handle view type change
  const handleViewTypeChange = (newViewType: 'table' | 'calendar') => {
    // Update local state if not controlled by parent
    if (!parentViewType) {
      setLocalViewType(newViewType);
    }

    // Notify parent component about the view change
    if (onViewTypeChange) {
      onViewTypeChange(newViewType);
    }
  };

  // UNIFIED DATE RANGE LOGIC - Use the same date range for both views
  const dateRange = useMemo(() => {
    // If date range is provided from parent, use it (this comes from TimeTrackerContainer)
    if (propDateRange) {
      return {
        startDate: new Date(propDateRange.startDate),
        endDate: new Date(propDateRange.endDate),
        displayRange: `${new Date(propDateRange.startDate).toLocaleDateString(
          'en-US',
          {
            month: 'long',
            day: 'numeric',
          }
        )} - ${new Date(propDateRange.endDate).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}`,
      };
    }

    // Fallback: Use weekly range based on currentDate with company work week settings
    const baseDate = new Date(currentDate);
    const weekStart = startOfWeek(baseDate, {
      weekStartsOn: weekStartsOn || 0,
    });
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = endOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
    weekEnd.setHours(23, 59, 59, 999);

    return {
      startDate: weekStart,
      endDate: weekEnd,
      displayRange: `${weekStart.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      })} - ${weekEnd.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}`,
    };
  }, [propDateRange, currentDate, weekStartsOn]);

  // Generate calendar events from shift data using the SAME date range
  const shiftEvents = useMemo(() => {
    return generateShiftEvents(
      userData,
      dateRange.startDate,
      dateRange.endDate,
      allPunches
    );
  }, [userData, dateRange.startDate, dateRange.endDate, allPunches]);

  // Convert to regular CalendarEvent for the calendar component
  const calendarEvents = useMemo(() => {
    return shiftEvents.map((event) => ({
      id: event.id,
      title: event.title,
      color: event.color,
      start: event.start,
      end: event.end,
    }));
  }, [shiftEvents]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);

  // Update calendar events when shift events change
  useEffect(() => {
    setEvents(calendarEvents);
  }, [calendarEvents]);

  // Handle data refresh after successful operations
  const handleDataRefresh = () => {
    // Invalidate punch queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['punch'] });
    queryClient.invalidateQueries({ queryKey: ['punches'] });
  };

  const navigateDateRange = (direction: number) => {
    if (onDateNavigation) {
      // Use parent's navigation handler
      onDateNavigation(direction);
    } else {
      // Fallback to local navigation
      const newDate = new Date(currentDate);
      if (viewType === 'table') {
        newDate.setDate(newDate.getDate() + direction * 7);
      } else {
        newDate.setMonth(newDate.getMonth() + direction);
      }
      setCurrentDate(newDate);
      setCalendarDate(newDate);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardContent className="p-3 sm:p-4 lg:p-6">
          {/* Header - Mobile-First Clean Layout */}
          <div className="mb-6">
            {/* Mobile: Stacked Layout, Desktop: Single Row */}
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center justify-between sm:space-y-0">
              {/* Title */}
              <h2 className="text-xl lg:text-2xl font-semibold text-gray-900">
                Employee Shifts
              </h2>

              {/* View Toggle - Compact for mobile with better active state */}
              <ToggleGroup
                type="single"
                value={viewType}
                onValueChange={(value) => {
                  if (value) {
                    handleViewTypeChange(value as 'table' | 'calendar');
                  }
                }}
                className="inline-flex rounded-lg border border-gray-30 p-1 self-start sm:self-auto shadow-sm"
              >
                <ToggleGroupItem
                  value="table"
                  className={clsxm(
                    'rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                    viewType === 'table' &&
                      'bg-appPrimary text-white shadow-md',
                    viewType === 'calendar' &&
                      'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  )}
                >
                  Table
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="calendar"
                  className={clsxm(
                    'rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                    viewType === 'calendar' &&
                      'bg-appPrimary text-white shadow-md',
                    viewType === 'table' &&
                      'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  )}
                >
                  Calendar
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Controls Row - Full width on mobile, left-aligned on desktop */}
            <div className="mt-4 flex justify-center">
              {/* Date Navigation for Table View */}
              {viewType === 'table' && (
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <Button
                    variant="outline"
                    className="h-8 w-8 p-1 flex-shrink-0"
                    onClick={() => navigateDateRange(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <span className="text-center font-medium text-sm sm:text-base min-w-0 px-2">
                    {dateRange.displayRange}
                  </span>

                  <Button
                    variant="outline"
                    className="h-8 w-8 p-1 flex-shrink-0"
                    onClick={() => navigateDateRange(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Content - Mobile Responsive */}
          {viewType === 'calendar' ? (
            companyLoading ? (
              <div className="flex items-center justify-center min-h-[500px]">
                <div className="text-gray-500">Loading calendar...</div>
              </div>
            ) : (
              <CalendarProvider
                events={events}
                setEvents={setEvents}
                mode={mode}
                setMode={setMode}
                date={calendarDate}
                setDate={setCalendarDate}
                calendarIconIsToday={false}
                weekStartsOn={weekStartsOn || 0}
              >
                <div className="space-y-4">
                  {/* Complete Calendar Component with sticky headers */}
                  <div className="border rounded-lg bg-white shadow-sm min-h-[500px]">
                    <Calendar />
                  </div>
                </div>

                <CalendarEventHandler
                  shiftEvents={shiftEvents}
                  onShiftClick={(shiftEvent) => {
                    setSelectedShift(shiftEvent);
                    setShowShiftModal(true);
                  }}
                />
              </CalendarProvider>
            )
          ) : (
            /* Table view remains the same */
            <div className="overflow-x-auto -mx-3 sm:-mx-4 lg:-mx-6">
              <div className="min-w-full px-3 sm:px-4 lg:px-6">
                <ShiftsTable
                  userData={userData}
                  openPunches={openPunches}
                  allPunches={allPunches}
                  punchesLoading={punchesLoading}
                  dateRange={{
                    startDate: dateRange.startDate.toISOString(),
                    endDate: dateRange.endDate.toISOString(),
                    displayRange: dateRange.displayRange,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shift Details Modal - Mobile Responsive */}
      <ShiftDetailsModal
        isOpen={showShiftModal}
        onClose={() => {
          setShowShiftModal(false);
          setSelectedShift(null);
        }}
        shiftEvent={selectedShift}
        userData={{
          _id: userData._id,
          applicantId: userData.applicantId,
          userType: userData.userType,
        }}
        onSuccess={handleDataRefresh}
      />
    </>
  );
}
