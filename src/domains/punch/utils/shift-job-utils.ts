import type { GignologyJob, Shift } from '@/domains/job'; // ✅ Consistent naming
import { parseISO, isAfter, format } from 'date-fns';
import type { Punch } from '@/domains/punch';
import type { RosterEntry } from '@/domains/job/types/schedule.types';

/**
 * True only when the roster entry should be counted as "scheduled" / "in roster".
 * Excludes pending, rejected, cancelled, and called_off.
 */
export function isApprovedOrLegacyRosterEntry(entry: {
  status?: string;
}): boolean {
  return entry.status === undefined || entry.status === 'approved';
}

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

  // Handle new format (array of objects with employeeId, date, status)
  // Only treat as "in roster" when status is approved or legacy (undefined). Exclude pending,
  // rejected, cancelled, and called_off (they fail the check below).
  const rosterEntries = roster as RosterEntry[];
  const isApprovedOrLegacy = (entry: RosterEntry) =>
    isApprovedOrLegacyRosterEntry(entry);

  if (!targetDate) {
    // If no target date provided, check if user is in roster for any date
    const result = rosterEntries.some(
      (entry) => entry.employeeId === applicantId && isApprovedOrLegacy(entry)
    );
    console.log('  - No target date, checking any date, result:', result);
    return result;
  }

  // Check if user is in roster for specific date
  // Parse the date and format as YYYY-MM-DD using local time to avoid timezone issues
  const targetDateStr = format(parseISO(targetDate), 'yyyy-MM-dd');
  console.log('  - Target date string (YYYY-MM-DD):', targetDateStr);

  const result = rosterEntries.some(
    (entry) =>
      entry.employeeId === applicantId &&
      entry.date === targetDateStr &&
      isApprovedOrLegacy(entry)
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

/** Minutes before shift start that call-off is allowed. Returns 0 if call-off not allowed or no limit. */
export function callOffBeforeToMinutes(job: GignologyJob): number {
  const ac = job?.additionalConfig;
  if (!ac?.allowCallOff) return 0;
  const value = Number(ac.callOffBefore) || 0;
  if (value <= 0) return 0;
  const unit = ac.callOffBeforeUnit ?? 'minutes';
  if (unit === 'days') return value * 1440;
  if (unit === 'hours') return value * 60;
  return value;
}

export type CanCallOffResult = { allowed: boolean; reason?: string };

/**
 * Resolve schedule start string to a Date on the given calendar date (YYYY-MM-DD).
 * - Full ISO datetime (e.g. "2026-02-22T22:00:00.068Z"): uses that moment's local time-of-day on dateStr.
 * - Time-only (e.g. "22:00" or "22:00:00"): interprets as local time on dateStr.
 * Returns null if parsing fails.
 */
export function getShiftStartOnDate(
  startStr: string,
  dateStr: string
): Date | null {
  if (!startStr?.trim() || !dateStr) return null;
  const trimmed = startStr.trim();
  const isIso =
    /^\d{4}-\d{2}-\d{2}T\d/.test(trimmed) ||
    (trimmed.includes('T') &&
      (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)));
  if (isIso) {
    const ref = new Date(trimmed);
    if (Number.isNaN(ref.getTime())) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(
      y,
      m - 1,
      d,
      ref.getHours(),
      ref.getMinutes(),
      ref.getSeconds(),
      ref.getMilliseconds()
    );
  }
  const combined = `${dateStr}T${trimmed}`;
  const d = new Date(combined);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whether the employee can call off this shift on the given date.
 * Uses dateStr (YYYY-MM-DD) and dayKey for local-time shift start.
 * Handles both ISO and time-only schedule.start values.
 */
export function canCallOffShift(
  job: GignologyJob,
  shift: Shift,
  dateStr: string,
  dayKey: string,
  now: Date = new Date()
): CanCallOffResult {
  const ac = job?.additionalConfig;
  if (!ac?.allowCallOff) {
    return { allowed: false, reason: 'Call off is not allowed for this job.' };
  }

  const requiredMinutesBefore = callOffBeforeToMinutes(job);
  if (requiredMinutesBefore <= 0) return { allowed: true };

  const schedule =
    shift?.defaultSchedule?.[dayKey as keyof typeof shift.defaultSchedule];
  const startStr = schedule?.start;
  if (!startStr) return { allowed: true };

  const shiftStartLocal = getShiftStartOnDate(startStr, dateStr);
  if (!shiftStartLocal) {
    return { allowed: false, reason: 'Invalid shift start time.' };
  }
  const minutesUntilStart =
    (shiftStartLocal.getTime() - now.getTime()) / (60 * 1000);
  if (minutesUntilStart < requiredMinutesBefore) {
    const unit = ac.callOffBeforeUnit ?? 'minutes';
    return {
      allowed: false,
      reason: `Call off must be at least ${Number(ac.callOffBefore) || 0} ${unit} before shift start.`,
    };
  }
  return { allowed: true };
}

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

export const giveJobPolygon = (job: GignologyJob): number[][] | null => {
  const polygon = job?.location?.geocoordinates?.polygon;
  if (Array.isArray(polygon) && polygon.length >= 3) return polygon;
  return null;
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

    // Check if the applicant is in today's roster (if specified).
    // Only allow when user is in that day's roster list; null/undefined or empty roster = not in roster.
    const isUserInTodayRoster =
      todaySchedule?.roster == null || todaySchedule.roster.length === 0
        ? false
        : isUserInRoster(todaySchedule.roster, applicantId, currentTime);

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
        isOvernightFromPreviousDay: false,
      };
    }
  }

  // Check for overnight shifts from previous day
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

    // Check if the applicant is in previous day's roster (for overnight shifts).
    // Only allow when user is in that day's roster list; null/undefined or empty roster = not in roster.
    const isUserInPreviousDayRoster =
      previousDaySchedule?.roster == null ||
      previousDaySchedule.roster.length === 0
        ? false
        : isUserInRoster(
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

      // Overnight shift: end time is earlier in the day than start time (in 24h)
      const startHour = startTime.getHours();
      const startMin = startTime.getMinutes();
      const endHour = endTime.getHours();
      const endMin = endTime.getMinutes();
      const isOvernightShift =
        endHour < startHour || (endHour === startHour && endMin < startMin);

      if (isOvernightShift) {
        // This shift started yesterday and continues into today.
        // isOvernightFromPreviousDay tells consumers to use yesterday's date for start.
        console.log('Found overnight shift from previous day:', {
          shiftName: shift.shiftName,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        });

        return {
          start: new Date(previousDaySchedule.start),
          end: new Date(previousDaySchedule.end),
          isOvernightFromPreviousDay: true,
        };
      }
    }
  }

  // Default return if no matching shift is found
  return {
    start: null,
    end: null,
    isOvernightFromPreviousDay: false,
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

export const getCalculatedTimeIn = (
  job: GignologyJob,
  applicantId: string,
  currentTime: string,
  shift?: Shift
): string => {
  const { start, end, isOvernightFromPreviousDay } = getUserShiftForToday(
    job,
    applicantId,
    currentTime,
    shift
  );
  const { shiftStartTime: newStartDate } =
    start && end
      ? resolveShiftDates(start, end, currentTime, isOvernightFromPreviousDay)
      : { shiftStartTime: null };
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

    // Overnight shift: end time is earlier in the day than start time (in 24h).
    // E.g. 5:00 PM (17:00) to 12:00 AM (00:00) = overnight; 11:00 PM to 6:00 AM = overnight.
    // E.g. 3:05 AM to 6:05 AM = NOT overnight (end after start).
    const startHour = compareDateObj.getHours();
    const startMin = compareDateObj.getMinutes();
    const endHour = timeObj.getHours();
    const endMin = timeObj.getMinutes();
    const isOvernightShift =
      endHour < startHour || (endHour === startHour && endMin < startMin);

    if (isOvernightShift) {
      result.setDate(result.getDate() + 1);
    }
  }

  return result;
}

/**
 * Correctly resolves absolute start/end Date objects for a shift returned by getUserShiftForToday.
 *
 * When the shift came from the previous-day overnight path (isOvernightFromPreviousDay=true),
 * the start must be placed on YESTERDAY's date and the end on TODAY's date.
 * For all other shifts, standard combineCurrentDateWithTimeFromDateObject logic applies.
 */
export function resolveShiftDates(
  start: Date,
  end: Date,
  currentTime: string,
  isOvernightFromPreviousDay: boolean
): { shiftStartTime: Date; shiftEndTime: Date } {
  if (isOvernightFromPreviousDay) {
    const yesterday = new Date(currentTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const shiftStartTime = combineCurrentDateWithTimeFromDateObject(
      start,
      yesterday.toISOString()
    );
    const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
      end,
      currentTime
    );
    return { shiftStartTime, shiftEndTime };
  }
  const shiftStartTime = combineCurrentDateWithTimeFromDateObject(
    start,
    currentTime
  );
  const shiftEndTime = combineCurrentDateWithTimeFromDateObject(
    end,
    currentTime,
    start
  );
  return { shiftStartTime, shiftEndTime };
}
