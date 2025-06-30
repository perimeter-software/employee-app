import { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClockInValidationModal } from '../ClockInValidationModal';
import { Clock, MapPin } from 'lucide-react';

// Import your existing hook and utilities
import { useTimerCard } from '@/domains/punch/hooks';
import { useFindPunches } from '@/domains/punch/hooks';
import type { PunchWithJobInfo } from '@/domains/punch/types';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import type { GignologyUser } from '@/domains/user/types';
import {
  jobHasShiftForUser,
  handleShiftJobClockInTime,
  isJobGeoFenced,
  isUserInRoster,
} from '@/domains/punch/utils/shift-job-utils';

interface ShiftRowData extends Record<string, unknown> {
  date: string;
  dateObj: Date;
  jobId: string;
  jobTitle: string;
  job: GignologyJob;
  shift: Shift;
  shiftName: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  punches: Array<{
    id: string;
    timeIn: string;
    timeOut: string | null;
    status: 'active' | 'completed';
  }>;
  canClockIn: boolean;
  canClockOut: boolean;
  allowBreaks: boolean;
  isWithinShift: boolean;
  hasActivePunch: boolean;
  isToday: boolean;
  shiftHasEnded: boolean;
  isSelectedShift: boolean;
  isCurrentOpenPunchShift: boolean;
}

interface ShiftsTableProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  allPunches?: PunchWithJobInfo[] | undefined;
  punchesLoading?: boolean;
  dateRange: {
    startDate: string;
    endDate: string;
    displayRange: string;
  };
}

