import { useMemo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClockInValidationModal } from '../ClockInValidationModal';
import { CallOffConfirmModal } from '../CallOffConfirmModal';
import { ShiftSwapRequestModal } from '../ShiftSwapRequestModal/ShiftSwapRequestModal';
import { ArrowLeftRight, Clock, Clock3, MapPin } from 'lucide-react';

// Import your existing hook and utilities
import { useTimerCard, useCallOffShift } from '@/domains/punch/hooks';
import { useFindPunches } from '@/domains/punch/hooks';
import type { PunchWithJobInfo } from '@/domains/punch/types';
import type { GignologyJob, Shift } from '@/domains/job/types/job.types';
import type { GignologyUser } from '@/domains/user/types';
import {
  jobHasShiftForUser,
  handleShiftJobClockInTime,
  isJobGeoFenced,
  isUserInRoster,
  canCallOffShift,
} from '@/domains/punch/utils/shift-job-utils';
import {
  useAcceptSwapRequestMutation,
  useCreateSwapRequestMutation,
  useSwapRequestsQuery,
  useWithdrawSwapRequestMutation,
} from '@/domains/swap/hooks/use-swap-requests';
import type { SwapRequest, SwapRequestStatus } from '@/domains/swap/types';

type SwapRowRole = 'from' | 'to';

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
  dateYyyyMmDd?: string;
  dayKey?: string;
  canCallOff?: boolean;
  /** Shown on hover when Call off button is disabled */
  callOffDisabledReason?: string;
  /** True when the shift crosses midnight (start day row only) */
  isOvernightShift?: boolean;
  /** Formatted end date (MM/dd/yyyy) for overnight shifts, e.g. "01/21/2025" */
  endDateDisplay?: string;
  swapStatus?: SwapRequestStatus | null;
  /** Short line under the swap control: what kind of request and what you are waiting for */
  swapContextHint?: string | null;
  /** Open request on this row (for detail modal / withdraw). */
  swapRequest?: SwapRequest | null;
  swapRole?: SwapRowRole | null;
  canSwapByLeadTime?: boolean;
  swapDisabledReason?: string;
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
  isBlockedByJobPunch?: boolean;
  hasActiveEventClockIn?: boolean;
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

