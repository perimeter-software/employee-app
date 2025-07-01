import type { GignologyJob, Shift } from '@/domains/job'; // ✅ Consistent naming
import { parseISO, isAfter, format } from 'date-fns';
import { format as formatTz } from 'date-fns-tz';
import { getUserTimeZone } from '@/lib/utils'; // ✅ Updated import path
import { Punch, PunchDetail } from '@/domains/punch'; // ✅ Add missing imports
import type { RosterEntry } from '@/domains/job/types/schedule.types';

// Utility function to check if user is in roster (supports both old string[] and new RosterEntry[] formats)
export const isUserInRoster = (
  roster: string[] | RosterEntry[] | undefined,
  applicantId: string,
  targetDate?: string
): boolean => {
  if (!roster || !roster.length) return false;

  // Handle old format (array of strings)
  if (typeof roster[0] === 'string') {
    return (roster as string[]).includes(applicantId);
  }

  // Handle new format (array of objects with employeeId and date)
  const rosterEntries = roster as RosterEntry[];

  if (!targetDate) {
    // If no target date provided, check if user is in roster for any date
    return rosterEntries.some((entry) => entry.employeeId === applicantId);
  }

  // Check if user is in roster for specific date
  const targetDateStr = new Date(targetDate).toISOString().split('T')[0]; // Get YYYY-MM-DD format
  return rosterEntries.some(
    (entry) => entry.employeeId === applicantId && entry.date === targetDateStr
  );
};

// New shiftJob utils used to interact with shiftJobs
export const jobHasShiftForUser = (
  job: GignologyJob,
  applicantId: string
): boolean => {
  if (!job.shifts || !job.shifts.length) {
    return false;
  }
  // Get all the shifts for this job
  const shifts = job.shifts ? [...job.shifts] : [];

  // Return any shift where this user is included in the shiftRoster
  const usersShifts = shifts.filter((shift) => {
    if (!shift.shiftRoster || !shift.shiftRoster.length) return false;
    return shift.shiftRoster.some(
      (rosterEntry) => rosterEntry._id === applicantId
    );
  });

  if (usersShifts.length) {
    return true;
  }
  return false;
};

export const isJobGeoFenced = (job: GignologyJob): boolean => {
  if (!job.additionalConfig) {
    return false;
  }
  return job.additionalConfig.geofence;
};

export const doesJobAllowEarlyClockin = (job: GignologyJob): boolean => {
  if (!job.additionalConfig) {
    return false;
  }
  return job.additionalConfig.earlyClockInMinutes > 0 ? true : false;
};

export const doesJobAllowManualEdits = (job: GignologyJob): boolean => {
  if (!job?.additionalConfig) {
    return false; // ✅ Added missing return
  }
  return job?.additionalConfig?.allowManualPunches || false; // ✅ Added null safety
};

export const giveJobGeoCoords = (job: GignologyJob) => {
  return {
    lat: job?.location?.latitude ?? 0,
    long: job?.location?.longitude ?? 0,
  };
};

export const giveJobAllowedGeoDistance = (job: GignologyJob): number => {
  return (
    (job?.location?.graceDistanceFeet ?? 0) +
    (job?.location?.geocoordinates?.geoFenceRadius ?? 0) // ✅ Fixed null safety and operator precedence
  );
};

export const getShiftsForCalendarDay = (
  jobs: GignologyJob[], // All jobs
  applicantId: string, // Current user's ID
  specificDate: string, // The specific date for the calendar day
  weekStart: string, // Start of the selected week
  weekEnd: string, // End of the selected week
  includeUnassigned = false // Show unassigned shifts,
): {
  assignedShifts: {
    title: string;
    start: string;
    end: string;
    jobId: string;
  }[];
  unassignedShifts: {
    title: string;
    start: string;
    end: string;
    jobId: string;
  }[];
} => {
  const day = new Date(specificDate);
  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const currentDay = daysOfWeek[day.getDay()];

  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekEnd);

  const assignedShifts: {
    title: string;
    start: string;
    end: string;
    jobId: string;
  }[] = [];

  const unassignedShifts: {
    title: string;
    start: string;
    end: string;
    jobId: string;
  }[] = [];

  jobs.forEach((job) => {
    if (!job.shifts || !job.shifts.length) return;

    job.shifts.forEach((shift) => {
      const todaySchedule = shift.defaultSchedule?.[currentDay];
      const shiftStartDate = new Date(shift.shiftStartDate);
      const shiftEndDate = new Date(shift.shiftEndDate);

      const hasValidOverlap =
        shiftStartDate <= weekEndDate && // Shift starts before or on week end
        shiftEndDate >= weekStartDate && // Shift ends on or after week start
        shiftEndDate >= day; // Shift hasn't ended yet

      if (hasValidOverlap) {
        const isInShiftRoster = shift.shiftRoster?.some(
          (rosterEntry) => rosterEntry._id === applicantId
        );

        const isInDayRoster = isUserInRoster(
          todaySchedule?.roster,
          applicantId,
          specificDate
        );

        const shiftDetails = {
          title: `${job.title} - ${shift.shiftName}`,
          start: todaySchedule?.start
            ? format(new Date(todaySchedule.start), 'p')
            : 'N/A',
          end: todaySchedule?.end
            ? format(new Date(todaySchedule.end), 'p')
            : 'N/A',
          jobId: job._id,
        };

        if (shiftDetails.start !== 'N/A' && shiftDetails.end !== 'N/A') {
          if (isInShiftRoster && isInDayRoster) {
            // Assigned shifts
            assignedShifts.push(shiftDetails);
          } else if (isInShiftRoster && includeUnassigned) {
            // Unassigned shifts
            unassignedShifts.push(shiftDetails);
          }
        }
      }
    });
  });

  return { assignedShifts, unassignedShifts };
};

