'use client';

import React, { useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ChevronDown } from 'lucide-react';
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
    const currentTime = now.toISOString();

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
    const currentTime = now.toISOString();
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
        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
          {userData.jobs?.map((job: GignologyJob) => (
            <DropdownMenuItem
              key={job._id}
              onClick={() => onJobSelect(job)}
              className={`cursor-pointer ${
                selectedJob?._id === job._id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : ''
              }`}
            >
              <span className="truncate">{job.title}</span>
            </DropdownMenuItem>
          ))}
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
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
            {availableShifts.map((shift) => (
              <DropdownMenuItem
                key={shift.slug}
                onClick={() => onShiftSelect(shift)}
                className={`cursor-pointer ${
                  selectedShift?.slug === shift.slug
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : ''
                }`}
              >
                <span className="truncate">
                  {shift.shiftName || shift.slug}
                </span>
              </DropdownMenuItem>
            ))}
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
