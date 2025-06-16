import { useMemo, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { ShiftRow } from "./ShiftRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ClockInValidationModal } from "../ClockInValidationModal";

// Import your existing hook and utilities
import { useTimerCard } from "@/domains/punch/hooks";
import { useFindPunches } from "@/domains/punch/hooks";
import type { PunchWithJobInfo } from "@/domains/punch/types";
import type { GignologyJob, Shift } from "@/domains/job/types/job.types";
import type { GignologyUser } from "@/domains/user/types";

// Import your shift utilities
import {
  getUserShiftForToday,
  handleShiftJobClockInTime,
  jobHasShiftForUser,
} from "@/domains/punch/utils/shift-job-utils";

interface ShiftRowData {
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
    status: "active" | "completed";
  }>;
  canClockIn: boolean;
  canClockOut: boolean;
  allowBreaks: boolean;
  isWithinShift: boolean;
  hasActivePunch: boolean;
  isToday: boolean;
  shiftHasEnded?: boolean; // Add this new property
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
  if (format === "MM/dd/yyyy") {
    return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
      .getDate()
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  }
  if (format === "hh:mm a") {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
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
    currentOpenPunch,

    // Validation state
    validationMessages,
    showValidationModal,

    // Handlers we can reuse
    handleJobSelection,
    handleShiftSelection,
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
    userId: userData._id || "",
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    // Don't filter by status to get both completed and open punches
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

  // Generate shift rows from user data
  const shiftRows = useMemo((): ShiftRowData[] => {
    if (!userData?.jobs) return [];

    const rows: ShiftRowData[] = [];
    const now = new Date();

    // Generate dates for the date range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ][currentDate.getDay()];

      userData.jobs.forEach((job: GignologyJob) => {
        if (!job.shifts || !jobHasShiftForUser(job, userData.applicantId))
          return;

        job.shifts.forEach((shift: Shift) => {
          // Check if user has this shift on this day
          const { start, end } = getUserShiftForToday(
            job,
            userData.applicantId,
            currentDate.toISOString(),
            shift
          );

          if (!start || !end) return;

          const daySchedule =
            shift.defaultSchedule?.[
              dayOfWeek as keyof typeof shift.defaultSchedule
            ];
          if (!daySchedule?.start || !daySchedule?.end) return;

          // Check if user is in roster for this day
          const isInDayRoster =
            !daySchedule.roster?.length ||
            daySchedule.roster.includes(userData.applicantId);

          if (!isInDayRoster) return;

          const startTime = new Date(daySchedule.start);
          const endTime = new Date(daySchedule.end);
          const isToday = isSameDay(currentDate, now);
          const isWithinShift = isToday && now >= startTime && now <= endTime;
          // Check if shift has ended (only matters for today)
          const shiftHasEnded = isToday && now > endTime;

          // Find punches for this job and date from allPunches
          const todayPunches = (allPunches || [])
            .filter(
              (punch) =>
                punch.jobId === job._id &&
                isSameDay(new Date(punch.timeIn), currentDate)
            )
            .map((punch) => ({
              id: punch._id,
              timeIn: punch.timeIn,
              timeOut: punch.timeOut,
              status: punch.timeOut
                ? ("completed" as const)
                : ("active" as const),
            }));

          // Check if this specific shift has an active punch
          const hasActivePunchForThisShift =
            currentOpenPunch &&
            currentOpenPunch.jobId === job._id &&
            currentOpenPunch.shiftSlug === shift.slug &&
            isSameDay(new Date(currentOpenPunch.timeIn), currentDate);

          // Use the more specific check for hasActivePunch
          const hasActivePunch = hasActivePunchForThisShift || false;

          const totalHours = todayPunches.reduce((sum, punch) => {
            if (punch.timeOut) {
              const hours =
                (new Date(punch.timeOut).getTime() -
                  new Date(punch.timeIn).getTime()) /
                (1000 * 60 * 60);
              return sum + hours;
            }
            if (punch.status === "active") {
              const hours =
                (now.getTime() - new Date(punch.timeIn).getTime()) /
                (1000 * 60 * 60);
              return sum + hours;
            }
            return sum;
          }, 0);

          // Enhanced canClockIn logic using selectedJob and selectedShift from useTimerCard
          const canClockIn =
            isToday &&
            !hasActivePunch &&
            !shiftHasEnded && // Don't allow clock in if shift has ended
            handleShiftJobClockInTime(
              job,
              userData.applicantId,
              now.toISOString(),
              shift
            ) &&
            // Additional check: if there's a selected job/shift from timer card,
            // only allow clock in for that specific combination
            (!selectedJob || selectedJob._id === job._id) &&
            (!selectedShift || selectedShift.slug === shift.slug);

          // Enhanced canClockOut logic
          const canClockOut = hasActivePunch;

          const allowBreaks = job.additionalConfig?.allowBreaks ?? true;

          // Visual indicators based on timer card state
          const isSelectedShift =
            selectedJob?._id === job._id && selectedShift?.slug === shift.slug;

          const shouldShowRow =
            !isToday ||
            !shiftHasEnded ||
            todayPunches.length > 0 ||
            hasActivePunch;

          if (shouldShowRow) {
            rows.push({
              date: formatDate(currentDate, "MM/dd/yyyy"),
              dateObj: new Date(currentDate),
              jobId: job._id,
              jobTitle: job.title,
              job: job,
              shift: shift,
              shiftName: shift.shiftName || shift.slug,
              startTime: formatDate(startTime, "hh:mm a"),
              endTime: formatDate(endTime, "hh:mm a"),
              totalHours: Math.round(totalHours * 100) / 100,
              punches: todayPunches,
              canClockIn,
              canClockOut,
              allowBreaks,
              isWithinShift,
              hasActivePunch,
              isToday,
              shiftHasEnded, // Add this new property
              // Add these for enhanced UI state
              isSelectedShift,
              isCurrentOpenPunchShift: hasActivePunch,
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
      // First sort by date (newest first)
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
  }, [
    userData,
    allPunches,
    startDate,
    endDate,
    selectedJob,
    selectedShift,
    currentOpenPunch,
  ]);

  // Enhanced clock in handler that works with specific shifts
  const handleShiftClockIn = useCallback(
    async (shiftData: ShiftRowData) => {
      console.log("Clock-in attempt for shift:", shiftData.shiftName);

      // Set the job and shift in the store so useTimerCard can use them
      handleJobSelection(shiftData.job);
      handleShiftSelection(shiftData.shift);

      // Small delay to ensure state is updated
      setTimeout(() => {
        handleClockInOut();
      }, 100);
    },
    [handleJobSelection, handleShiftSelection, handleClockInOut]
  );

  // Enhanced clock out handler
  const handleShiftClockOut = useCallback(
    async (shiftData: ShiftRowData) => {
      console.log("Clock-out attempt for shift:", shiftData.shiftName);

      if (!shiftData.hasActivePunch) {
        console.error("No active punch to clock out");
        return;
      }

      // For clock out, we can directly use the existing handler
      // since it works with the current open punch
      await handleClockInOut();
    },
    [handleClockInOut]
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
        onConfirm={performClockIn}
        onCancel={cancelClockIn}
        loading={loading}
        title="Clock-In Confirmation"
        confirmText="Proceed with Clock-In"
        cancelText="Cancel"
      />

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
            {shiftRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No shifts found for the selected date range.
                </td>
              </tr>
            ) : (
              shiftRows.map((shiftData) => (
                <ShiftRow
                  key={`${shiftData.jobId}-${shiftData.shift.slug}-${shiftData.date}`}
                  shiftData={shiftData}
                  onClockIn={handleShiftClockIn}
                  onClockOut={handleShiftClockOut}
                  loading={loading}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