export const getDetailedUserShiftsForToday = (
  applicantId: string,
  currentTime: string,
  shift: Shift,
  specificDate: Date // Add parameter for specific date
) => {
  // If no specific date is provided, use current date
  const targetDate = specificDate || new Date(currentTime);

  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const currentDay = daysOfWeek[targetDate.getDay()];

  if (!shift) return { start: null, end: null };

  const todaySchedule = shift.defaultSchedule?.[currentDay];
  const shiftStartDate = new Date(shift.shiftStartDate);
  const shiftEndDate = new Date(shift.shiftEndDate);

  // Check if the shift is valid for this date
  const hasValidOverlap =
    shiftStartDate <= targetDate && // Shift has started
    shiftEndDate >= targetDate; // Shift hasn't ended

  if (!hasValidOverlap) return { start: null, end: null };

  // Check if user is in both roster lists
  const isInShiftRoster = shift.shiftRoster?.some(
    (rosterEntry) => rosterEntry._id === applicantId
  );
  const isInDayRoster = isUserInRoster(
    todaySchedule?.roster,
    applicantId,
    targetDate.toISOString()
  );

  if (
    isInShiftRoster &&
    isInDayRoster &&
    todaySchedule?.start &&
    todaySchedule?.end
  ) {
    // Create Date objects for the specific day
    const shiftStart = new Date(todaySchedule.start);
    const shiftEnd = new Date(todaySchedule.end);

    // Set the correct date while keeping the time
    const startDate = new Date(targetDate);
    startDate.setHours(shiftStart.getHours(), shiftStart.getMinutes());

    const endDate = new Date(targetDate);
    endDate.setHours(shiftEnd.getHours(), shiftEnd.getMinutes());

    return {
      start: startDate,
      end: endDate,
    };
  }

  return { start: null, end: null };
};

export const getUserShiftsForToday = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift // New optional parameter for the specific shift
) => {
  // If a specific shift is provided, check if the user is in its shiftRoster
  let usersShifts: Shift[] = [];

  if (shift) {
    if (shift.shiftRoster && shift.shiftRoster.length) {
      const isUserInShift = shift.shiftRoster.some(
        (rosterEntry) => rosterEntry._id === applicantId
      );

      if (isUserInShift) {
        usersShifts = [shift]; // Return the specific shift in an array
      }
    }
  } else {
    // If no specific shift is provided, filter all shifts for this job
    usersShifts = job?.shifts
      ? job.shifts.filter((shift) => {
          if (!shift.shiftRoster || !shift.shiftRoster.length) return false;
          return shift.shiftRoster.some(
            (rosterEntry) => rosterEntry._id === applicantId
          );
        })
      : [];
  }

  const now = new Date(currentTime);

  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;

  const currentDay = daysOfWeek[now.getDay()]; // Use the correct time zone to get the day

  return { usersShifts, currentDay };
};

