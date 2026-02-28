'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ChevronDown } from 'lucide-react';
import { format, parseISO, startOfDay, isWithinInterval, isAfter, isBefore } from 'date-fns';
import { GignologyJob, Shift } from '@/domains/job/types/job.types';
import { GignologyUser } from '@/domains/user/types';
import {
  getUserShiftForToday,
  handleShiftJobClockInTime,
  combineCurrentDateWithTimeFromDateObject,
} from '@/domains/punch/utils/shift-job-utils';
import { PunchWithJobInfo } from '@/domains/punch/types';

interface JobShiftSelectorProps {
  userData: GignologyUser;
  selectedJob: GignologyJob | null;
  selectedShift: Shift | null;
  availableShifts: Shift[];
  blockJobSelection: boolean;
  onJobSelect: (job: GignologyJob) => void;
  onShiftSelect: (shift: Shift) => void;
  currentOpenPunch?: PunchWithJobInfo; // PunchWithJobInfo or null
  isClocked?: boolean;
}

export function JobShiftSelector({
  userData,
  selectedJob,
  selectedShift,
  availableShifts,
  blockJobSelection,
  onJobSelect,
  onShiftSelect,
  currentOpenPunch,
  isClocked,
}: JobShiftSelectorProps) {
  // Function to find the current active shift based on time
  const findCurrentActiveShift = useCallback(() => {
    if (!userData?.jobs) return { job: null, shift: null };

    const now = new Date();
    const currentTime = format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS");

    // Look through all jobs and shifts to find what's active now
    for (const job of userData.jobs) {
      if (!job.shifts) continue;

      for (const shift of job.shifts) {
        // Check if user has this shift today
        const { start, end } = getUserShiftForToday(
          job,
          userData.applicantId,
          currentTime,
          shift
        );

        if (!start || !end) continue;

        // Get actual shift times for today
        const shiftStartTime = combineCurrentDateWithTimeFromDateObject(
          start as Date,
          currentTime
        );
        const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
          end as Date,
          currentTime,
          start as Date
        );

        const shiftStart = new Date(shiftStartTime);
        const shiftEnd = new Date(shiftEndTime);

        // Check if we're currently within this shift's time window
        // Also check if we can clock in (within early clock-in window)
        const canClockIn = handleShiftJobClockInTime(
          job,
          userData.applicantId,
          currentTime,
          shift
        );

        const isWithinShiftTime = now >= shiftStart && now <= shiftEnd;
        const isNearShiftTime = canClockIn && now <= shiftEnd;

        if (isWithinShiftTime || isNearShiftTime) {
          return { job, shift };
        }
      }
    }

    return { job: null, shift: null };
  }, [userData]);

  // Function to find upcoming shift (if no current active shift)
  const findUpcomingShift = useCallback(() => {
    if (!userData?.jobs) return { job: null, shift: null };

    const now = new Date();
    const currentTime = format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS");
    let closestShift: {
      job: GignologyJob;
      shift: Shift;
      startTime: Date;
    } | null = null;

    // Look for the next upcoming shift today
    for (const job of userData.jobs) {
      if (!job.shifts) continue;

      for (const shift of job.shifts) {
        const { start, end } = getUserShiftForToday(
          job,
          userData.applicantId,
          currentTime,
          shift
        );

        if (!start || !end) continue;

        const shiftStartTime = combineCurrentDateWithTimeFromDateObject(
          start as Date,
          currentTime
        );
        const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
          end as Date,
          currentTime,
          start as Date
        );

        const shiftStart = new Date(shiftStartTime);
        const shiftEnd = new Date(shiftEndTime);

        // Only consider future shifts that haven't ended
        if (shiftStart > now && shiftEnd > now) {
          if (!closestShift || shiftStart < closestShift.startTime) {
            closestShift = { job, shift, startTime: shiftStart };
          }
        }
      }
    }

    return closestShift
      ? { job: closestShift.job, shift: closestShift.shift }
      : { job: null, shift: null };
  }, [userData]);

  // Group jobs/shifts by time context (Today / Upcoming / Past) for grouped dropdown
  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const todayStart = useMemo(
    () => startOfDay(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayDateKey]
  );

  const groupedJobs = useMemo(() => {
    const today: GignologyJob[] = [];
    const upcomingOnly: GignologyJob[] = [];
    const past: GignologyJob[] = [];
    const jobs = userData?.jobs ?? [];
    const applicantId = userData?.applicantId ?? '';
    const currentTime = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSS");

    for (const job of jobs) {
      const shifts = job.shifts || [];
      if (shifts.length === 0) {
        past.push(job);
        continue;
      }
      // Today = at least one shift actually runs today for this employee (defaultSchedule + roster for today)
      // Upcoming = employee is assigned to a shift that hasn't started yet (shift start > today)
      let hasToday = false;
      let hasUpcomingForEmployee = false;
      let latestEnd: Date | null = null;

      for (const shift of shifts) {
        const startStr = shift.shiftStartDate;
        const endStr = shift.shiftEndDate;
        if (!startStr || !endStr) continue;
        try {
          const shiftStartDay = startOfDay(parseISO(startStr));
          const shiftEndDay = startOfDay(parseISO(endStr));
          // Only count as "today" if this shift actually occurs today for this employee
          if (applicantId) {
            const result = getUserShiftForToday(job, applicantId, currentTime, shift);
            if (result?.start && result?.end) {
              hasToday = true;
            }
            const isInRoster = shift.shiftRoster?.some(
              (rosterEntry) => rosterEntry._id === applicantId
            );
            // Upcoming = employee is in roster AND (shift starts after today OR has a roster assignment on a future date)
            if (isInRoster) {
              if (isAfter(shiftStartDay, todayStart)) {
                hasUpcomingForEmployee = true;
              }
              const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
              for (const day of days) {
                const scheduleEntry = shift.defaultSchedule?.[day];
                const roster = scheduleEntry?.roster;
                if (!Array.isArray(roster)) continue;
                for (const entry of roster) {
                  if (entry && typeof entry === 'object' && 'employeeId' in entry && 'date' in entry) {
                    const e = entry as { employeeId: string; date: string; status?: string };
                    if (e.status === 'pending') continue;
                    const empId = e.employeeId;
                    const dateStr = e.date;
                    if (empId === applicantId && dateStr) {
                      try {
                        const rosterDay = startOfDay(parseISO(dateStr));
                        if (isAfter(rosterDay, todayStart)) {
                          hasUpcomingForEmployee = true;
                          break;
                        }
                      } catch {
                        // skip invalid date
                      }
                    }
                  }
                }
                if (hasUpcomingForEmployee) break;
              }
            }
          }
          if (!latestEnd || isAfter(shiftEndDay, latestEnd)) {
            latestEnd = shiftEndDay;
          }
        } catch {
          // skip
        }
      }

      const hasFuture = latestEnd !== null && !isBefore(latestEnd, todayStart);
      if (hasFuture) {
        if (hasToday) {
          today.push(job);
        } else if (hasUpcomingForEmployee) {
          // Employee has an assigned shift that hasn't started yet → Upcoming
          upcomingOnly.push(job);
        } else {
          // Job has future shift end but employee has no shift today and no shift starting in future → Past
          past.push(job);
        }
      } else {
        past.push(job);
      }
    }

    const getEarliestShiftStart = (j: GignologyJob): Date | null => {
      let earliest: Date | null = null;
      for (const s of j.shifts || []) {
        if (!s.shiftStartDate) continue;
        try {
          const d = parseISO(s.shiftStartDate);
          if (!earliest || isBefore(d, earliest)) earliest = d;
        } catch {
          // skip
        }
      }
      return earliest;
    };
    const getLatestShiftEnd = (j: GignologyJob): Date | null => {
      let latest: Date | null = null;
      for (const s of j.shifts || []) {
        if (!s.shiftEndDate) continue;
        try {
          const d = parseISO(s.shiftEndDate);
          if (!latest || isAfter(d, latest)) latest = d;
        } catch {
          // skip
        }
      }
      return latest;
    };
    upcomingOnly.sort((a, b) => {
      const aStart = getEarliestShiftStart(a);
      const bStart = getEarliestShiftStart(b);
      if (!aStart || !bStart) return 0;
      return isBefore(aStart, bStart) ? -1 : 1;
    });
    past.sort((a, b) => {
      const aEnd = getLatestShiftEnd(a);
      const bEnd = getLatestShiftEnd(b);
      if (!aEnd || !bEnd) return 0;
      return isAfter(aEnd, bEnd) ? -1 : 1;
    });
    return { today, upcomingOnly, past };
  }, [userData?.jobs, userData?.applicantId, todayStart]);

  const groupedShifts = useMemo(() => {
    const today: Shift[] = [];
    const upcomingOnly: Shift[] = [];
    const past: Shift[] = [];
    const applicantId = userData?.applicantId ?? '';
    const currentTime = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSS");
    const job = selectedJob ?? null;

    for (const shift of availableShifts) {
      const startStr = shift.shiftStartDate;
      const endStr = shift.shiftEndDate;
      if (!startStr || !endStr) {
        past.push(shift);
        continue;
      }
      let shiftStartDay: Date;
      let shiftEndDay: Date;
      try {
        shiftStartDay = startOfDay(parseISO(startStr));
        shiftEndDay = startOfDay(parseISO(endStr));
      } catch {
        past.push(shift);
        continue;
      }

      const hasEnded = isBefore(shiftEndDay, todayStart);
      if (hasEnded) {
        past.push(shift);
        continue;
      }

      // Employee-aware: use same logic as job grouping (today = roster today, upcoming = future roster or shift starts future)
      if (job && applicantId) {
        const result = getUserShiftForToday(job, applicantId, currentTime, shift);
        if (result?.start && result?.end) {
          today.push(shift);
          continue;
        }
        const isInRoster = shift.shiftRoster?.some(
          (rosterEntry) => rosterEntry._id === applicantId
        );
        let hasUpcomingForEmployee = false;
        if (isInRoster) {
          if (isAfter(shiftStartDay, todayStart)) {
            hasUpcomingForEmployee = true;
          }
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
          for (const day of days) {
            const scheduleEntry = shift.defaultSchedule?.[day];
            const roster = scheduleEntry?.roster;
            if (!Array.isArray(roster)) continue;
            for (const entry of roster) {
              if (entry && typeof entry === 'object' && 'employeeId' in entry && 'date' in entry) {
                const e = entry as { employeeId: string; date: string; status?: string };
                if (e.status === 'pending') continue;
                const empId = e.employeeId;
                const dateStr = e.date;
                if (empId === applicantId && dateStr) {
                  try {
                    const rosterDay = startOfDay(parseISO(dateStr));
                    if (isAfter(rosterDay, todayStart)) {
                      hasUpcomingForEmployee = true;
                      break;
                    }
                  } catch {
                    // skip invalid date
                  }
                }
              }
            }
            if (hasUpcomingForEmployee) break;
          }
        }
        if (hasUpcomingForEmployee) {
          upcomingOnly.push(shift);
        } else {
          past.push(shift);
        }
      } else {
        // Fallback: date-range only when no job/applicant
        const spansToday = isWithinInterval(todayStart, { start: shiftStartDay, end: shiftEndDay });
        const startsInFuture = isAfter(shiftStartDay, todayStart);
        if (spansToday) {
          today.push(shift);
        } else if (startsInFuture) {
          upcomingOnly.push(shift);
        } else {
          past.push(shift);
        }
      }
    }

    const sortUpcoming = (a: Shift, b: Shift) => {
      try {
        return isBefore(parseISO(a.shiftStartDate), parseISO(b.shiftStartDate)) ? -1 : 1;
      } catch {
        return 0;
      }
    };
    upcomingOnly.sort(sortUpcoming);
    past.sort((a, b) => {
      try {
        return isAfter(parseISO(a.shiftEndDate), parseISO(b.shiftEndDate)) ? -1 : 1;
      } catch {
        return 0;
      }
    });
    return { today, upcomingOnly, past };
  }, [availableShifts, todayStart, selectedJob, userData?.applicantId]);

  const getShiftDateContext = useCallback((shift: Shift): string => {
    const startStr = shift.shiftStartDate;
    const endStr = shift.shiftEndDate;
    if (!startStr || !endStr) return '—';
    let start: Date;
    let end: Date;
    try {
      start = parseISO(startStr);
      end = parseISO(endStr);
    } catch {
      return '—';
    }
    const shiftStartDay = startOfDay(start);
    const shiftEndDay = startOfDay(end);
    if (isWithinInterval(todayStart, { start: shiftStartDay, end: shiftEndDay })) return 'Today';
    if (isAfter(shiftStartDay, todayStart)) return `Starts ${format(start, 'MMM d')}`;
    return `Ended ${format(end, 'MMM d')}`;
  }, [todayStart]);

  // Auto-select logic
  useEffect(() => {
    // Case 1: User is clocked in - ensure job/shift from open punch is selected
    if (isClocked && currentOpenPunch) {
      const punchJob = userData?.jobs?.find(
        (job) => job._id === currentOpenPunch.jobId
      );
      if (punchJob && (!selectedJob || selectedJob._id !== punchJob._id)) {
        onJobSelect(punchJob);
      }

      if (currentOpenPunch.shiftSlug && punchJob?.shifts) {
        const punchShift = punchJob.shifts.find(
          (shift) => shift.slug === currentOpenPunch.shiftSlug
        );
        if (
          punchShift &&
          (!selectedShift || selectedShift.slug !== punchShift.slug)
        ) {
          onShiftSelect(punchShift);
        }
      }
      return;
    }

    // Case 2: User just clocked out - clear selections
    if (!isClocked && !currentOpenPunch && (selectedJob || selectedShift)) {
      // Note: The clearing should be handled by the parent component (TimerCard)
      // when clock out is successful, so we don't clear here to avoid conflicts
      return;
    }

    // Case 3: User is not clocked in - auto-select based on current time
    if (!isClocked && !currentOpenPunch && !blockJobSelection) {
      // Only auto-select if nothing is currently selected
      if (!selectedJob || !selectedShift) {
        // First, try to find current active shift
        const { job: activeJob, shift: activeShift } = findCurrentActiveShift();

        if (activeJob && activeShift) {
          if (!selectedJob || selectedJob._id !== activeJob._id) {
            onJobSelect(activeJob);
          }
          // Wait for availableShifts to update before selecting shift
          if (selectedJob && selectedJob._id === activeJob._id) {
            if (!selectedShift || selectedShift.slug !== activeShift.slug) {
              onShiftSelect(activeShift);
            }
          }
        } else {
          // If no active shift, try to find upcoming shift
          const { job: upcomingJob, shift: upcomingShift } =
            findUpcomingShift();

          if (upcomingJob && upcomingShift) {
            if (!selectedJob || selectedJob._id !== upcomingJob._id) {
              onJobSelect(upcomingJob);
            }
            // Wait for availableShifts to update before selecting shift
            if (selectedJob && selectedJob._id === upcomingJob._id) {
              if (!selectedShift || selectedShift.slug !== upcomingShift.slug) {
                onShiftSelect(upcomingShift);
              }
            }
          }
        }
      }
    }
  }, [
    isClocked,
    currentOpenPunch,
    selectedJob,
    selectedShift,
    blockJobSelection,
    userData,
    onJobSelect,
    onShiftSelect,
    findCurrentActiveShift,
    findUpcomingShift,
  ]);

  // Auto-select shift when job changes and availableShifts updates
  useEffect(() => {
    if (
      selectedJob &&
      availableShifts.length > 0 &&
      !selectedShift &&
      !isClocked &&
      !blockJobSelection
    ) {
      // Try to find the appropriate shift for the selected job
      const { shift: appropriateShift } = findCurrentActiveShift();

      if (
        appropriateShift &&
        availableShifts.some((s) => s.slug === appropriateShift.slug)
      ) {
        onShiftSelect(appropriateShift);
      } else {
        // If no appropriate shift found, try upcoming shift
        const { shift: upcomingShift } = findUpcomingShift();
        if (
          upcomingShift &&
          availableShifts.some((s) => s.slug === upcomingShift.slug)
        ) {
          onShiftSelect(upcomingShift);
        }
      }
    }
  }, [
    selectedJob,
    availableShifts,
    selectedShift,
    isClocked,
    blockJobSelection,
    onShiftSelect,
    findCurrentActiveShift,
    findUpcomingShift,
  ]);

  return (
    <div className="space-y-4 mb-8">
      {/* Job Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300 data-[state=open]:border-blue-300"
            disabled={blockJobSelection}
            title={
              blockJobSelection
                ? 'Please clock out of your current punch first.'
                : 'Select a job to work on'
            }
          >
            <span className="truncate">
              {selectedJob?.title || 'Select Job'}
            </span>
            <ChevronDown className="h-5 w-5 flex-shrink-0 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-[var(--radix-dropdown-menu-trigger-width)] w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto"
          align="start"
        >
          {groupedJobs.today.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                Today
              </DropdownMenuLabel>
              {groupedJobs.today.map((job) => (
                <DropdownMenuItem
                  key={job._id}
                  inset
                  onClick={() => onJobSelect(job)}
                  className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                    selectedJob?._id === job._id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : ''
                  }`}
                >
                  <span className="truncate">
                    {job.title ? job.title.charAt(0).toUpperCase() + job.title.slice(1) : job._id}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {groupedJobs.upcomingOnly.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                Upcoming
              </DropdownMenuLabel>
              {groupedJobs.upcomingOnly.map((job) => (
                <DropdownMenuItem
                  key={job._id}
                  inset
                  onClick={() => onJobSelect(job)}
                  className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                    selectedJob?._id === job._id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : ''
                  }`}
                >
                  <span className="truncate">
                    {job.title ? job.title.charAt(0).toUpperCase() + job.title.slice(1) : job._id}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {groupedJobs.past.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                Past
              </DropdownMenuLabel>
              {groupedJobs.past.map((job) => (
                <DropdownMenuItem
                  key={job._id}
                  inset
                  onClick={() => onJobSelect(job)}
                  className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                    selectedJob?._id === job._id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : ''
                  }`}
                >
                  <span className="truncate">
                    {job.title ? job.title.charAt(0).toUpperCase() + job.title.slice(1) : job._id}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Shift Selector */}
      {selectedJob && availableShifts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300 data-[state=open]:border-blue-300"
              disabled={blockJobSelection}
              title={
                blockJobSelection
                  ? 'Please clock out of your current punch first.'
                  : 'Select a shift time'
              }
            >
              <span className="truncate">
                {selectedShift?.shiftName ||
                  selectedShift?.slug ||
                  'Select Shift'}
              </span>
              <ChevronDown className="h-5 w-5 flex-shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[var(--radix-dropdown-menu-trigger-width)] w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto"
            align="start"
          >
            {groupedShifts.today.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                  Today
                </DropdownMenuLabel>
                {groupedShifts.today.map((shift) => (
                  <DropdownMenuItem
                    key={shift.slug}
                    inset
                    onClick={() => onShiftSelect(shift)}
                    className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                      selectedShift?.slug === shift.slug
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="truncate">
                        {(shift.shiftName || shift.slug).charAt(0).toUpperCase() +
                          (shift.shiftName || shift.slug).slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {getShiftDateContext(shift)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
            {groupedShifts.upcomingOnly.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                  Upcoming
                </DropdownMenuLabel>
                {groupedShifts.upcomingOnly.map((shift) => (
                  <DropdownMenuItem
                    key={shift.slug}
                    inset
                    onClick={() => onShiftSelect(shift)}
                    className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                      selectedShift?.slug === shift.slug
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="truncate">
                        {(shift.shiftName || shift.slug).charAt(0).toUpperCase() +
                          (shift.shiftName || shift.slug).slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {getShiftDateContext(shift)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
            {groupedShifts.past.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5 px-2 pointer-events-none">
                  Past
                </DropdownMenuLabel>
                {groupedShifts.past.map((shift) => (
                  <DropdownMenuItem
                    key={shift.slug}
                    inset
                    onClick={() => onShiftSelect(shift)}
                    className={`cursor-pointer py-1.5 pl-8 pr-2 ${
                      selectedShift?.slug === shift.slug
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className="truncate">
                        {(shift.shiftName || shift.slug).charAt(0).toUpperCase() +
                          (shift.shiftName || shift.slug).slice(1)}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {getShiftDateContext(shift)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Helper text */}
      {selectedJob && availableShifts.length === 0 && (
        <p className="text-sm text-gray-500 text-center">
          No available shifts for this job today
        </p>
      )}
    </div>
  );
}
