import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from 'date-fns';
import { DashboardParams } from '../types';

/**
 * Generate date range based on view type
 */
export function generateDateRange(
  view: 'monthly' | 'weekly' | 'calendar',
  baseDate: Date = new Date(),
  weekStartsOn: 0 | 1 = 0 // Default to Sunday, but can be overridden
): { startDate: string; endDate: string } {
  let startDate: Date;
  let endDate: Date;

  switch (view) {
    case 'weekly':
      startDate = startOfWeek(baseDate, { weekStartsOn });
      endDate = endOfWeek(baseDate, { weekStartsOn });
      break;
    case 'monthly':
      startDate = startOfMonth(baseDate);
      endDate = endOfMonth(baseDate);
      break;
    case 'calendar':
      // For calendar view, use current week
      startDate = startOfWeek(baseDate, { weekStartsOn });
      endDate = endOfWeek(baseDate, { weekStartsOn });
      break;
    default:
      startDate = startOfWeek(baseDate, { weekStartsOn });
      endDate = endOfWeek(baseDate, { weekStartsOn });
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/**
 * Format dashboard parameters with date range
 */
export function formatDashboardParams(
  userId: string,
  view: 'monthly' | 'weekly' | 'calendar',
  customDate?: Date,
  weekStartsOn: 0 | 1 = 0
): DashboardParams {
  const { startDate, endDate } = generateDateRange(
    view,
    customDate,
    weekStartsOn
  );

  return {
    userId,
    view,
    startDate,
    endDate,
  };
}

/**
 * Format hours to display format
 */
export function formatHours(hours: number): string {
  if (hours === 0) return '0 Hours';
  if (hours < 1) return `${Math.round(hours * 60)}m`;

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (minutes === 0) return `${wholeHours} Hours`;
  if (wholeHours === 0) return `${minutes}m`;

  return `${wholeHours}h ${minutes}m`;
}

/**
 * Calculate percentage change
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): {
  percentage: number;
  isIncrease: boolean;
  isDecrease: boolean;
} {
  if (previous === 0) {
    return {
      percentage: current > 0 ? 100 : 0,
      isIncrease: current > 0,
      isDecrease: false,
    };
  }

  const percentage = Math.abs(((current - previous) / previous) * 100);

  return {
    percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
    isIncrease: current > previous,
    isDecrease: current < previous,
  };
}

/**
 * Format date range for display
 */
export function formatDateRangeDisplay(
  startDate: string,
  endDate: string,
  view: 'monthly' | 'weekly' | 'calendar'
): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  switch (view) {
    case 'monthly':
      return format(start, 'MMMM yyyy');
    case 'weekly':
    case 'calendar':
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, 'MMM dd')} - ${format(end, 'dd, yyyy')}`;
      } else {
        return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
      }
    default:
      return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
  }
}

/**
 * Get status color based on value and thresholds
 */
export function getStatusColor(
  value: number,
  type: 'performance' | 'attendance' | 'violation'
): string {
  switch (type) {
    case 'performance':
    case 'attendance':
      if (value >= 90) return 'text-green-600';
      if (value >= 70) return 'text-yellow-600';
      return 'text-red-600';
    case 'violation':
      if (value === 0) return 'text-green-600';
      if (value <= 2) return 'text-yellow-600';
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Generate mock data for development/fallback
 */
export function generateMockDashboardData(
  view: 'monthly' | 'weekly' | 'calendar'
) {
  return {
    stats: {
      totalHours: view === 'monthly' ? 160 : 38.5,
      shiftsCompleted: view === 'monthly' ? 22 : 5,
      absences: 1,
      geofenceViolations: 2,
      weeklyChange: {
        hours: 2.5,
        shifts: -3,
        absences: 2,
        violations: 0,
      },
    },
    monthlyAttendance: [
      { month: 'Jan', days: 22, previous: 20 },
      { month: 'Feb', days: 20, previous: 22 },
      { month: 'Mar', days: 15, previous: 16 },
      { month: 'Apr', days: 19, previous: 18 },
      { month: 'May', days: 21, previous: 19 },
      { month: 'Jun', days: 23, previous: 21 },
    ],
    weeklyTrends: [
      { day: 'Sun', hours: 8 },
      { day: 'Mon', hours: 7.5 },
      { day: 'Tue', hours: 8 },
      { day: 'Wed', hours: 7.5 },
      { day: 'Thu', hours: 7.5 },
      { day: 'Fri', hours: 2 },
      { day: 'Sat', hours: 2 },
    ],
    performanceMetrics: {
      onTimeRate: 80,
      avgHoursPerDay: 7.7,
      violationRate: 40,
      attendanceRate: 86,
      overtimeHours: 3.5,
    },
    shiftDetails: [
      {
        date: '06/05/2025',
        jobSite: 'Office',
        timeRange: '08:00 AM to 11:00 AM\n01:00 PM to 03:00 PM',
        punches: 2,
        totalHours: '5 Hours',
        location: 'In Geofence',
        status: 'Complete',
        statusColor: 'text-green-600',
      },
      // Add more mock data as needed
    ],
    todayAttendance: [
      {
        name: 'Olivia Martin',
        time: '08:45 AM',
        hours: '8h 30m',
        avatar: 'OM',
        isCheckedIn: true,
      },
      {
        name: 'Jackson Lee',
        time: '09:15 AM',
        hours: '7h 45m',
        avatar: 'JL',
        isCheckedIn: true,
      },
      {
        name: 'Isabella Nguyen',
        time: '08:30 AM',
        hours: '8h 45m',
        avatar: 'IN',
        isCheckedIn: true,
      },
      {
        name: 'William Kim',
        time: 'Not checked in',
        hours: '--',
        avatar: 'WK',
        isCheckedIn: false,
      },
      {
        name: 'John Doe',
        time: 'Not checked in',
        hours: '--',
        avatar: 'JD',
        isCheckedIn: false,
      },
      {
        name: 'Sofia Davis',
        time: '08:00 AM',
        hours: '9h 15m',
        avatar: 'SD',
        isCheckedIn: true,
      },
    ],
    insights: [
      {
        title: 'Productivity Trend',
        description:
          view === 'monthly'
            ? 'Your productivity peaked on June with 23-day attendance. Consider scheduling important tasks on similar high-energy days.'
            : 'Your productivity peaked on Tuesday with 8.2 hours. Consider scheduling important tasks on similar high-energy days.',
        type: 'productivity' as const,
        priority: 'medium' as const,
      },
      {
        title: 'Geofence Alert',
        description:
          '2 geofence violations detected this week. Review location tracking settings and ensure proper check-in procedures.',
        type: 'alert' as const,
        priority: 'high' as const,
      },
      {
        title: 'Goal Progress',
        description:
          view === 'monthly'
            ? "You're 96% towards your monthly target of 22-25 days. Maintain current pace to exceed expectations."
            : "You're 96% towards your weekly target of 40 hours. Maintain current pace to exceed expectations.",
        type: 'goal' as const,
        priority: 'low' as const,
      },
    ],
  };
}