export const getUserShiftForToday = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
) => {
  const { usersShifts, currentDay } = getUserShiftsForToday(
    job,
    applicantId,
    currentTime,
    shift // Pass the specific shift
  );

  const now = new Date(currentTime);

  for (const shift of usersShifts) {
    const todaySchedule = shift.defaultSchedule?.[currentDay];
    console.log('todaySchedule: ', todaySchedule);
    const shiftStartDate = new Date(shift.shiftStartDate);
    const shiftEndDate = new Date(shift.shiftEndDate);
    shiftEndDate.setHours(23, 59, 59, 999);

    const isWithinShiftDates = now >= shiftStartDate && now <= shiftEndDate;

    const isUserInShiftRoster = shift.shiftRoster?.some(
      (rosterEntry) => rosterEntry._id === applicantId
    );

    // Check if the applicant is in today's roster (if specified)
    const isUserInTodayRoster =
      !todaySchedule?.roster?.length || // no roster array or empty ⇒ allow
      isUserInRoster(todaySchedule.roster, applicantId, currentTime);

    if (
      isWithinShiftDates &&
      isUserInShiftRoster &&
      isUserInTodayRoster &&
      todaySchedule?.start &&
      todaySchedule?.end
    ) {
      return {
        start: new Date(todaySchedule.start),
        end: new Date(todaySchedule.end),
      };
    }
  }

  // Default return if no matching shift is found
  return {
    start: null,
    end: null,
  };
};

export const handleShiftJobClockInTime = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
): boolean => {
  // Get the early clock-in minutes, defaulting to 0 if not specified
  const earlyClockInMinutes = job.additionalConfig?.earlyClockInMinutes ?? 0;

  // Calculate the early clock-in window (either earlyClockInMinutes or 2, whichever is greater)
  const earlyClockInWindow = Math.max(earlyClockInMinutes, 2);

  // Get the user's shifts for today and the current day of the week
  const { usersShifts, currentDay } = getUserShiftsForToday(
    job,
    applicantId,
    currentTime,
    shift
  );

  // Get the current time in the specified time zone
  const now = new Date(currentTime);

  return usersShifts.some((shift) => {
    const todaySchedule = shift.defaultSchedule[currentDay];

    if (!todaySchedule || !todaySchedule.start || todaySchedule.start === '') {
      return false; // No valid shift start time
    }

    // Get the shift start time (in UTC) and convert it to the correct timezone
    const shiftStartTime = new Date(todaySchedule.start);
    const currentShiftStartTime = new Date(
      combineCurrentDateWithTimeFromDateObject(shiftStartTime, currentTime)
    );

    // Calculate the earliest clock-in time (allowing for the early clock-in window)
    const earliestClockInTime = new Date(
      currentShiftStartTime.getTime() - earlyClockInWindow * 60000
    );

    // Allow clock-in if it's within the early window or any time after the start time
    return now >= earliestClockInTime;
  });
};

export const getMinutesUntilClockIn = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
): number | null => {
  // Get the early clock-in minutes, defaulting to 0 if not specified
  const earlyClockInMinutes = job.additionalConfig?.earlyClockInMinutes ?? 0;

  // Calculate the early clock-in window (either earlyClockInMinutes or 2, whichever is greater)
  const earlyClockInWindow = Math.max(earlyClockInMinutes, 2);

  const now = new Date(currentTime);
  const { currentDay, usersShifts } = getUserShiftsForToday(
    job,
    applicantId,
    currentTime,
    shift
  );

  let earliestClockInTime: Date | null = null;

  for (const shift of usersShifts) {
    const todaySchedule = shift.defaultSchedule[currentDay];
    if (!todaySchedule || !todaySchedule.start || todaySchedule.start === '') {
      continue;
    }

    // Parse the shift start time (assumes time is stored without date info)
    const shiftStartTime = new Date(todaySchedule.start);

    // Get current date and combine with shift start time
    const combinedShiftStartTime = new Date(
      combineCurrentDateWithTimeFromDateObject(shiftStartTime, currentTime)
    );

    const earliestAllowedTime = new Date(
      combinedShiftStartTime.getTime() - earlyClockInWindow * 60000
    );

    if (
      earliestClockInTime === null ||
      earliestAllowedTime < earliestClockInTime
    ) {
      earliestClockInTime = earliestAllowedTime;
    }
  }

  if (earliestClockInTime === null) {
    return null; // No valid shifts found for today
  }

  const timeDifference = earliestClockInTime.getTime() - now.getTime();
  const minutesUntilClockIn = Math.ceil(timeDifference / 60000);

  return Math.max(0, minutesUntilClockIn); // Return 0 if it's already time to clock in
};

