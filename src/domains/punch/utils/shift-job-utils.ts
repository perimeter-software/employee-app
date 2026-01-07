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

  console.log(
    '🔍 isUserInRoster - Checking roster for applicant:',
    applicantId
  );
  console.log('  - Roster:', roster);
  console.log('  - Target date:', targetDate);

  // Handle old format (array of strings)
  if (typeof roster[0] === 'string') {
    const result = (roster as string[]).includes(applicantId);
    console.log('  - Old format (string array), result:', result);
    return result;
  }

  // Handle new format (array of objects with employeeId and date)
  const rosterEntries = roster as RosterEntry[];

  if (!targetDate) {
    // If no target date provided, check if user is in roster for any date
    const result = rosterEntries.some(
      (entry) => entry.employeeId === applicantId
    );
    console.log('  - No target date, checking any date, result:', result);
    return result;
  }

  // Check if user is in roster for specific date
  // Parse the date and format as YYYY-MM-DD using local time to avoid timezone issues
  const targetDateStr = format(parseISO(targetDate), 'yyyy-MM-dd');
  console.log('  - Target date string (YYYY-MM-DD):', targetDateStr);

  const result = rosterEntries.some(
    (entry) => entry.employeeId === applicantId && entry.date === targetDateStr
  );

  console.log('  - Checking entries:');
  rosterEntries.forEach((entry, index) => {
    console.log(
      `    ${index}: employeeId=${entry.employeeId}, date=${entry.date}, matches=${entry.employeeId === applicantId && entry.date === targetDateStr}`
    );
  });
  console.log('  - Final result:', result);

  return result;
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

  console.log('now: ', now);

  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;

  // REMOVED: Early morning work day logic that was causing confusion
  // A shift at 3:05 AM on Thursday IS a Thursday shift, not Wednesday
  const currentDay = daysOfWeek[now.getDay()];

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

  console.log('currentDay: ', currentDay);

  // Check current day first
  for (const shift of usersShifts) {
    const todaySchedule = shift.defaultSchedule?.[currentDay];
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

    console.log('🔍 getUserShiftForToday - Checking shift:', shift.shiftName);
    console.log('  - Current day:', currentDay);
    console.log('  - Today schedule:', todaySchedule);
    console.log('  - Shift start date:', shiftStartDate.toISOString());
    console.log('  - Shift end date:', shiftEndDate.toISOString());
    console.log('  - Is within shift dates:', isWithinShiftDates);
    console.log('  - Is user in shift roster:', isUserInShiftRoster);
    console.log('  - Is user in today roster:', isUserInTodayRoster);
    console.log('  - Roster entries:', todaySchedule?.roster);

    // REMOVED: The scheduleTimesMatchCurrentDate validation was too strict
    // It was rejecting valid shifts due to date mismatches in the database
    // We only care about the TIME part of shifts, not the specific dates

    if (
      isWithinShiftDates &&
      isUserInShiftRoster &&
      isUserInTodayRoster &&
      todaySchedule?.start &&
      todaySchedule?.end
    ) {
      // Check if this is an overnight shift that starts today
      const startTime = new Date(todaySchedule.start);
      const endTime = new Date(todaySchedule.end);

      // If end time is earlier in the day than start time, it's an overnight shift
      if (endTime.getHours() < startTime.getHours()) {
        // This is an overnight shift starting today
        console.log('Found overnight shift starting today:', {
          shiftName: shift.shiftName,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        });
      }

      console.log('✅ getUserShiftForToday - Found valid shift for today!');
      return {
        start: new Date(todaySchedule.start),
        end: new Date(todaySchedule.end),
      };
    }
  }

  // FIXED: Check for overnight shifts from previous day
  const daysOfWeek = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;

  // Get previous day
  const previousDay = new Date(now);
  previousDay.setDate(previousDay.getDate() - 1);
  const previousDayName = daysOfWeek[previousDay.getDay()];

  for (const shift of usersShifts) {
    const previousDaySchedule = shift.defaultSchedule?.[previousDayName];
    const shiftStartDate = new Date(shift.shiftStartDate);
    const shiftEndDate = new Date(shift.shiftEndDate);
    shiftEndDate.setHours(23, 59, 59, 999);

    const isWithinShiftDates = now >= shiftStartDate && now <= shiftEndDate;

    const isUserInShiftRoster = shift.shiftRoster?.some(
      (rosterEntry) => rosterEntry._id === applicantId
    );

    // Check if the applicant is in previous day's roster (for overnight shifts)
    const isUserInPreviousDayRoster =
      !previousDaySchedule?.roster?.length || // no roster array or empty ⇒ allow
      isUserInRoster(
        previousDaySchedule.roster,
        applicantId,
        previousDay.toISOString()
      );

    if (
      isWithinShiftDates &&
      isUserInShiftRoster &&
      isUserInPreviousDayRoster &&
      previousDaySchedule?.start &&
      previousDaySchedule?.end
    ) {
      const startTime = new Date(previousDaySchedule.start);
      const endTime = new Date(previousDaySchedule.end);

      // CRITICAL FIX: Proper overnight shift detection
      // Overnight shift: start time is late evening/night (after 18:00) AND end time is early morning (before 12:00)
      const startHour = startTime.getHours();
      const endHour = endTime.getHours();
      const isOvernightShift = startHour >= 18 && endHour < 12;

      if (isOvernightShift) {
        // This is an overnight shift, so it continues into today
        console.log('Found overnight shift from previous day:', {
          shiftName: shift.shiftName,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        });

        return {
          start: new Date(previousDaySchedule.start),
          end: new Date(previousDaySchedule.end),
        };
      }
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

  console.log('=== CLOCK IN VALIDATION DEBUG ===');
  console.log('Job:', job.title);
  console.log(
    'Specific shift requested:',
    shift?.shiftName || 'None - checking all shifts'
  );
  console.log('ApplicantId:', applicantId);
  console.log('CurrentTime:', currentTime);
  console.log('earlyClockInMinutes from job config:', earlyClockInMinutes);

  // Use the exact early clock-in window from job configuration
  // Don't override with a minimum of 2 minutes - respect the job's setting
  const earlyClockInWindow = earlyClockInMinutes;

  // Get the user's shifts for today and the current day of the week
  const { usersShifts, currentDay } = getUserShiftsForToday(
    job,
    applicantId,
    currentTime,
    shift
  );

  console.log('currentDay:', currentDay);
  console.log('usersShifts count:', usersShifts.length);

  // Log each shift being checked
  usersShifts.forEach((shift, index) => {
    console.log(`🔍 Shift ${index + 1}: ${shift.shiftName} (${shift.slug})`);
  });

  // Get the current time in the specified time zone
  const now = new Date(currentTime);
  console.log('now:', now);

  // First check current day's schedule
  const currentDayResult = usersShifts.some((shift) => {
    const todaySchedule = shift.defaultSchedule[currentDay];
    console.log('🔍 Checking shift:', shift.shiftName, 'for day:', currentDay);
    console.log('todaySchedule:', todaySchedule);

    if (!todaySchedule || !todaySchedule.start || todaySchedule.start === '') {
      console.log('❌ No valid shift start time');
      return false; // No valid shift start time
    }

    // Get the shift start and end times
    const shiftStartTime = new Date(todaySchedule.start);
    const shiftEndTime = new Date(todaySchedule.end);
    console.log('📅 Shift times from schedule:');
    console.log(
      '  - Start:',
      shiftStartTime.toISOString(),
      '(',
      shiftStartTime.toLocaleTimeString(),
      ')'
    );
    console.log(
      '  - End:',
      shiftEndTime.toISOString(),
      '(',
      shiftEndTime.toLocaleTimeString(),
      ')'
    );
    console.log(
      '  - Current time:',
      now.toISOString(),
      '(',
      now.toLocaleTimeString(),
      ')'
    );

    // Check if this is within the shift time window first
    // If end time is before start time, it's an overnight shift
    const isOvernightShift =
      shiftStartTime.getHours() > shiftEndTime.getHours() ||
      (shiftStartTime.getHours() === shiftEndTime.getHours() &&
        shiftStartTime.getMinutes() > shiftEndTime.getMinutes());

    console.log('🌙 Is overnight shift?', isOvernightShift);
    console.log('  - Start hour:', shiftStartTime.getHours());
    console.log('  - End hour:', shiftEndTime.getHours());

    let currentShiftStartTime, currentShiftEndTime;

    if (isOvernightShift) {
      // For overnight shifts starting today, start time is today, end time is tomorrow
      currentShiftStartTime = combineCurrentDateWithTimeFromDateObject(
        shiftStartTime,
        currentTime
      );
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowIso = tomorrow.toISOString();
      currentShiftEndTime = combineCurrentDateWithTimeFromDateObject(
        shiftEndTime,
        tomorrowIso
      );
    } else {
      // Regular shift - both start and end on same day
      currentShiftStartTime = combineCurrentDateWithTimeFromDateObject(
        shiftStartTime,
        currentTime
      );
      currentShiftEndTime = combineCurrentDateWithTimeFromDateObject(
        shiftEndTime,
        currentTime
      );
    }

    console.log('🕐 Combined shift times for today:');
    console.log(
      '  - Start:',
      currentShiftStartTime.toISOString(),
      '(',
      currentShiftStartTime.toLocaleTimeString(),
      ')'
    );
    console.log(
      '  - End:',
      currentShiftEndTime.toISOString(),
      '(',
      currentShiftEndTime.toLocaleTimeString(),
      ')'
    );

    // Check if we're within the shift time window (between start and end)
    const withinShiftWindow =
      now >= currentShiftStartTime && now <= currentShiftEndTime;
    console.log('✅ Within shift window?', withinShiftWindow);
    console.log(
      '  - Now >= Start?',
      now >= currentShiftStartTime,
      '(',
      now.getTime(),
      '>=',
      currentShiftStartTime.getTime(),
      ')'
    );
    console.log(
      '  - Now <= End?',
      now <= currentShiftEndTime,
      '(',
      now.getTime(),
      '<=',
      currentShiftEndTime.getTime(),
      ')'
    );

    if (!withinShiftWindow) {
      // If not in shift window, check early clock-in allowance
      const earliestClockInTime = new Date(
        currentShiftStartTime.getTime() - earlyClockInWindow * 60000
      );
      console.log('⏰ Early clock-in check:');
      console.log('  - Early window (minutes):', earlyClockInWindow);
      console.log(
        '  - Earliest allowed time:',
        earliestClockInTime.toISOString(),
        '(',
        earliestClockInTime.toLocaleTimeString(),
        ')'
      );

      // Allow clock-in if within early window
      const canClockIn =
        now >= earliestClockInTime && now <= currentShiftEndTime;
      console.log('🔓 Can clock in (early)?', canClockIn);
      console.log('  - Now >= Earliest?', now >= earliestClockInTime);
      console.log('  - Now <= End?', now <= currentShiftEndTime);

      return canClockIn;
    }

    // Already within shift window - allow clock-in
    console.log('🎯 Can clock in (within shift)?', true);
    return true;
  });

  console.log('currentDayResult:', currentDayResult);

  if (currentDayResult) {
    console.log('=== RETURNING TRUE (CURRENT DAY) ===');
    return true;
  }

  console.log('Checking previous day schedules...');

  // Check previous day for overnight shifts that extend into current day
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  const currentDayIndex = dayNames.indexOf(
    currentDay as (typeof dayNames)[number]
  );
  const previousDayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;
  const previousDay = dayNames[previousDayIndex];

  console.log('previousDay:', previousDay);

  // Check if there's an overnight shift from the previous day that extends into today
  const previousDayResult = usersShifts.some((shift) => {
    const previousDaySchedule =
      shift.defaultSchedule[previousDay as keyof typeof shift.defaultSchedule];
    console.log('previousDaySchedule:', previousDaySchedule);

    if (
      !previousDaySchedule ||
      !previousDaySchedule.start ||
      !previousDaySchedule.end
    ) {
      console.log('No valid previous day schedule');
      return false;
    }

    const prevShiftStart = new Date(previousDaySchedule.start);
    const prevShiftEnd = new Date(previousDaySchedule.end);

    console.log('prevShiftStart (raw):', prevShiftStart);
    console.log('prevShiftEnd (raw):', prevShiftEnd);

    // Check if this is an overnight shift (end time is before start time in 24hr format)
    const isOvernightShift =
      prevShiftStart.getHours() > prevShiftEnd.getHours() ||
      (prevShiftStart.getHours() === prevShiftEnd.getHours() &&
        prevShiftStart.getMinutes() > prevShiftEnd.getMinutes());

    console.log('isOvernightShift:', isOvernightShift);

    if (!isOvernightShift) {
      console.log('Not an overnight shift - skipping');
      return false; // Not an overnight shift
    }

    // For overnight shifts, the start time is on previous day, end time is on current day
    // Combine previous day's start with yesterday's date
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    const combinedPrevShiftStart = combineCurrentDateWithTimeFromDateObject(
      prevShiftStart,
      yesterdayIso
    );

    // For overnight shifts, the end time is on the current day
    const combinedPrevShiftEnd = combineCurrentDateWithTimeFromDateObject(
      prevShiftEnd,
      currentTime
    );

    console.log('combinedPrevShiftStart:', combinedPrevShiftStart);
    console.log('combinedPrevShiftEnd:', combinedPrevShiftEnd);

    // Check if we're within the overnight shift window
    const withinOvernightWindow =
      now >= combinedPrevShiftStart && now <= combinedPrevShiftEnd;
    console.log('withinOvernightWindow:', withinOvernightWindow);

    if (withinOvernightWindow) {
      console.log('Within overnight shift window - allowing clock in');
      return true;
    }

    // If not in window, check early clock-in allowance
    const earliestClockInTime = new Date(
      combinedPrevShiftStart.getTime() - earlyClockInWindow * 60000
    );

    console.log('overnight earliestClockInTime:', earliestClockInTime);

    // Check if current time is within the overnight shift's valid clock-in window
    const canClockInOvernight =
      now >= earliestClockInTime && now <= combinedPrevShiftEnd;
    console.log('canClockInOvernight:', canClockInOvernight);
    console.log('now >= earliestClockInTime:', now >= earliestClockInTime);
    console.log('now <= combinedPrevShiftEnd:', now <= combinedPrevShiftEnd);

    return canClockInOvernight;
  });

  console.log('previousDayResult:', previousDayResult);

  if (previousDayResult) {
    console.log('=== RETURNING TRUE (PREVIOUS DAY OVERNIGHT) ===');
    return true;
  }

  console.log('=== RETURNING FALSE (NO VALID SHIFTS) ===');
  console.log('=== END CLOCK IN VALIDATION DEBUG ===');

  return false;
};

export const getMinutesUntilClockIn = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
): number | null => {
  // Get the early clock-in minutes, defaulting to 0 if not specified
  const earlyClockInMinutes = job.additionalConfig?.earlyClockInMinutes ?? 0;

  // Use the exact early clock-in window from job configuration
  // Don't override with a minimum of 2 minutes - respect the job's setting
  const earlyClockInWindow = earlyClockInMinutes;

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
    const combinedShiftStartTime = combineCurrentDateWithTimeFromDateObject(
      shiftStartTime,
      currentTime
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

  // CRITICAL FIX: Proper overnight shift detection
  // Overnight shift: start time is late evening/night (after 18:00) AND end time is early morning (before 12:00)
  const startHour = startTime.getHours();
  const endHour = endTime.getHours();
  const isOvernight = startHour >= 18 && endHour < 12;

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
  const adjustedScheduleStart = combineCurrentDateWithTimeFromDateObject(
    scheduleStart,
    localCurrentDate.toISOString()
  );

  const adjustedScheduleEnd = combineCurrentDateWithTimeFromDateObject(
    scheduleEnd,
    localCurrentDate.toISOString(),
    scheduleStart
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
): Date {
  const currentDate = new Date(currentTime);

  // Create a new date with today's date but the time from timeObj
  const result = new Date(currentDate);

  // FIXED: Use local time consistently (what the user sees in their timezone)
  // This ensures we only care about the time part and ignore the date part from the DB
  result.setHours(
    timeObj.getHours(),
    timeObj.getMinutes(),
    timeObj.getSeconds(),
    timeObj.getMilliseconds()
  );

  // FIXED: Enhanced overnight shift detection - ONLY care about TIME, not dates
  if (compareDateObj) {
    const compareResult = new Date(currentDate);
    compareResult.setHours(
      compareDateObj.getHours(),
      compareDateObj.getMinutes(),
      compareDateObj.getSeconds(),
      compareDateObj.getMilliseconds()
    );

    // CRITICAL FIX: Only treat as overnight if end time is actually before start time
    // Example: 11:00 PM (23:00) to 6:00 AM (06:00) = overnight
    // Example: 3:05 AM (03:05) to 6:05 AM (06:05) = NOT overnight (regular early morning shift)
    const startHour = compareDateObj.getHours();
    const endHour = timeObj.getHours();

    // Overnight shift: start time is late evening/night (after 18:00) AND end time is early morning (before 12:00)
    const isOvernightShift = startHour >= 18 && endHour < 12;

    if (isOvernightShift) {
      result.setDate(result.getDate() + 1);
    }
  }

  return result;
}
