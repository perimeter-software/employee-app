import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  subMonths,
} from 'date-fns';
import {
  DashboardStats,
  MonthlyAttendanceData,
  WeeklyTrendsData,
  PerformanceMetrics,
  ShiftTableData,
  TodayAttendanceData,
  InsightData,
} from '../types';
import { getDayNamesFromWeekStartsOn } from '@/lib/utils/date-utils';

/**
 * Calculate dashboard statistics
 */
export async function calculateDashboardStats(
  db: Db,
  userId: string,
  view: 'monthly' | 'weekly' | 'calendar',
  startDate?: string,
  endDate?: string,
  weekStartsOn: 0 | 1 = 0
): Promise<DashboardStats> {
  try {
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });

    if (!user) {
      console.warn(
        `⚠️ User ${userId} not found in database ${db.databaseName}, returning empty stats`
      );
      // Return empty stats instead of throwing error
      return {
        totalHours: 0,
        shiftsCompleted: 0,
        absences: 0,
        geofenceViolations: 0,
        weeklyChange: {
          hours: 0,
          shifts: 0,
          absences: 0,
          violations: 0,
        },
      };
    }

    const applicantId = user.applicantId;
    const dateRange = getDateRange(view, startDate, endDate, weekStartsOn);

    // Get punches in date range
    const punches = await db
      .collection('timecard')
      .find({
        applicantId,
        timeIn: {
          $gte: dateRange.start.toISOString(),
          $lte: dateRange.end.toISOString(),
        },
      })
      .toArray();

    // Calculate stats
    const totalHours = punches.reduce((sum, punch) => {
      if (punch.timeOut) {
        const start = new Date(punch.timeIn);
        const end = new Date(punch.timeOut);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);

    const shiftsCompleted = punches.filter((punch) => punch.timeOut).length;

    // Calculate geofence violations using proper distance calculation
    let geofenceViolations = 0;
    for (const punch of punches) {
      const punchData = {
        clockInCoordinates: punch.clockInCoordinates,
        jobId: punch.jobId,
      };
      const isOutside = await isPunchOutsideGeofence(db, punchData);
      if (isOutside) {
        geofenceViolations++;
      }
    }

    // Calculate absences (scheduled shifts without punches)
    // Get jobs based on punch history since applicants field might not exist
    const userJobIds = [
      ...new Set(punches.map((punch) => punch.jobId).filter(Boolean)),
    ];

    const jobs = await db
      .collection('jobs')
      .find({
        _id: { $in: userJobIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    let scheduledShifts = 0;
    jobs.forEach((job) => {
      if (job.shifts && job.shifts.length > 0) {
        job.shifts.forEach((shift: { startDate: string; endDate: string }) => {
          const shiftStart = new Date(shift.startDate);
          if (shiftStart >= dateRange.start && shiftStart <= dateRange.end) {
            scheduledShifts++;
          }
        });
      }
    });

    // If no scheduled shifts found, estimate based on punch patterns
    if (scheduledShifts === 0) {
      // Use unique punch days as a baseline
      const uniquePunchDays = new Set(
        punches.map((punch) => new Date(punch.timeIn).toDateString())
      );
      scheduledShifts = uniquePunchDays.size;
    }

    const absences = Math.max(0, scheduledShifts - shiftsCompleted);

    // Calculate weekly changes (compare with previous period)
    let weeklyChange;
    if (view === 'weekly') {
      // Get previous week's data for comparison
      const previousWeekStart = new Date(dateRange.start);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      const previousWeekEnd = new Date(dateRange.end);
      previousWeekEnd.setDate(previousWeekEnd.getDate() - 7);

      const previousPunches = await db
        .collection('timecard')
        .find({
          applicantId,
          timeIn: {
            $gte: previousWeekStart.toISOString(),
            $lte: previousWeekEnd.toISOString(),
          },
        })
        .toArray();

      const prevTotalHours = previousPunches.reduce((sum, punch) => {
        if (punch.timeOut) {
          const start = new Date(punch.timeIn);
          const end = new Date(punch.timeOut);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }
        return sum;
      }, 0);

      const prevShiftsCompleted = previousPunches.filter(
        (punch) => punch.timeOut
      ).length;

      let prevGeofenceViolations = 0;
      for (const punch of previousPunches) {
        const punchData = {
          clockInCoordinates: punch.clockInCoordinates,
          jobId: punch.jobId,
        };
        const isOutside = await isPunchOutsideGeofence(db, punchData);
        if (isOutside) {
          prevGeofenceViolations++;
        }
      }

      weeklyChange = {
        hours: Math.round((totalHours - prevTotalHours) * 100) / 100,
        shifts: shiftsCompleted - prevShiftsCompleted,
        absences: 0, // Simplified for now
        violations: geofenceViolations - prevGeofenceViolations,
      };
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      shiftsCompleted,
      absences,
      geofenceViolations,
      weeklyChange,
    };
  } catch (error) {
    console.error('Error calculating dashboard stats:', error);
    throw error;
  }
}

/**
 * Get attendance data for charts
 */
export async function getAttendanceData(
  db: Db,
  userId: string,
  view: 'monthly' | 'weekly' | 'calendar',
  startDate?: string,
  endDate?: string,
  weekStartsOn: 0 | 1 = 0
): Promise<{
  monthlyAttendance: MonthlyAttendanceData[];
  weeklyTrends: WeeklyTrendsData[];
}> {
  try {
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) {
      console.warn(
        `⚠️ User ${userId} not found in database ${db.databaseName}, returning empty attendance data`
      );
      return {
        monthlyAttendance: [],
        weeklyTrends: [],
      };
    }

    const applicantId = user.applicantId;

    // Monthly attendance data (last 6 months)
    const monthlyAttendance: MonthlyAttendanceData[] = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(currentDate, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const monthPunches = await db
        .collection('timecard')
        .find({
          applicantId,
          timeIn: {
            $gte: monthStart.toISOString(),
            $lte: monthEnd.toISOString(),
          },
          timeOut: { $ne: null },
        })
        .toArray();

      const daysWorked = new Set(
        monthPunches.map((punch) => new Date(punch.timeIn).toDateString())
      ).size;

      // Get previous year same month for comparison
      const previousYearMonth = new Date(monthDate);
      previousYearMonth.setFullYear(previousYearMonth.getFullYear() - 1);
      const prevYearStart = startOfMonth(previousYearMonth);
      const prevYearEnd = endOfMonth(previousYearMonth);

      const prevYearPunches = await db
        .collection('timecard')
        .find({
          applicantId,
          timeIn: {
            $gte: prevYearStart.toISOString(),
            $lte: prevYearEnd.toISOString(),
          },
          timeOut: { $ne: null },
        })
        .toArray();

      const prevDaysWorked = new Set(
        prevYearPunches.map((punch) => new Date(punch.timeIn).toDateString())
      ).size;

      monthlyAttendance.push({
        month: format(monthDate, 'MMM'),
        days: daysWorked,
        previous: prevDaysWorked,
      });
    }

    // Weekly trends data
    const dateRange = getDateRange(view, startDate, endDate, weekStartsOn);
    const weeklyTrends: WeeklyTrendsData[] = [];

    // Generate day names based on weekStartsOn
    const adjustedDaysOfWeek = getDayNamesFromWeekStartsOn(weekStartsOn);

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(dateRange.start);
      dayStart.setDate(dayStart.getDate() + i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayPunches = await db
        .collection('timecard')
        .find({
          applicantId,
          timeIn: {
            $gte: dayStart.toISOString(),
            $lte: dayEnd.toISOString(),
          },
        })
        .toArray();

      const dailyHours = dayPunches.reduce((sum, punch) => {
        if (punch.timeOut) {
          const start = new Date(punch.timeIn);
          const end = new Date(punch.timeOut);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }
        return sum;
      }, 0);

      weeklyTrends.push({
        day: adjustedDaysOfWeek[i],
        hours: Math.round(dailyHours * 100) / 100,
      });
    }

    return {
      monthlyAttendance,
      weeklyTrends,
    };
  } catch (error) {
    console.error('Error getting attendance data:', error);
    throw error;
  }
}

/**
 * Get performance metrics and shift details
 */
export async function getPerformanceMetrics(
  db: Db,
  userId: string,
  startDate?: string,
  endDate?: string,
  weekStartsOn: 0 | 1 = 0
): Promise<{
  performanceMetrics: PerformanceMetrics;
  shiftDetails: ShiftTableData[];
}> {
  try {
    const user = await db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) {
      console.warn(
        `⚠️ User ${userId} not found in database ${db.databaseName}, returning empty performance metrics`
      );
      return {
        performanceMetrics: {
          onTimeRate: 0,
          avgHoursPerDay: 0,
          violationRate: 0,
          attendanceRate: 0,
          overtimeHours: 0,
        },
        shiftDetails: [],
      };
    }

    const applicantId = user.applicantId;
    const dateRange = getDateRange('weekly', startDate, endDate, weekStartsOn);

    // Get punches with job info
    const punches = await db
      .collection('timecard')
      .aggregate([
        {
          $match: {
            applicantId,
            timeIn: {
              $gte: dateRange.start.toISOString(),
              $lte: dateRange.end.toISOString(),
            },
          },
        },
        {
          $addFields: {
            jobObjectId: { $toObjectId: '$jobId' },
          },
        },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobObjectId',
            foreignField: '_id',
            as: 'jobInfo',
          },
        },
        {
          $unwind: {
            path: '$jobInfo',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray();

    // Calculate performance metrics
    const completedPunches = punches.filter((punch) => punch.timeOut);
    const totalPunches = punches.length;

    const totalHours = completedPunches.reduce((sum, punch) => {
      const start = new Date(punch.timeIn);
      const end = new Date(punch.timeOut);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    const workingDays = new Set(
      completedPunches.map((punch) => new Date(punch.timeIn).toDateString())
    ).size;

    const avgHoursPerDay = workingDays > 0 ? totalHours / workingDays : 0;

    // Calculate geofence violations using proper distance calculation
    let geofenceViolations = 0;
    for (const punch of punches) {
      const punchData = {
        clockInCoordinates: punch.clockInCoordinates,
        jobId: punch.jobId,
      };
      const isOutside = await isPunchOutsideGeofence(db, punchData);
      if (isOutside) {
        geofenceViolations++;
      }
    }

    const violationRate =
      totalPunches > 0 ? (geofenceViolations / totalPunches) * 100 : 0;

    // Calculate overtime hours
    let overtimeHours = 0;
    for (const punch of completedPunches) {
      const job = punch.jobInfo;
      if (job?.additionalConfig?.allowOvertime) {
        const start = new Date(punch.timeIn);
        const end = new Date(punch.timeOut);
        const hoursWorked =
          (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        // Standard work day is 8 hours, anything above is overtime
        const standardHours = 8;
        if (hoursWorked > standardHours) {
          overtimeHours += hoursWorked - standardHours;
        }
      }
    }

    // Calculate on-time rate
    let onTimePunches = 0;
    let scheduledPunches = 0;

    for (const punch of punches) {
      const job = punch.jobInfo;
      if (job?.shifts && job.shifts.length > 0) {
        const punchDate = new Date(punch.timeIn);

        // Find matching shift for this punch
        const matchingShift = job.shifts.find(
          (shift: { startDate: string; endDate: string }) => {
            const shiftStart = new Date(shift.startDate);
            const shiftDate = shiftStart.toDateString();
            return punchDate.toDateString() === shiftDate;
          }
        );

        if (matchingShift) {
          scheduledPunches++;
          const scheduledStart = new Date(matchingShift.startDate);
          const actualStart = new Date(punch.timeIn);

          // Consider on-time if within 15 minutes of scheduled start
          const timeDifference = Math.abs(
            actualStart.getTime() - scheduledStart.getTime()
          );
          const fifteenMinutes = 15 * 60 * 1000;

          if (timeDifference <= fifteenMinutes) {
            onTimePunches++;
          }
        }
      }
    }

    const onTimeRate =
      scheduledPunches > 0 ? (onTimePunches / scheduledPunches) * 100 : 0;

    // Calculate attendance rate
    // Get all jobs the user is assigned to in the date range
    // Since the job structure might not have applicants field, we'll get jobs based on punch history
    const userJobIds = [
      ...new Set(punches.map((punch) => punch.jobId).filter(Boolean)),
    ];

    const userJobs = await db
      .collection('jobs')
      .find({
        _id: { $in: userJobIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    let totalScheduledShifts = 0;
    let attendedShifts = 0;

    for (const job of userJobs) {
      if (job.shifts && job.shifts.length > 0) {
        for (const shift of job.shifts) {
          const shiftStart = new Date(shift.startDate);
          if (shiftStart >= dateRange.start && shiftStart <= dateRange.end) {
            totalScheduledShifts++;

            // Check if user punched in for this shift
            const shiftDate = shiftStart.toDateString();
            const hasPunch = punches.some((punch) => {
              const punchDate = new Date(punch.timeIn).toDateString();
              return (
                punchDate === shiftDate && punch.jobId === job._id.toString()
              );
            });

            if (hasPunch) {
              attendedShifts++;
            }
          }
        }
      }
    }

    // If no scheduled shifts found from jobs, use punch data as fallback
    if (totalScheduledShifts === 0) {
      // Use unique punch days as scheduled shifts (fallback method)
      const uniquePunchDays = new Set(
        punches.map((punch) => new Date(punch.timeIn).toDateString())
      );
      totalScheduledShifts = uniquePunchDays.size;
      attendedShifts = completedPunches.length > 0 ? uniquePunchDays.size : 0;
    }

    const attendanceRate =
      totalScheduledShifts > 0
        ? (attendedShifts / totalScheduledShifts) * 100
        : 0;

    const performanceMetrics: PerformanceMetrics = {
      onTimeRate: Math.round(onTimeRate * 100) / 100,
      avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
      violationRate: Math.round(violationRate * 100) / 100,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
    };

    // Generate shift details
    const shiftDetails: ShiftTableData[] = [];

    for (const punch of completedPunches) {
      const timeIn = new Date(punch.timeIn);
      const timeOut = punch.timeOut ? new Date(punch.timeOut) : null;
      const hours = timeOut
        ? (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60)
        : 0;

      const punchData = {
        clockInCoordinates: punch.clockInCoordinates,
        jobId: punch.jobId,
      };
      const isOutsideGeofence = await isPunchOutsideGeofence(db, punchData);

      // Lookup job details directly
      let jobSite = 'Unknown Job';
      if (punch.jobId) {
        try {
          const job = await db
            .collection('jobs')
            .findOne({ _id: new ObjectId(punch.jobId) });
          if (job) {
            jobSite = job.title || job.venueName || 'Unknown Job';
          }
        } catch (error) {
          console.warn('Error looking up job for shift details:', error);
        }
      }

      shiftDetails.push({
        date: format(timeIn, 'MM/dd/yyyy'),
        jobSite,
        timeRange: timeOut
          ? `${format(timeIn, 'hh:mm a')} to ${format(timeOut, 'hh:mm a')}`
          : `${format(timeIn, 'hh:mm a')} to --`,
        punches: 1,
        totalHours: `${Math.round(hours * 100) / 100} Hours`,
        location: isOutsideGeofence ? 'Outside Geofence' : 'In Geofence',
        status: timeOut
          ? isOutsideGeofence
            ? 'Geofence Violation'
            : 'Complete'
          : 'In Progress',
        statusColor: timeOut
          ? isOutsideGeofence
            ? 'text-yellow-600'
            : 'text-green-600'
          : 'text-blue-600',
        locationColor: isOutsideGeofence ? 'text-red-600' : undefined,
      });
    }

    return {
      performanceMetrics,
      shiftDetails,
    };
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    throw error;
  }
}

/**
 * Generate insights based on user data
 */
export async function generateInsights(
  db: Db,
  userId: string,
  view: 'monthly' | 'weekly' | 'calendar'
): Promise<InsightData[]> {
  try {
    // For now, return static insights based on view
    // In the future, this could analyze actual data patterns

    const insights: InsightData[] = [
      {
        title: 'Productivity Trend',
        description:
          view === 'monthly'
            ? 'Your productivity peaked on June with 23-day attendance. Consider scheduling important tasks on similar high-energy days.'
            : 'Your productivity peaked on Tuesday with 8.2 hours. Consider scheduling important tasks on similar high-energy days.',
        type: 'productivity',
        priority: 'medium',
      },
      {
        title: 'Geofence Alert',
        description:
          '2 geofence violations detected this week. Review location tracking settings and ensure proper check-in procedures.',
        type: 'alert',
        priority: 'high',
      },
      {
        title: 'Goal Progress',
        description:
          view === 'monthly'
            ? "You're 96% towards your monthly target of 22-25 days. Maintain current pace to exceed expectations."
            : "You're 96% towards your weekly target of 40 hours. Maintain current pace to exceed expectations.",
        type: 'goal',
        priority: 'low',
      },
    ];

    if (view === 'weekly') {
      insights.push({
        title: 'Schedule Optimization',
        description:
          'Your Friday performance dropped significantly. Consider lighter workload or schedule adjustments for end-of-week periods.',
        type: 'schedule',
        priority: 'medium',
      });
    }

    return insights;
  } catch (error) {
    console.error('Error generating insights:', error);
    throw error;
  }
}

/**
 * Get today's attendance data
 */
export async function getTodayAttendanceData(
  db: Db
): Promise<TodayAttendanceData[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all users with their punch data for today
    const usersWithPunches = await db
      .collection('users')
      .aggregate([
        {
          $lookup: {
            from: 'timecard',
            let: { applicantId: '$applicantId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$applicantId', '$$applicantId'] },
                      {
                        $gte: [
                          { $dateFromString: { dateString: '$timeIn' } },
                          today,
                        ],
                      },
                      {
                        $lt: [
                          { $dateFromString: { dateString: '$timeIn' } },
                          tomorrow,
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            as: 'todayPunches',
          },
        },
        {
          $limit: 10, // Limit to prevent too much data
        },
      ])
      .toArray();

    const todayAttendance: TodayAttendanceData[] = usersWithPunches.map(
      (user) => {
        const punch = user.todayPunches?.[0];
        const isCheckedIn = !!punch;

        let hours = '--';
        if (punch) {
          const timeIn = new Date(punch.timeIn);
          const timeOut = punch.timeOut ? new Date(punch.timeOut) : new Date();
          const hoursWorked =
            (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60);

          if (punch.timeOut) {
            hours = `${Math.floor(hoursWorked)}h ${Math.round((hoursWorked % 1) * 60)}m`;
          } else {
            hours = `${Math.floor(hoursWorked)}h ${Math.round((hoursWorked % 1) * 60)}m`;
          }
        }

        const firstName = user.firstName || 'Unknown';
        const lastName = user.lastName || 'User';
        const initials =
          `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

        return {
          name: `${firstName} ${lastName}`,
          time: punch
            ? format(new Date(punch.timeIn), 'hh:mm a')
            : 'Not checked in',
          hours,
          avatar: initials,
          isCheckedIn,
        };
      }
    );

    return todayAttendance;
  } catch (error) {
    console.error('Error getting today attendance data:', error);
    throw error;
  }
}

/**
 * Helper function to get date range
 */
function getDateRange(
  view: 'monthly' | 'weekly' | 'calendar',
  startDate?: string,
  endDate?: string,
  weekStartsOn: 0 | 1 = 0
): { start: Date; end: Date } {
  if (startDate && endDate) {
    return {
      start: new Date(startDate),
      end: new Date(endDate),
    };
  }

  const now = new Date();

  switch (view) {
    case 'monthly':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    case 'weekly':
    case 'calendar':
    default:
      return {
        start: startOfWeek(now, { weekStartsOn }),
        end: endOfWeek(now, { weekStartsOn }),
      };
  }
}

/**
 * Calculate distance between two coordinates in feet
 */
function calculateDistanceInFeet(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMiles = R * c;
  return distanceMiles * 5280; // Convert to feet
}

/**
 * Check if a punch is outside geofence
 */
async function isPunchOutsideGeofence(
  db: Db,
  punch: {
    clockInCoordinates?: {
      latitude: number;
      longitude: number;
      accuracy: number;
    };
    jobId?: string;
  },
  geofenceRadiusFeet: number = 100
): Promise<boolean> {
  if (!punch.clockInCoordinates || !punch.jobId) {
    return false;
  }

  try {
    // Get job venue coordinates
    const job = await db
      .collection('jobs')
      .findOne({ _id: new ObjectId(punch.jobId) });

    if (!job || !job.venueCoordinates) {
      // If no venue coordinates, use accuracy as fallback
      return punch.clockInCoordinates.accuracy > 50;
    }

    const distance = calculateDistanceInFeet(
      punch.clockInCoordinates.latitude,
      punch.clockInCoordinates.longitude,
      job.venueCoordinates.latitude,
      job.venueCoordinates.longitude
    );

    return distance > geofenceRadiusFeet;
  } catch (error) {
    console.error('Error calculating geofence violation:', error);
    // Fallback to accuracy check
    return punch.clockInCoordinates.accuracy > 50;
  }
}