export function isToday(date: Date, shift?: Shift): boolean {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Basic same-day check
  const isSameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  // If no shift provided or it's the same day, use regular check
  if (!shift || isSameDay) {
    return isSameDay;
  }

  // Get the day of week for the date we're checking
  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const dayName = daysOfWeek[date.getDay()];

  // Get the schedule for this day
  const schedule = shift.defaultSchedule[dayName];
  if (!schedule?.start || !schedule?.end) {
    return isSameDay;
  }

  // Create Date objects for shift start and end times
  const startTime = new Date(schedule.start);
  const endTime = new Date(schedule.end);

  // Check if this is an overnight shift
  const isOvernight = endTime.getHours() < startTime.getHours();

  if (isOvernight) {
    // For overnight shifts, also return true if:
    // 1. It's tomorrow but before the shift end time
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) {
      const currentTime = new Date();
      return (
        currentTime.getHours() < endTime.getHours() ||
        (currentTime.getHours() === endTime.getHours() &&
          currentTime.getMinutes() <= endTime.getMinutes())
      );
    }
  }

  return isSameDay;
}

export function isShiftWithinRange(
  shift: Shift,
  job: GignologyJob,
  applicantId: string,
  currentDate: Date,
  punchDay: string,
  shiftDate: Date
): boolean {
  if (!isToday(shiftDate)) {
    return false;
  }

  const currentDay = formatTz(currentDate, 'eee', {
    timeZone: getUserTimeZone(),
  });

  if (punchDay !== currentDay) {
    return false;
  }

  // Check if current date falls within the shift's overall date range
  const shiftStartDate = new Date(shift.shiftStartDate);
  const shiftEndDate = new Date(shift.shiftEndDate);
  shiftEndDate.setHours(23, 59, 59, 999);
  const isWithinShiftDates =
    currentDate >= shiftStartDate && currentDate <= shiftEndDate;

  if (!isWithinShiftDates) {
    return false;
  }

  // Map short day names to full day names
  const dayMapping = {
    Sun: 'sunday',
    Mon: 'monday',
    Tue: 'tuesday',
    Wed: 'wednesday',
    Thu: 'thursday',
    Fri: 'friday',
    Sat: 'saturday',
  };

  const mappedDay = dayMapping[punchDay as keyof typeof dayMapping];
  const todaySchedule =
    shift.defaultSchedule?.[mappedDay as keyof typeof shift.defaultSchedule];

  // Early return if no schedule for this day
  if (!todaySchedule?.start || !todaySchedule?.end) {
    return false;
  }

  // Check if user is in the overall shift roster
  const isUserInShiftRoster = shift.shiftRoster?.some(
    (rosterEntry) => rosterEntry._id === applicantId
  );

  if (!isUserInShiftRoster) {
    return false;
  }

  // Check if user is in the roster for this specific day
  const isInTodayRoster = todaySchedule.roster
    ? isUserInRoster(todaySchedule.roster, applicantId, shiftDate.toISOString())
    : true; // If no roster specified for today, consider it valid

  if (!isInTodayRoster) {
    return false;
  }

  // Convert schedule times to comparable times in current date context
  const scheduleStart = new Date(todaySchedule.start);
  const scheduleEnd = new Date(todaySchedule.end);

  const localCurrentDate = new Date(currentDate);

  // Use combineCurrentDateWithTimeFromDateObject for consistent time comparison
  const adjustedScheduleStart = new Date(
    combineCurrentDateWithTimeFromDateObject(
      scheduleStart,
      localCurrentDate.toISOString()
    )
  );

  const adjustedScheduleEnd = new Date(
    combineCurrentDateWithTimeFromDateObject(
      scheduleEnd,
      localCurrentDate.toISOString(),
      scheduleStart
    )
  );

  // Add buffer for early clock in (if configured)
  const earlyBuffer = job.additionalConfig?.earlyClockInMinutes || 0;
  adjustedScheduleStart.setMinutes(
    adjustedScheduleStart.getMinutes() - earlyBuffer
  );

  // Check if current time falls within the shift window
  return (
    localCurrentDate >= adjustedScheduleStart &&
    localCurrentDate <= adjustedScheduleEnd
  );
}

// Helper function to check if a punch exists for the current day and shift
export function hasExistingPunchForShift(
  punches: Punch[],
  shiftName: string,
  punchDay: string
): boolean {
  const dayPunch = punches.find((p) => p.day === punchDay);
  if (!dayPunch || !dayPunch.details) return false; // ✅ Added null check

  return dayPunch.details?.some(
    (detail: PunchDetail) =>
      detail.originalPunch.shiftName === shiftName &&
      !detail.originalPunch.timeOut
  );
}

export function isPastClockOutTime(
  shift: Shift,
  job: GignologyJob,
  applicantId: string,
  currentDate: Date
) {
  const { end } = getUserShiftForToday(
    job,
    applicantId,
    currentDate.toISOString(),
    shift
  );

  if (end) {
    return currentDate > end; // Check if current time is past the shift's end time
  }
  return false;
}

