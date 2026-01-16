import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  addDays,
  differenceInMilliseconds,
  isBefore,
  isValid,
  isAfter,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WEEK_START_DAY = 'Sun';

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('Error getting user time zone:', error);
    return 'UTC';
  }
}

export function getTodayMidnight(): Date {
  const userTimeZone = getUserTimeZone();
  const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  const zonedDate = toZonedTime(now, userTimeZone);
  return startOfDay(zonedDate);
}

export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

export function toUTC(date: Date): Date {
  return new Date(date.toUTCString());
}

export function toUserTimezone(date: Date): Date {
  const userTimeZone = getUserTimeZone();
  return toZonedTime(date, userTimeZone);
}

export function formatDate(
  date: Date,
  formatString: string = 'yyyy-MM-dd'
): string {
  const userTimeZone = getUserTimeZone();
  try {
    if (!isValidDate(date)) {
      throw new Error('Invalid date object passed to formatDate');
    }
    return format(toZonedTime(date, userTimeZone), formatString);
  } catch (error) {
    console.error('Error in formatDate:', error);
    return 'Invalid date';
  }
}

export function formatTime(date: Date, formatString: string = 'HH:mm'): string {
  return formatDate(date, formatString);
}

export function parseUTCDate(dateString: string): Date {
  return parseISO(dateString);
}

export function calculateMonth(date: Date) {
  const userTimeZone = getUserTimeZone();
  const zonedDate = toZonedTime(date, userTimeZone);
  const start = startOfMonth(zonedDate);
  const end = endOfMonth(zonedDate);
  // console.log('startMonth:', start, 'endMonth:', end);
  return {
    startDate: toUTC(start),
    endDate: toUTC(end),
    dates: eachDayOfInterval({ start, end }).map(toUTC),
  };
}

export function calculateWeek(date: Date, clientWeekStart: string = days[0]) {
  const userTimeZone = getUserTimeZone();
  const zonedDate = toZonedTime(date, userTimeZone);
  const clientWeek = getClientWeek(clientWeekStart);

  // Convert the zonedDate's day of the week number to a string (e.g., "Mon")
  const currentDay = days[zonedDate.getDay()];
  const startDayIndex = days.indexOf(clientWeekStart); // Start of the week index
  const currentDayIndex = days.indexOf(currentDay); // Current day index as a string

  // Calculate the difference between the current day and the start of the week
  const diff = currentDayIndex - startDayIndex;

  // Adjust the zonedDate to the start of the client week
  const start = startOfDay(addDays(zonedDate, -diff));
  const end = endOfDay(addDays(start, 6));

  return {
    startDate: toUTC(start),
    endDate: toUTC(end),
    dates: eachDayOfInterval({ start, end }).map(toUTC),
    clientWeek,
  };
}