// Helper functions to replace date-fns
const formatDate = (date: Date, format: string) => {
  if (format === 'MM/dd/yyyy') {
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
      .getDate()
      .toString()
      .padStart(2, '0')}/${date.getFullYear()}`;
  }
  if (format === 'hh:mm a') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  return date.toLocaleDateString();
};

const isSameDay = (date1: Date, date2: Date) => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

// Helper function to format time
const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export function ShiftsTable({
  userData,
  openPunches,
  allPunches: propAllPunches,
  punchesLoading: propPunchesLoading,
  dateRange,
}: ShiftsTableProps) {
  // Use the existing useTimerCard hook for all state management and logic
  const {
    // State we need for the table
    loading,
    selectedJob,
    selectedShift,

    // Validation state
    validationMessages,
    showValidationModal,

    // Handlers we can reuse - REMOVED: handleJobSelection, handleShiftSelection
    handleClockInOut,
    cancelClockIn,
    performClockIn,
  } = useTimerCard({ userData, openPunches });

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    return userData?.jobs?.map((job) => job._id) || [];
  }, [userData?.jobs]);

  // Use useFindPunches to get all punches for the date range
  const {
    data: fetchedAllPunches,
    isLoading: fetchedPunchesLoading,
    error: punchesError,
  } = useFindPunches({
    userId: userData._id || '',
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Use props if provided, otherwise use fetched data
  const allPunches = propAllPunches || fetchedAllPunches;
  const punchesLoading = propPunchesLoading ?? fetchedPunchesLoading;

  // Parse date range to get start and end dates
  const { startDate, endDate } = useMemo(() => {
    return {
      startDate: new Date(dateRange.startDate),
      endDate: new Date(dateRange.endDate),
    };
  }, [dateRange]);

  // Enhanced clock in handler that works with specific shifts
  const handleShiftClockIn = useCallback(
    async (shiftData: ShiftRowData) => {
      // Call handleClockInOut with the specific job and shift
      // This completely bypasses state management timing issues
      await handleClockInOut(shiftData.job, shiftData.shift);
    },
    [handleClockInOut]
  );

  // Enhanced clock out handler
  const handleShiftClockOut = useCallback(
    async (shiftData: ShiftRowData) => {
      if (!shiftData.hasActivePunch) {
        console.error('No active punch to clock out');
        return;
      }

      // For clock out, we can directly use the existing handler
      await handleClockInOut();
    },
    [handleClockInOut]
  );

  // FIXED: Generate shift rows from user data - now shows ALL scheduled shifts AND existing punches
  const shiftRows = useMemo((): ShiftRowData[] => {
    if (!userData?.jobs) return [];

    const rows: ShiftRowData[] = [];
    const now = new Date();

    // Track processed shift-date combinations to avoid duplicates
    const processedShifts = new Set<string>();

    // FIXED: Generate dates for the ENTIRE date range, not just punch days
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ][currentDate.getDay()];

      const isToday = isSameDay(currentDate, now);

      userData.jobs.forEach((job: GignologyJob) => {
        // FIXED: Check if user has ANY shifts for this job
        if (!job.shifts || !jobHasShiftForUser(job, userData.applicantId)) {
          return;
        }

        job.shifts.forEach((shift: Shift) => {
          const shiftKey = `${job._id}-${shift.slug}-${formatDate(currentDate, 'MM/dd/yyyy')}`;

          // Skip if we already processed this shift for this date
          if (processedShifts.has(shiftKey)) {
            return;
          }

          // Find punches for this job and date from allPunches
          const todayPunches = (allPunches || [])
            .filter(
              (punch) =>
                punch.jobId === job._id &&
                (punch.shiftSlug === shift.slug ||
                  punch.shiftName === shift.shiftName) &&
                isSameDay(new Date(punch.timeIn), currentDate)
            )
            .map((punch) => ({
              id: punch._id,
              timeIn: punch.timeIn,
              timeOut: punch.timeOut,
              status: punch.timeOut
                ? ('completed' as const)
                : ('active' as const),
            }));

          // FIXED: Check if user is in shift roster
          const isUserInShiftRoster = shift.shiftRoster?.some(
            (rosterEntry) => rosterEntry._id === userData.applicantId
          );

          // FIXED: If user has existing punches for this shift-date, show it regardless of roster
          const hasExistingPunches = todayPunches.length > 0;

          // Skip if user is not in roster AND has no existing punches
          if (!isUserInShiftRoster && !hasExistingPunches) {
            return;
          }

          // Mark this shift-date as processed
          processedShifts.add(shiftKey);

          // Get day schedule for this specific day (only if user is in roster)
          let daySchedule:
            | Shift['defaultSchedule'][keyof Shift['defaultSchedule']]
            | undefined = undefined;
          let isInDayRoster = false;

          if (isUserInShiftRoster) {
            daySchedule =
              shift.defaultSchedule?.[
                dayOfWeek as keyof typeof shift.defaultSchedule
              ];

            // Check if user is in roster for this specific day
            isInDayRoster =
              !daySchedule?.roster?.length ||
              isUserInRoster(
                daySchedule.roster,
                userData.applicantId,
                currentDate.toISOString()
              );
          }

          // For existing punches without roster enrollment, we'll estimate shift times
          let todayShiftStart: Date;
          let todayShiftEnd: Date;

          if (daySchedule?.start && daySchedule?.end && isInDayRoster) {
            // Use scheduled shift times
            const shiftStartTime = new Date(daySchedule.start);
            const shiftEndTime = new Date(daySchedule.end);

            todayShiftStart = new Date(currentDate);
            todayShiftStart.setHours(
              shiftStartTime.getHours(),
              shiftStartTime.getMinutes(),
              0,
              0
            );

            todayShiftEnd = new Date(currentDate);
            todayShiftEnd.setHours(
              shiftEndTime.getHours(),
              shiftEndTime.getMinutes(),
              0,
              0
            );

            // Handle overnight shifts
            if (todayShiftEnd <= todayShiftStart) {
              todayShiftEnd.setDate(todayShiftEnd.getDate() + 1);
            }
          } else if (hasExistingPunches) {
            // FIXED: For existing punches without roster, estimate shift times from punch data
            const firstPunch = todayPunches[0];
            const lastPunch = todayPunches[todayPunches.length - 1];

            todayShiftStart = new Date(firstPunch.timeIn);

            if (lastPunch.timeOut) {
              todayShiftEnd = new Date(lastPunch.timeOut);
            } else {
              // For active punches, estimate end time as start + 8 hours (or use current time)
              todayShiftEnd = new Date(todayShiftStart);
              todayShiftEnd.setHours(todayShiftStart.getHours() + 8);
            }
          } else {
            // This shouldn't happen given our filtering above, but safety check
            return;
          }

          // Check if shift is active during this date (only for roster-based shifts)
          if (isUserInShiftRoster && daySchedule?.start && daySchedule?.end) {
            const shiftStartDate = new Date(shift.shiftStartDate);
            const shiftEndDate = new Date(shift.shiftEndDate);

            const dayStart = new Date(currentDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDate);
            dayEnd.setHours(23, 59, 59, 999);

            const isShiftActiveForDay =
              shiftStartDate <= dayEnd && shiftEndDate >= dayStart;

            // Skip if shift is not active for this day and no existing punches
            if (!isShiftActiveForDay && !hasExistingPunches) {
              return;
            }
          }

          const isWithinShift =
            isToday && now >= todayShiftStart && now <= todayShiftEnd;
          const shiftHasEnded = isToday && now > todayShiftEnd;

          // FIXED: Check for active punch more accurately
          const hasActivePunchForThisShift = todayPunches.some(
            (punch) => punch.status === 'active'
          );

          const totalHours = todayPunches.reduce((sum, punch) => {
            if (punch.timeOut) {
              const hours =
                (new Date(punch.timeOut).getTime() -
                  new Date(punch.timeIn).getTime()) /
                (1000 * 60 * 60);
              return sum + hours;
            }
            if (punch.status === 'active') {
              const hours =
                (now.getTime() - new Date(punch.timeIn).getTime()) /
                (1000 * 60 * 60);
              return sum + hours;
            }
            return sum;
          }, 0);

          // FIXED: Enhanced clock-in logic - only allow if user is in roster and shift is active
          const canClockIn =
            isToday &&
            !hasActivePunchForThisShift &&
            !shiftHasEnded &&
            isUserInShiftRoster &&
            daySchedule?.start &&
            daySchedule?.end &&
            isInDayRoster &&
            handleShiftJobClockInTime(
              job,
              userData.applicantId,
              now.toISOString(),
              shift
            );

          // FIXED: Clock out logic
          const canClockOut = hasActivePunchForThisShift;

          const allowBreaks = job.additionalConfig?.allowBreaks ?? true;

          // Visual indicators based on timer card state
          const isSelectedShift =
            selectedJob?._id === job._id && selectedShift?.slug === shift.slug;

          // FIXED: Show rows for:
          // 1. Active/future shifts where user is enrolled
          // 2. Any shifts where user has existing punches (regardless of enrollment)
          // 3. Past shifts with punches
          const shouldShowRow =
            hasExistingPunches || // Always show if there are punches
            (isUserInShiftRoster &&
              daySchedule?.start &&
              daySchedule?.end &&
              isInDayRoster) || // Show if enrolled and scheduled
            (!shiftHasEnded && isUserInShiftRoster); // Show future enrolled shifts

          if (shouldShowRow) {
            rows.push({
              date: formatDate(currentDate, 'MM/dd/yyyy'),
              dateObj: new Date(currentDate),
              jobId: job._id,
              jobTitle: job.title,
              job: job,
              shift: shift,
              shiftName: shift.shiftName || shift.slug,
              startTime: formatTime(todayShiftStart),
              endTime: formatTime(todayShiftEnd),
              totalHours: Math.round(totalHours * 100) / 100,
              punches: todayPunches,
              canClockIn,
              canClockOut,
              allowBreaks,
              isWithinShift,
              hasActivePunch: hasActivePunchForThisShift,
              isToday,
              shiftHasEnded,
              isSelectedShift,
              isCurrentOpenPunchShift: hasActivePunchForThisShift,
            } as ShiftRowData & {
              isSelectedShift: boolean;
              isCurrentOpenPunchShift: boolean;
              shiftHasEnded: boolean;
            });
          }
        });
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return rows.sort((a, b) => {
      // Sort by date (newest first)
      const dateSort = b.dateObj.getTime() - a.dateObj.getTime();
      if (dateSort !== 0) return dateSort;

      // For same date, prioritize active punches first
      if (a.hasActivePunch && !b.hasActivePunch) return -1;
      if (!a.hasActivePunch && b.hasActivePunch) return 1;

      // Then prioritize shifts you can clock into
      if (a.canClockIn && !b.canClockIn) return -1;
      if (!a.canClockIn && b.canClockIn) return 1;

      // Finally sort by start time for same-day shifts
      if (a.isToday && b.isToday) {
        return a.startTime.localeCompare(b.startTime);
      }

      return 0;
    });
  }, [userData, allPunches, startDate, endDate, selectedJob, selectedShift]);

  // FIXED: Updated columns to properly show shift times instead of punch times
  const columns: TableColumn<ShiftRowData>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date & Shift Time',
        render: (value, row) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {String(value)}
              {row.isToday && (
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-50 text-blue-700"
                >
                  Today
                </Badge>
              )}
              {row.shiftHasEnded && !row.hasActivePunch && (
                <Badge variant="outline" className="text-xs text-gray-500">
                  Ended
                </Badge>
              )}
            </div>
            <div className="text-xs text-gray-600">
              Scheduled: {row.startTime} - {row.endTime}
            </div>
          </div>
        ),
      },
      {
        key: 'jobTitle',
        header: 'Job Title',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            {String(value)}
            {isJobGeoFenced(row.job) && (
              <MapPin
                className="h-3 w-3 text-gray-400"
                aria-label="Geofenced"
              />
            )}
          </div>
        ),
      },
      {
        key: 'shiftName',
        header: 'Job Shift Name',
        render: (value) => String(value),
      },
      {
        key: 'startTime',
        header: 'Actual Clock In/Out',
        render: (value, row) => {
          // If there are punches, show actual punch times
          if (row.punches.length > 0) {
            return (
              <div className="space-y-1">
                {row.punches.map((punch) => {
                  const startTime = formatTime(new Date(punch.timeIn));
                  const endTime = punch.timeOut
                    ? formatTime(new Date(punch.timeOut))
                    : '----';
                  return (
                    <div key={punch.id} className="flex items-center gap-2">
                      <span className="text-gray-900">
                        {startTime} to {endTime}
                      </span>
                      {punch.status === 'active' && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-green-50 text-green-700"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          // No punches yet - show dashes
          return <span className="text-gray-400">---- to ----</span>;
        },
      },
      {
        key: 'totalHours',
        header: 'Total Working Hours',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            {row.totalHours > 0 ? `${row.totalHours} Hours` : '0 Hours'}
            {row.hasActivePunch && (
              <Badge
                variant="default"
                className="text-xs bg-green-100 text-green-800"
              >
                Active
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'canClockIn',
        header: 'Action',
        render: (value, row) => {
          const isDisabled = loading;
          const shiftEnded = row.shiftHasEnded;

          return (
            <div className="flex space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleShiftClockIn(row)}
                disabled={isDisabled || !row.canClockIn || shiftEnded}
                className="border-blue-500 text-blue-500 hover:bg-blue-50 disabled:opacity-50"
              >
                {loading ? (
                  <Clock className="h-3 w-3 animate-spin" />
                ) : (
                  'Clock In'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleShiftClockOut(row)}
                disabled={isDisabled || !row.canClockOut}
                className="border-red-500 text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                {loading ? (
                  <Clock className="h-3 w-3 animate-spin" />
                ) : (
                  'Clock Out'
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [loading, handleShiftClockIn, handleShiftClockOut]
  );

  // Show loading state while fetching punches
  if (punchesLoading) {
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Date
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Job Title
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Job Shift Name
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Start - End Time
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Total Working Hours
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex space-x-2">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-8 w-18" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Show error state
  if (punchesError) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">
          Failed to load punch data: {punchesError.message}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <ClockInValidationModal
        isOpen={showValidationModal}
        messages={validationMessages}
        onConfirm={() => performClockIn(null, null)}
        onCancel={cancelClockIn}
        loading={loading}
        title="Clock-In Confirmation"
        confirmText="Proceed with Clock-In"
        cancelText="Cancel"
      />

      <Table
        title="Work Shifts"
        description={`Shifts for ${dateRange.displayRange}`}
        columns={columns}
        data={shiftRows}
        showPagination={false}
        selectable={false}
        className="w-full"
        emptyMessage="No shifts found for the selected date range."
        getRowClassName={(row) => {
          let className = '';
          if (row.isToday) className += 'bg-blue-50/30 ';
          if (row.hasActivePunch) className += 'bg-green-50/30 ';
          if (row.shiftHasEnded && !row.hasActivePunch)
            className += 'opacity-75 ';
          return className.trim();
        }}
      />
    </>
  );
}