export function isFutureShift(
  shift: Shift,
  job: GignologyJob,
  applicantId: string,
  currentDate: Date
) {
  const { start } = getUserShiftForToday(
    job,
    applicantId,
    currentDate.toISOString(),
    shift
  );

  if (start) {
    return currentDate < start; // Check if current time is before the shift's start time
  }
  return false;
}

export const getCalculatedTimeIn = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
): string => {
  const { start } = getUserShiftForToday(job, applicantId, currentTime, shift);
  const newStartDate = combineCurrentDateWithTimeFromDateObject(
    start as Date,
    currentTime
  );
  const earlyClockInMinutes = job.additionalConfig?.earlyClockInMinutes ?? 0;
  const autoAdjustEarlyClockIn =
    job.additionalConfig?.autoAdjustEarlyClockIn ?? false;

  const now = new Date(currentTime);

  const shiftStart = newStartDate ? new Date(newStartDate) : null;

  const earliestAllowedClockInTime =
    earlyClockInMinutes && shiftStart
      ? new Date(shiftStart.getTime() - earlyClockInMinutes * 60000)
      : null;

  let timeIn: Date;

  if (shiftStart && earliestAllowedClockInTime) {
    if (now >= earliestAllowedClockInTime && now <= shiftStart) {
      if (autoAdjustEarlyClockIn) {
        timeIn = shiftStart;
      } else {
        timeIn = now;
      }
    } else {
      timeIn = now;
    }
  } else {
    timeIn = now;
  }

  return timeIn.toISOString();
};

// Need to reconsile with u345ls  (< search that to find other spot fast)
export const hasForgottenToClockOut = (
  job: GignologyJob, // ✅ Added proper typing
  punch: Punch, // ✅ Added proper typing
  current: string // ✅ Added proper typing
): boolean => {
  // If there's a timeOut, the user has clocked out
  if (punch.timeOut) {
    return false;
  }

  const timeIn = parseISO(punch.timeIn);
  const punchDay = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ][timeIn.getDay()];

  const currentTime = new Date(current);

  if (!job.shifts) {
    // ✅ Added null check
    return false;
  }

  // Check all shifts for the job
  for (const shift of job.shifts) {
    const schedule =
      shift.defaultSchedule[punchDay as keyof typeof shift.defaultSchedule];
    if (!schedule || !schedule.end) continue;

    const shiftEndTime = parseISO(schedule.end);
    // If the current time is before the shift end time, it's not forgotten
    if (isAfter(shiftEndTime, currentTime)) {
      return false;
    }
  }

  // If we've gone through all shifts and haven't returned false, it's forgotten
  return true;
};

export const getTotalSecondsFromDate = (date: Date): number => {
  // Extract the hours, minutes, and seconds from the date
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  // Convert the time to total seconds since midnight
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  return totalSeconds;
};

export function combineCurrentDateWithTimeFromDateObject(
  timeObj: Date,
  currentTime: string,
  compareDateObj?: Date
): string {
  const currentDate = new Date(currentTime);

  console.log('=== combineCurrentDateWithTimeFromDateObject DEBUG ===');
  console.log('Input timeObj:', timeObj);
  console.log('Input currentTime:', currentTime);
  console.log('timeObj ISO:', timeObj.toISOString());
  console.log('timeObj toString:', timeObj.toString());
  console.log('timeObj getHours():', timeObj.getHours());
  console.log('timeObj getUTCHours():', timeObj.getUTCHours());

  // Create a new date with today's date but the time from timeObj
  const result = new Date(currentDate);

  // Method 1: Use local time (what the user sees)
  result.setHours(
    timeObj.getHours(),
    timeObj.getMinutes(),
    timeObj.getSeconds(),
    timeObj.getMilliseconds()
  );

  console.log('Result after setting local time:', result);
  console.log('Result ISO:', result.toISOString());

  // Handle overnight shifts if compareDateObj is provided
  if (compareDateObj) {
    const compareResult = new Date(currentDate);
    compareResult.setHours(
      compareDateObj.getHours(),
      compareDateObj.getMinutes(),
      compareDateObj.getSeconds(),
      compareDateObj.getMilliseconds()
    );

    console.log('Compare result:', compareResult);

    // If end time is before start time, it's an overnight shift
    if (result <= compareResult) {
      result.setDate(result.getDate() + 1);
      console.log('Adjusted for overnight shift:', result);
    }
  }

  console.log('Final result:', result.toISOString());
  console.log('======================================================');

  return result.toISOString();
}