// Helper functions to replace date-fns
const formatDate = (date: Date, format: string) => {
  if (format === 'MM/dd/yyyy') {
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
      .getDate()
      .toString()
      .padStart(2, '0')}/${date.getFullYear()}`;
  }
  if (format === 'yyyy-MM-dd') {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
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

function formatYmdToUs(ymd: string): string {
  const d = Date.parse(`${ymd}T12:00:00`);
  if (Number.isNaN(d)) return ymd;
  return new Date(d).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function shiftNameFromJob(
  job: GignologyJob,
  slug: string | null | undefined
): string | null {
  if (!slug) return null;
  const s = job.shifts?.find((sh) => sh.slug === slug);
  if (!s) return null;
  return s.shiftName || s.slug || null;
}

/** Explains request type and what the employee is waiting on (shown under Swap / status). */
function buildSwapContextHint(
  req: SwapRequest,
  role: SwapRowRole,
  job: GignologyJob
): string {
  if (req.status === 'approved') {
    return 'Swap approved — schedule updated';
  }
  if (req.status === 'pending_approval') {
    return 'Matched — awaiting admin approval';
  }
  if (req.type === 'giveaway') {
    return 'Waiting for someone to take this shift';
  }
  if (req.type === 'pickup_interest') {
    return req.taggedOnly
      ? 'Interest saved — we will notify you when a shift opens'
      : 'Pickup request open';
  }
  if (req.type === 'swap') {
    if (role === 'from') {
      if (req.acceptAny && !req.toEmployeeId) {
        return 'Open offer — any coworker on this job/shift can match';
      }
      const peerShift = shiftNameFromJob(job, req.toShiftSlug);
      const peerDate = req.toShiftDate ? formatYmdToUs(req.toShiftDate) : null;
      if (peerShift || peerDate) {
        const detail = [peerShift, peerDate].filter(Boolean).join(' · ');
        return `Waiting for match — you asked to swap for: ${detail}`;
      }
      if (req.toEmployeeId) {
        return 'Waiting for selected coworker to confirm';
      }
      return 'Waiting for a coworker to match';
    }
    return 'Your side of the swap — follow notifications if action is needed';
  }
  return '';
}

/** True if punch time segment [timeIn, timeOut ?? now] overlaps [windowStart, windowEnd]. */
function punchOverlapsWindow(
  punch: { timeIn: string; timeOut: string | null },
  windowStart: Date,
  windowEnd: Date,
  now: Date
): boolean {
  const punchStart = new Date(punch.timeIn);
  const punchEnd = punch.timeOut ? new Date(punch.timeOut) : now;
  return punchStart < windowEnd && punchEnd > windowStart;
}

/** True if timeIn falls inside [windowStart, windowEnd] (inclusive). */
function isTimeInInsideWindow(
  timeIn: Date,
  windowStart: Date,
  windowEnd: Date
): boolean {
  const t = timeIn.getTime();
  return t >= windowStart.getTime() && t <= windowEnd.getTime();
}

/** Map raw punch to row punch shape. */
function toRowPunch(punch: PunchWithJobInfo): {
  id: string;
  timeIn: string;
  timeOut: string | null;
  status: 'active' | 'completed';
} {
  return {
    id: punch._id,
    timeIn: punch.timeIn,
    timeOut: punch.timeOut,
    status: punch.timeOut ? ('completed' as const) : ('active' as const),
  };
}

export function ShiftsTable({
  userData,
  openPunches,
  allPunches: propAllPunches,
  punchesLoading: propPunchesLoading,
  dateRange,
  isBlockedByJobPunch = false,
  hasActiveEventClockIn = false,
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
  } = useTimerCard({ userData, openPunches, hasActiveEventClockIn });

  const callOffMutation = useCallOffShift(userData._id || userData.applicantId || '');
  const [callOffConfirmRow, setCallOffConfirmRow] = useState<ShiftRowData | null>(null);
  const [swapModalRow, setSwapModalRow] = useState<ShiftRowData | null>(null);
  const createSwapMutation = useCreateSwapRequestMutation();
  const acceptSwapMutation = useAcceptSwapRequestMutation();
  const withdrawSwapMutation = useWithdrawSwapRequestMutation();
  const { data: swapRequests = [] } = useSwapRequestsQuery({
    employeeId: userData.applicantId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const confirmCallOff = useCallback(
    (reason: string) => {
      if (!callOffConfirmRow?.dateYyyyMmDd || !callOffConfirmRow?.dayKey || !reason.trim()) return;
      callOffMutation.mutate(
        {
          jobId: callOffConfirmRow.jobId,
          shiftSlug: callOffConfirmRow.shift.slug,
          date: callOffConfirmRow.dateYyyyMmDd,
          dayKey: callOffConfirmRow.dayKey,
          reason: reason.trim(),
        },
        { onSettled: () => setCallOffConfirmRow(null) }
      );
    },
    [callOffConfirmRow, callOffMutation]
  );

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

  /** Winning swap request per shift-day cell (pending, approved, etc.). */
  const pendingSwapRequestByShiftDay = useMemo(() => {
    const map = new Map<string, { req: SwapRequest; source: SwapRowRole }>();
    const me = String(userData.applicantId ?? '');

    const statusRank = (s: SwapRequest['status']): number => {
      if (s === 'approved') return 3;
      if (s === 'pending_approval') return 2;
      if (s === 'pending_match') return 1;
      return 0;
    };

    const merge = (key: string, req: SwapRequest, source: SwapRowRole) => {
      if (
        !['pending_match', 'pending_approval', 'approved'].includes(req.status)
      ) {
        return;
      }
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { req, source });
        return;
      }
      const rNew = statusRank(req.status);
      const rOld = statusRank(existing.req.status);
      if (rNew > rOld) {
        map.set(key, { req, source });
        return;
      }
      if (rNew === rOld) {
        const tNew = new Date(req.submittedAt).getTime();
        const tOld = new Date(existing.req.submittedAt).getTime();
        if (!Number.isNaN(tNew) && !Number.isNaN(tOld) && tNew > tOld) {
          map.set(key, { req, source });
        }
      }
    };

    for (const req of swapRequests) {
      if (String(req.fromEmployeeId) === me && req.fromShiftSlug && req.fromShiftDate) {
        merge(`${req.fromShiftSlug}|${req.fromShiftDate}`, req, 'from');
      }
      if (
        req.toEmployeeId != null &&
        String(req.toEmployeeId) === me &&
        req.toShiftSlug &&
        req.toShiftDate
      ) {
        merge(`${req.toShiftSlug}|${req.toShiftDate}`, req, 'to');
      }
    }
    return map;
  }, [swapRequests, userData.applicantId]);

  const submitSwapRequest = useCallback(
    (input: {
      type: 'swap' | 'giveaway' | 'pickup_interest';
      toEmployeeId?: string | null;
      toShiftSlug?: string | null;
      toShiftDate?: string | null;
      acceptAny?: boolean;
      notes?: string;
      matchGiveawayId?: string | null;
      pickupTargetShiftDate?: string | null;
    }) => {
      if (!swapModalRow?.dateYyyyMmDd || !swapModalRow.dayKey) return;

      const pickupDate = input.pickupTargetShiftDate?.trim();
      const fromShiftDate =
        input.type === 'pickup_interest' && pickupDate
          ? pickupDate
          : swapModalRow.dateYyyyMmDd;

      const matchId = input.matchGiveawayId?.trim();
      if (input.type === 'pickup_interest' && matchId) {
        if (!pickupDate) return;
        createSwapMutation.mutate(
          {
            jobSlug: swapModalRow.job.jobSlug,
            fromShiftSlug: swapModalRow.shift.slug,
            fromShiftDate: pickupDate,
            type: 'pickup_interest',
            taggedOnly: true,
            matchGiveawayId: matchId,
            toEmployeeId: null,
            toShiftSlug: null,
            toShiftDate: null,
            acceptAny: false,
            notes: input.notes,
          },
          { onSuccess: () => setSwapModalRow(null) }
        );
        return;
      }

      createSwapMutation.mutate(
        {
          jobSlug: swapModalRow.job.jobSlug,
          fromShiftSlug: swapModalRow.shift.slug,
          fromShiftDate,
          type: input.type,
          toEmployeeId: input.toEmployeeId || null,
          toShiftSlug: input.toShiftSlug ?? null,
          toShiftDate: input.toShiftDate ?? null,
          acceptAny: Boolean(input.acceptAny),
          taggedOnly: input.type === 'pickup_interest' && Boolean(pickupDate),
          notes: input.notes,
        },
        {
          onSuccess: () => setSwapModalRow(null),
        }
      );
    },
    [createSwapMutation, swapModalRow]
  );

  const acceptPeerSwap = useCallback(
    (input: {
      swapRequestId: string;
      toShiftSlug: string;
      toShiftDate: string;
      notes?: string;
    }) => {
      acceptSwapMutation.mutate(
        {
          id: input.swapRequestId,
          body: {
            toShiftSlug: input.toShiftSlug,
            toShiftDate: input.toShiftDate,
            ...(input.notes ? { notes: input.notes } : {}),
          },
        },
        { onSuccess: () => setSwapModalRow(null) }
      );
    },
    [acceptSwapMutation]
  );

  const shiftRows = useMemo((): ShiftRowData[] => {
    if (!userData?.jobs) return [];

    const now = new Date();
    const processedShifts = new Set<string>();

    type RowPunch = {
      id: string;
      timeIn: string;
      timeOut: string | null;
      status: 'active' | 'completed';
    };
    interface RowInput {
      currentDate: Date;
      job: GignologyJob;
      shift: Shift;
      daySchedule: Shift['defaultSchedule'][keyof Shift['defaultSchedule']] | undefined;
      isInDayRoster: boolean;
      isUserInShiftRoster: boolean;
      todayShiftStart: Date;
      todayShiftEnd: Date;
      isOvernightStartDay: boolean;
      rawOverlappingPunches: RowPunch[];
      isTodayDate: boolean;
    }
    const rowInputs: RowInput[] = [];

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
        if (!job.shifts || !jobHasShiftForUser(job, userData.applicantId)) {
          return;
        }

        job.shifts.forEach((shift: Shift) => {
          const shiftKey = `${job._id}-${shift.slug}-${formatDate(currentDate, 'MM/dd/yyyy')}`;

          if (processedShifts.has(shiftKey)) {
            return;
          }

          const isUserInShiftRoster = shift.shiftRoster?.some(
            (rosterEntry) => rosterEntry._id === userData.applicantId
          );

          let daySchedule:
            | Shift['defaultSchedule'][keyof Shift['defaultSchedule']]
            | undefined = undefined;
          let isInDayRoster = false;

          if (isUserInShiftRoster) {
            daySchedule =
              shift.defaultSchedule?.[
                dayOfWeek as keyof typeof shift.defaultSchedule
              ];

            if (daySchedule?.roster == null || daySchedule.roster.length === 0) {
              isInDayRoster = false;
            } else {
              isInDayRoster = isUserInRoster(
                daySchedule.roster,
                userData.applicantId,
                currentDate.toISOString()
              );
            }

            // Skip creating a row for the end-day of an overnight shift (start-day row already covers it)
            if (!daySchedule?.start || !isInDayRoster) {
              const previousDay = new Date(currentDate);
              previousDay.setDate(previousDay.getDate() - 1);
              const previousDayOfWeek = [
                'sunday',
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
              ][previousDay.getDay()];

              const previousDaySchedule =
                shift.defaultSchedule?.[
                  previousDayOfWeek as keyof typeof shift.defaultSchedule
                ];

              if (previousDaySchedule?.start && previousDaySchedule?.end) {
                const prevStartTime = new Date(previousDaySchedule.start);
                const prevEndTime = new Date(previousDaySchedule.end);
                const prevEndMinutes = prevEndTime.getHours() * 60 + prevEndTime.getMinutes();
                const prevStartMinutes = prevStartTime.getHours() * 60 + prevStartTime.getMinutes();
                if (prevEndMinutes < prevStartMinutes) {
                  return;
                }
              }
            }
          }

          // Compute shift window first (before punch matching)
          let todayShiftStart: Date;
          let todayShiftEnd: Date;
          let isOvernightStartDay = false;

          if (daySchedule?.start && daySchedule?.end && isInDayRoster) {
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

            const startH = shiftStartTime.getHours();
            const startM = shiftStartTime.getMinutes();
            const endH = shiftEndTime.getHours();
            const endM = shiftEndTime.getMinutes();
            const endBeforeStart =
              endH < startH || (endH === startH && endM < startM);
            if (endBeforeStart) {
              todayShiftEnd.setDate(todayShiftEnd.getDate() + 1);
              isOvernightStartDay = true;
            }
          } else {
            // No schedule: infer window from candidates (job+shift, timeIn in currentDate ± 1 day)
            const candidateStart = new Date(currentDate);
            candidateStart.setDate(candidateStart.getDate() - 1);
            candidateStart.setHours(0, 0, 0, 0);
            const candidateEnd = new Date(currentDate);
            candidateEnd.setDate(candidateEnd.getDate() + 1);
            candidateEnd.setHours(23, 59, 59, 999);

            const candidates = (allPunches || []).filter(
              (p) =>
                p.jobId === job._id &&
                (p.shiftSlug === shift.slug || p.shiftName === shift.shiftName) &&
                new Date(p.timeIn).getTime() >= candidateStart.getTime() &&
                new Date(p.timeIn).getTime() <= candidateEnd.getTime()
            );

            if (candidates.length === 0 && !isUserInShiftRoster) {
              return;
            }
            if (candidates.length === 0 && isUserInShiftRoster) {
              return;
            }

            // Only create a no-schedule row when at least one punch's clock-in is on currentDate.
            // Otherwise we get ghost rows (e.g. row for March 13) when punches from the previous
            // day fall in the ±1 day candidate range and are later assigned to the real overnight row.
            const atLeastOneCandidateOnCurrentDay = candidates.some((c) =>
              isSameDay(new Date(c.timeIn), currentDate)
            );
            if (!atLeastOneCandidateOnCurrentDay) {
              return;
            }

            const minStart = Math.min(
              ...candidates.map((c) => new Date(c.timeIn).getTime())
            );
            todayShiftStart = new Date(minStart);
            const maxEnd = Math.max(
              ...candidates.map((c) =>
                c.timeOut ? new Date(c.timeOut).getTime() : now.getTime()
              )
            );
            todayShiftEnd = new Date(maxEnd);
          }

          // Overlap-based punch match: punch belongs to this row if it overlaps the shift window
          const rawOverlappingPunches = (allPunches || [])
            .filter(
              (punch) =>
                punch.jobId === job._id &&
                (punch.shiftSlug === shift.slug ||
                  punch.shiftName === shift.shiftName) &&
                punchOverlapsWindow(
                  punch,
                  todayShiftStart,
                  todayShiftEnd,
                  now
                )
            )
            .map(toRowPunch);

          const hasExistingPunches = rawOverlappingPunches.length > 0;

          if (!isUserInShiftRoster && !hasExistingPunches) {
            return;
          }

          processedShifts.add(shiftKey);

          if (isUserInShiftRoster && daySchedule?.start && daySchedule?.end) {
            const shiftStartDate = new Date(shift.shiftStartDate);
            const shiftEndDate = new Date(shift.shiftEndDate);
            const dayStart = new Date(currentDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDate);
            dayEnd.setHours(23, 59, 59, 999);
            const isShiftActiveForDay =
              shiftStartDate <= dayEnd && shiftEndDate >= dayStart;
            if (!isShiftActiveForDay && !hasExistingPunches) {
              return;
            }
          }

          rowInputs.push({
            currentDate: new Date(currentDate),
            job,
            shift,
            daySchedule,
            isInDayRoster,
            isUserInShiftRoster,
            todayShiftStart,
            todayShiftEnd,
            isOvernightStartDay,
            rawOverlappingPunches,
            isTodayDate: isToday,
          });
        });
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Tie-breaker: when a punch overlaps multiple rows (same job+shift), assign only to the row
    // where clock-in time is inside that row's window; otherwise (e.g. early clock-in) to the row
    // with earliest shift start
    const punchIdToRowIndices = new Map<string, number[]>();
    rowInputs.forEach((row, idx) => {
      row.rawOverlappingPunches.forEach((p) => {
        const list = punchIdToRowIndices.get(p.id) ?? [];
        list.push(idx);
        punchIdToRowIndices.set(p.id, list);
      });
    });

    const assignedPunchIdToRowIndex = new Map<string, number>();
    punchIdToRowIndices.forEach((rowIndices, punchId) => {
      if (rowIndices.length === 1) {
        assignedPunchIdToRowIndex.set(punchId, rowIndices[0]);
      } else {
        const punch = rowInputs[rowIndices[0]].rawOverlappingPunches.find(
          (p) => p.id === punchId
        );
        if (!punch) return;
        const timeInDate = new Date(punch.timeIn);
        const rowsWithTimeInInside = rowIndices.filter((idx) =>
          isTimeInInsideWindow(
            timeInDate,
            rowInputs[idx].todayShiftStart,
            rowInputs[idx].todayShiftEnd
          )
        );
        if (rowsWithTimeInInside.length > 0) {
          // Prefer the row whose shift start is earliest (deterministic; handles overnight vs next-day)
          const winningIdx =
            rowsWithTimeInInside.length === 1
              ? rowsWithTimeInInside[0]
              : rowsWithTimeInInside.reduce(
                  (best, idx) =>
                    rowInputs[idx].todayShiftStart.getTime() <
                    rowInputs[best].todayShiftStart.getTime()
                      ? idx
                      : best,
                  rowsWithTimeInInside[0]
                );
          assignedPunchIdToRowIndex.set(punchId, winningIdx);
        } else {
          // Early clock-in: timeIn not inside any window; assign to row with earliest shift start
          const earliestIdx = rowIndices.reduce(
            (best, idx) =>
              rowInputs[idx].todayShiftStart.getTime() <
              rowInputs[best].todayShiftStart.getTime()
                ? idx
                : best,
            rowIndices[0]
          );
          assignedPunchIdToRowIndex.set(punchId, earliestIdx);
        }
      }
    });

    // Build final rows with resolved todayPunches
    const rows: ShiftRowData[] = [];
    rowInputs.forEach((input, rowIndex) => {
      const assignedToThisRow = input.rawOverlappingPunches.filter(
        (p) => assignedPunchIdToRowIndex.get(p.id) === rowIndex
      );
      // Dedupe by punch id (robust against duplicate entries in allPunches)
      const seenPunchIds = new Set<string>();
      const todayPunches = assignedToThisRow.filter((p) => {
        if (seenPunchIds.has(p.id)) return false;
        seenPunchIds.add(p.id);
        return true;
      });

      const hasExistingPunches = todayPunches.length > 0;
      const effectiveIsToday =
        input.isTodayDate ||
        (input.isOvernightStartDay &&
          now >= input.todayShiftStart &&
          now <= input.todayShiftEnd);
      const shiftHasEnded =
        effectiveIsToday && now > input.todayShiftEnd;
      const hasActivePunchForThisShift = todayPunches.some(
        (p) => p.status === 'active'
      );

      const totalHours = todayPunches.reduce((sum, punch) => {
        if (punch.timeOut) {
          return (
            sum +
            (new Date(punch.timeOut).getTime() -
              new Date(punch.timeIn).getTime()) /
              (1000 * 60 * 60)
          );
        }
        if (punch.status === 'active') {
          return (
            sum +
            (now.getTime() - new Date(punch.timeIn).getTime()) /
              (1000 * 60 * 60)
          );
        }
        return sum;
      }, 0);

      const canClockIn =
        effectiveIsToday &&
        !hasActivePunchForThisShift &&
        !shiftHasEnded &&
        !isBlockedByJobPunch &&
        !hasActiveEventClockIn &&
        input.isUserInShiftRoster &&
        input.daySchedule?.start &&
        input.daySchedule?.end &&
        input.isInDayRoster &&
        handleShiftJobClockInTime(
          input.job,
          userData.applicantId,
          now.toISOString(),
          input.shift
        );

      const canClockOut = hasActivePunchForThisShift;
      const allowBreaks = input.job.additionalConfig?.allowBreaks ?? true;
      const isSelectedShift =
        selectedJob?._id === input.job._id &&
        selectedShift?.slug === input.shift.slug;

      // No-schedule rows (no daySchedule for this day) only show when they have punches.
      // Otherwise we'd show empty "ghost" rows after the tie-breaker moved punches to another row.
      const hasScheduleForThisDay =
        Boolean(input.daySchedule?.start && input.daySchedule?.end) &&
        input.isInDayRoster;
      const shouldShowRow =
        hasExistingPunches ||
        (input.isUserInShiftRoster &&
          input.daySchedule?.start &&
          input.daySchedule?.end &&
          input.isInDayRoster) ||
        (!shiftHasEnded && input.isUserInShiftRoster && hasScheduleForThisDay);

      if (shouldShowRow) {
        const dateYyyyMmDd = formatDate(input.currentDate, 'yyyy-MM-dd');
        const dayKey = DAY_KEYS[input.currentDate.getDay()];
        const swapKey = `${input.shift.slug}|${dateYyyyMmDd}`;
        const swapCell = pendingSwapRequestByShiftDay.get(swapKey);
        const swapStatus = swapCell?.req.status ?? null;
        const swapContextHint = swapCell
          ? buildSwapContextHint(swapCell.req, swapCell.source, input.job)
          : null;
        const callOffCheck = canCallOffShift(
          input.job,
          input.shift,
          dateYyyyMmDd,
          dayKey
        );
        const hoursUntilShift =
          (input.todayShiftStart.getTime() - now.getTime()) / (1000 * 60 * 60);
        const configuredSwapHours = Number(input.job.additionalConfig?.swapBeforeHours);
        const minSwapLeadHours =
          Number.isFinite(configuredSwapHours) && configuredSwapHours >= 0
            ? configuredSwapHours
            : 48;
        const canSwapByLeadTime = hoursUntilShift >= minSwapLeadHours;
        const swapDisabledReason = canSwapByLeadTime
          ? undefined
          : `Swap is only available ${minSwapLeadHours}+ hours before shift start.`;
        const canCallOff =
          todayPunches.length === 0 &&
          callOffCheck.allowed &&
          Boolean(input.job.additionalConfig?.allowCallOff);
        const callOffDisabledReason =
          input.job.additionalConfig?.allowCallOff && !canCallOff
            ? todayPunches.length > 0
              ? 'You have already clocked in for this shift.'
              : callOffCheck.reason ?? 'Call off is not available.'
            : undefined;

        rows.push({
          date: formatDate(input.currentDate, 'MM/dd/yyyy'),
          dateObj: new Date(input.currentDate),
          jobId: input.job._id,
          jobTitle: input.job.title,
          job: input.job,
          shift: input.shift,
          shiftName: input.shift.shiftName || input.shift.slug,
          startTime: formatTime(input.todayShiftStart),
          endTime: formatTime(input.todayShiftEnd),
          totalHours: Math.round(totalHours * 100) / 100,
          punches: todayPunches,
          canClockIn,
          canClockOut,
          allowBreaks,
          isWithinShift:
            effectiveIsToday &&
            now >= input.todayShiftStart &&
            now <= input.todayShiftEnd,
          hasActivePunch: hasActivePunchForThisShift,
          isToday: effectiveIsToday,
          shiftHasEnded,
          isSelectedShift,
          isCurrentOpenPunchShift: hasActivePunchForThisShift,
          dateYyyyMmDd,
          dayKey,
          canCallOff,
          callOffDisabledReason,
          swapStatus,
          swapContextHint,
          swapRequest: swapCell?.req ?? null,
          swapRole: swapCell?.source ?? null,
          canSwapByLeadTime,
          swapDisabledReason,
          isOvernightShift: input.isOvernightStartDay,
          endDateDisplay: input.isOvernightStartDay
            ? formatDate(input.todayShiftEnd, 'MM/dd/yyyy')
            : undefined,
        } as ShiftRowData & {
          isSelectedShift: boolean;
          isCurrentOpenPunchShift: boolean;
          shiftHasEnded: boolean;
        });
      }
    });

    return rows.sort((a, b) => {
      // Sort by date (oldest first - ascending order)
      const dateSort = a.dateObj.getTime() - b.dateObj.getTime();
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
  }, [userData, allPunches, startDate, endDate, selectedJob, selectedShift, isBlockedByJobPunch, hasActiveEventClockIn, pendingSwapRequestByShiftDay]);

  // FIXED: Updated columns to properly show shift times instead of punch times
  const columns: TableColumn<ShiftRowData>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date & Shift Time',
        render: (value, row) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
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
              {row.isOvernightShift && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                  Overnight
                </Badge>
              )}
            </div>
            <div className="text-xs text-gray-600">
              Scheduled: {row.startTime} – {row.endTime}
              {row.isOvernightShift && row.endDateDisplay && (
                <span className="text-purple-600 ml-1">(ends {row.endDateDisplay})</span>
              )}
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
          const isCallOffLoading = callOffMutation.isPending;
          const canCallOff = Boolean(
            row.canCallOff &&
              row.dateYyyyMmDd &&
              row.dayKey &&
              row.punches.length === 0
          );
          const me = String(userData.applicantId ?? '');
          const todayYmd = formatDate(new Date(), 'yyyy-MM-dd');
          const isPastShiftDay = Boolean(
            row.dateYyyyMmDd && row.dateYyyyMmDd < todayYmd
          );
          const hasClockedInForShift = row.punches.length > 0;
          const isSwapApproved = row.swapStatus === 'approved';
          const hasEndedRequestOnThisShift = swapRequests.some(
            (r) =>
              String(r.fromEmployeeId) === me &&
              r.fromShiftSlug === row.shift.slug &&
              r.fromShiftDate === row.dateYyyyMmDd &&
              (r.status === 'rejected' || r.status === 'expired')
          );
          const canSwap = Boolean(
            row.dateYyyyMmDd &&
              row.dayKey &&
              !row.shiftHasEnded &&
              !isPastShiftDay &&
              !hasClockedInForShift &&
              (row.canSwapByLeadTime || hasEndedRequestOnThisShift)
          );
          /** Spec 8.2 / 2.1: hide swap for past days, after clock-in, when approved, or when shift ended. */
          const canShowSwapControl = Boolean(
            row.dateYyyyMmDd &&
              row.dayKey &&
              !row.shiftHasEnded &&
              !isPastShiftDay &&
              !hasClockedInForShift &&
              !isSwapApproved
          );
          const isSwapPending = row.swapStatus === 'pending_approval' || row.swapStatus === 'pending_match';

          const openCallOffConfirm = () => {
            if (!row.dateYyyyMmDd || !row.dayKey) return;
            setCallOffConfirmRow(row);
          };

          return (
            <div className="flex flex-wrap gap-2">
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
              {row.job?.additionalConfig?.allowCallOff === true && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openCallOffConfirm}
                  disabled={isCallOffLoading || !canCallOff}
                  title={!canCallOff ? row.callOffDisabledReason : undefined}
                  className="border-amber-500 text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                >
                  {isCallOffLoading ? (
                    <Clock className="h-3 w-3 animate-spin" />
                  ) : (
                    'Call off'
                  )}
                </Button>
              )}
              {canShowSwapControl && (
                <div className="flex max-w-[13rem] flex-col items-start gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSwapModalRow(row)}
                    disabled={isSwapPending ? false : !canSwap}
                    title={
                      isSwapPending
                        ? 'View your swap request or remove it'
                        : !canSwap && row.swapDisabledReason
                          ? row.swapDisabledReason
                          : undefined
                    }
                    className={`disabled:opacity-50 ${
                      isSwapPending
                        ? 'border-amber-500 text-amber-600'
                        : 'border-violet-500 text-violet-600 hover:bg-violet-50'
                    }`}
                  >
                    {!isSwapPending ? (
                      <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Clock3 className="h-3.5 w-3.5 mr-1" />
                    )}
                    {row.swapStatus === 'pending_approval'
                      ? 'Awaiting approval'
                      : row.swapStatus === 'pending_match'
                        ? 'Waiting for match'
                        : 'Swap'}
                  </Button>
                  {row.swapContextHint ? (
                    <span
                      className="text-[11px] leading-snug text-muted-foreground"
                      title={row.swapContextHint}
                    >
                      {row.swapContextHint}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          );
        },
      },
    ],
    [
      loading,
      handleShiftClockIn,
      handleShiftClockOut,
      callOffMutation.isPending,
      swapRequests,
      userData.applicantId,
    ]
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

      <CallOffConfirmModal
        isOpen={!!callOffConfirmRow}
        onClose={() => setCallOffConfirmRow(null)}
        onConfirm={confirmCallOff}
        loading={callOffMutation.isPending}
        shiftInfo={
          callOffConfirmRow
            ? {
                date: callOffConfirmRow.date,
                jobTitle: callOffConfirmRow.jobTitle,
                shiftName: callOffConfirmRow.shiftName,
              }
            : null
        }
      />

      <ShiftSwapRequestModal
        isOpen={!!swapModalRow}
        onClose={() => setSwapModalRow(null)}
        loading={
          createSwapMutation.isPending ||
          acceptSwapMutation.isPending ||
          withdrawSwapMutation.isPending
        }
        onSubmit={submitSwapRequest}
        onAcceptPeerSwap={acceptPeerSwap}
        existingRequest={
          swapModalRow?.swapRequest && swapModalRow.swapRole
            ? {
                request: swapModalRow.swapRequest,
                viewerRole: swapModalRow.swapRole,
              }
            : null
        }
        contextJob={swapModalRow?.job ?? null}
        onWithdraw={(id) =>
          withdrawSwapMutation.mutate(id, {
            onSuccess: () => setSwapModalRow(null),
          })
        }
        shiftInfo={
          swapModalRow?.dateYyyyMmDd
            ? {
                summaryLine: `${swapModalRow.date} · ${swapModalRow.startTime} – ${swapModalRow.endTime} · ${swapModalRow.jobTitle} · ${swapModalRow.shiftName}`,
                jobSlug: swapModalRow.job.jobSlug,
                shiftSlug: swapModalRow.shift.slug,
                fromShiftDate: swapModalRow.dateYyyyMmDd,
              }
            : null
        }
        pickupListDateRange={{
          startDate: formatDate(new Date(dateRange.startDate), 'yyyy-MM-dd'),
          endDate: formatDate(new Date(dateRange.endDate), 'yyyy-MM-dd'),
        }}
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