export function calculateHours(start: string, end: string): number {
  // Parse the ISO strings to Date objects
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const userTimeZone = getUserTimeZone();

  // Convert the dates to UTC, considering the provided timezone
  const startUtc = toZonedTime(startDate, userTimeZone);
  const endUtc = toZonedTime(endDate, userTimeZone);

  // Calculate the difference in milliseconds
  const diffInMs = differenceInMilliseconds(endUtc, startUtc);

  // Convert milliseconds to hours
  const diffInHours = diffInMs / (1000 * 60 * 60);

  // Return the result rounded to two decimal places
  return Number(diffInHours.toFixed(2));
}
// TODO u345ls (< search that to find other spot fast) Make sure this aligns with the new shiftJobs util logic for checking punches (possibly add some here)
export function validatePunchTimes(
  timeIn: string,
  dateIn: string,
  timeOut: string | null,
  dateOut: string | null,
  isMissingClockOut: boolean
) {
  const errors: string[] = [];
  const now = new Date();
  const userTimeZone = getUserTimeZone();

  // Validate clock-in
  if (!timeIn || !dateIn) {
    errors.push('Clock-in date and time are required.');
  } else {
    const clockInDate = toZonedTime(
      parseISO(`${dateIn}T${timeIn}`),
      userTimeZone
    );
    if (!isValid(clockInDate)) {
      errors.push('Invalid clock-in date or time.');
    } else if (isAfter(clockInDate, now)) {
      errors.push('Clock-in time cannot be in the future.');
    }
  }

  // Validate clock-out if provided or required
  if (!isMissingClockOut && (timeOut || dateOut)) {
    if (!timeOut || !dateOut) {
      errors.push('Both clock-out date and time must be provided.');
    } else {
      const clockOutDate = toZonedTime(
        parseISO(`${dateOut}T${timeOut}`),
        userTimeZone
      );
      const clockInDate = toZonedTime(
        parseISO(`${dateIn}T${timeIn}`),
        userTimeZone
      );

      if (!isValid(clockOutDate)) {
        errors.push('Invalid clock-out date or time.');
      } else {
        if (isBefore(clockOutDate, clockInDate)) {
          errors.push('Clock-out time must be after clock-in time.');
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

export function giveUserFriendlyTime(timestamp: Date | string) {
  if (typeof timestamp === 'string') {
    timestamp = new Date(timestamp);
  }

  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();

  if (diff < 60 * 1000) {
    return 'Just now';
  } else if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}m ago`;
  } else if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  } else if (diff > 24 * 60 * 60 * 1000 && diff < 48 * 60 * 60 * 1000) {
    return 'Yesterday at ' + formatTime(timestamp, 'h:mm a');
  } else {
    return (
      formatDate(timestamp, 'EEEE, MMMM d') +
      ' at ' +
      formatTime(timestamp, 'h:mm a zzz')
    );
  }
}

function getClientWeek(clientWeekStart: string): string[] {
  const startIndex = days.indexOf(clientWeekStart);
  if (startIndex === -1) {
    throw new Error('Invalid client week start day');
  }
  return [...days.slice(startIndex), ...days.slice(0, startIndex)];
}

/**
 * Parse company work week setting and return weekStartsOn value for date-fns
 * @param workWeek - Company work week setting (e.g., "Mon-Sun", "Sun-Sat")
 * @returns weekStartsOn value (0 = Sunday, 1 = Monday)
 */
export function getWeekStartsOnFromWorkWeek(
  workWeek?: string
): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!workWeek) {
    return 0; // Default to Sunday
  }

  // Parse the work week string to get the start day
  const startDay = workWeek.split('-')[0]?.trim().toLowerCase();

  // ERROR-PROOF: Removed console.log to prevent infinite loops
  // The function is called frequently and logging causes performance issues

  switch (startDay) {
    case 'sun':
    case 'sunday':
      return 0; // Sunday
    case 'mon':
    case 'monday':
      return 1; // Monday
    case 'tue':
    case 'tues':
    case 'tuesday':
      return 2; // Tuesday
    case 'wed':
    case 'wednesday':
      return 3; // Wednesday
    case 'thu':
    case 'thurs':
    case 'thursday':
      return 4; // Thursday
    case 'fri':
    case 'friday':
      return 5; // Friday
    case 'sat':
    case 'saturday':
      return 6; // Saturday
    default:
      console.log(
        'No match found for start day:',
        startDay,
        'Defaulting to Sunday (0)'
      );
      return 0; // Sunday (default)
  }
}

/**
 * Get the day name from weekStartsOn value
 * @param weekStartsOn - Week start day value (0-6)
 * @returns Day name (e.g., "Sun", "Mon")
 */
export function getDayNameFromWeekStartsOn(weekStartsOn: number): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames[weekStartsOn] || 'Sun';
}

/**
 * Generate day names array based on weekStartsOn value
 * @param weekStartsOn - Week start day value (0 = Sunday, 1 = Monday, 2 = Tuesday, etc.)
 * @returns Array of day names starting from the specified day
 */
export function getDayNamesFromWeekStartsOn(
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
): string[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [...dayNames.slice(weekStartsOn), ...dayNames.slice(0, weekStartsOn)];
}

// TODO check this when timeoff is getting implemented (is it needed?)
export function giveDayOfWeek(day: number): string {
  return days[day % 7] || 'Sunday';
}

// TODO check this when timeoff is getting implemented (is it needed?)
export function datesMatch(dateOne: string, dateTwo: string): boolean {
  const date1 = parseISO(dateOne);
  const date2 = parseISO(dateTwo);
  return (
    date1.getUTCDate() === date2.getUTCDate() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCFullYear() === date2.getUTCFullYear()
  );
}

// TODO check this when timeoff is getting implemented (is it needed?)
export function giveShortDateString(date: string): string {
  return formatDate(parseISO(date), 'MM/dd/yy');
}

export function dateToTimeString(dateString: string | null): string {
  if (!dateString) return '';
  return formatTime(parseUTCDate(dateString));
}

export function formatTimeForInput(dateString: string | null): string {
  if (!dateString) return '';
  return formatTime(parseUTCDate(dateString), 'HH:mm');
}

// TODO keep this in the back of the mind (we may need to be explicitly convert before saving)
export function formatDateTimeForServer(
  timeString: string,
  baseDateString: string | null
): string {
  if (!timeString || !baseDateString) return '';

  const userTimeZone = getUserTimeZone();
  const baseDate = parseISO(baseDateString);
  const [hours, minutes] = timeString.split(':').map(Number);

  let zonedDate = toZonedTime(baseDate, userTimeZone);
  zonedDate.setHours(hours, minutes, 0, 0);

  if (zonedDate < toZonedTime(baseDate, userTimeZone)) {
    zonedDate = addDays(zonedDate, 1);
  }

  return toUTC(zonedDate).toISOString();
}

export const formatSessionTime = (startTime: string, endTime?: string) => {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const elapsed = (end.getTime() - start.getTime()) / 1000;

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};
