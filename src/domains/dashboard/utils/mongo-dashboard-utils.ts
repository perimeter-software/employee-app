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
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
  selectedEmployeeId?: string
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
        totalSpend: 0,
        weeklyChange: {
          hours: 0,
          shifts: 0,
          absences: 0,
          violations: 0,
        },
      };
    }

    const userType = (user as { userType?: string }).userType;
    const applicantId = user.applicantId;
    const dateRange = getDateRange(view, startDate, endDate, weekStartsOn);

    // Build query for punches - must match the pattern from employee punches endpoint
    // If selectedEmployeeId is provided, filter by that employee's applicantId
    // Otherwise, for Client users, get all punches (no applicantId filter)
    const punchQuery: {
      type: 'punch';
      timeIn: {
        $ne: null;
        $gte: string;
        $lte: string;
      };
      applicantId?: string;
    } = {
      type: 'punch',
      timeIn: {
        $ne: null,
        $gte: dateRange.start.toISOString(),
        $lte: dateRange.end.toISOString(),
      },
    };

    if (selectedEmployeeId) {
      // Filter by specific employee
      const selectedUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(selectedEmployeeId) });
      if (selectedUser?.applicantId) {
        // Try string first (most common), MongoDB will match both formats
        punchQuery.applicantId = selectedUser.applicantId.toString();
      }
    } else if (userType === 'Client') {
      // For Client users viewing all employees, don't filter by applicantId
      // This will get all punches in the date range
    } else {
      // For non-Client users, filter by their own applicantId
      if (applicantId) {
        punchQuery.applicantId = applicantId.toString();
      }
    }

    // Get punches in date range - only fetch fields we need for performance
    // Add maxTimeMS to prevent queries from running too long (8 seconds max)
    const punches = await db
      .collection('timecard')
      .find(punchQuery)
      .project({
        timeIn: 1,
        timeOut: 1,
        jobId: 1,
        shiftSlug: 1,
        clockInCoordinates: 1,
      })
      .maxTimeMS(8000) // 8 second timeout
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

    // OPTIMIZED: Batch geofence violation checks instead of per-punch queries
    // Get unique job IDs first
    const userJobIds = [
      ...new Set(punches.map((punch) => punch.jobId).filter(Boolean)),
    ];
    
    // Batch fetch all jobs with location data (reuse for absences calculation too)
    const jobs = await db
      .collection('jobs')
      .find({
        _id: { $in: userJobIds.map((id) => new ObjectId(id)) },
      })
      .project({
        _id: 1,
        title: 1,
        venueName: 1,
        shifts: 1,
        venueCoordinates: 1,
        location: 1,
      })
      .toArray();
    
    // Create job map for quick lookup
    const jobGeofenceMap = new Map();
    jobs.forEach((job) => {
      jobGeofenceMap.set(job._id.toString(), job);
    });
    
    // Calculate geofence violations in memory (much faster)
    let geofenceViolations = 0;
    for (const punch of punches) {
      if (!punch.clockInCoordinates || !punch.jobId) continue;
      
      const job = jobGeofenceMap.get(punch.jobId.toString());
      if (!job || !job.venueCoordinates) {
        // Fallback: use accuracy check
        if (punch.clockInCoordinates.accuracy > 50) {
          geofenceViolations++;
        }
        continue;
      }
      
      // Calculate distance in memory
      const distance = calculateDistanceInFeet(
        punch.clockInCoordinates.latitude,
        punch.clockInCoordinates.longitude,
        job.venueCoordinates.latitude,
        job.venueCoordinates.longitude
      );
      
      const geofenceRadiusFeet = 100; // Default radius
      if (distance > geofenceRadiusFeet) {
        geofenceViolations++;
      }
    }

    // Calculate absences (scheduled shifts without punches)
    // Jobs already fetched above

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

    // Calculate Total Spend (Bill Rate × Total Hours)
    // Only calculate for Client users
    let totalSpend = 0;
    if (userType === 'Client') {
      // Get unique job IDs from punches
      const jobIds = [
        ...new Set(punches.map((punch) => punch.jobId).filter(Boolean)),
      ];

      // Fetch jobs with shifts to get billRate
      const jobsWithShifts = await db
        .collection('jobs')
        .find({
          _id: { $in: jobIds.map((id) => new ObjectId(id)) },
        })
        .project({
          _id: 1,
          shifts: 1,
        })
        .toArray();

      // Create a map of jobId -> shifts for quick lookup
      const jobShiftsMap = new Map();
      jobsWithShifts.forEach((job) => {
        if (job.shifts && Array.isArray(job.shifts)) {
          jobShiftsMap.set(job._id.toString(), job.shifts);
        }
      });

      // Calculate total spend for each punch
      for (const punch of punches) {
        if (!punch.timeOut) continue; // Skip open punches

        // Calculate hours for this punch
        const start = new Date(punch.timeIn);
        const end = new Date(punch.timeOut);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        // Get billRate from job's shift
        const jobId = punch.jobId?.toString();
        const shiftSlug = punch.shiftSlug;

        if (jobId && shiftSlug && jobShiftsMap.has(jobId)) {
          const shifts = jobShiftsMap.get(jobId);
          const shift = shifts.find((s: { slug?: string }) => s.slug === shiftSlug);

          if (shift && shift.billRate && typeof shift.billRate === 'number') {
            totalSpend += shift.billRate * hours;
          }
        }
      }

      // Round to 2 decimal places
      totalSpend = Math.round(totalSpend * 100) / 100;
    }

    // Calculate weekly changes (compare with previous period)
    let weeklyChange;
    if (view === 'weekly') {
      // Get previous week's data for comparison
      const previousWeekStart = new Date(dateRange.start);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      const previousWeekEnd = new Date(dateRange.end);
      previousWeekEnd.setDate(previousWeekEnd.getDate() - 7);

      const previousPunchQuery: {
        type: 'punch';
        timeIn: {
          $ne: null;
          $gte: string;
          $lte: string;
        };
        applicantId?: string;
      } = {
        type: 'punch',
        timeIn: {
          $ne: null,
          $gte: previousWeekStart.toISOString(),
          $lte: previousWeekEnd.toISOString(),
        },
      };

      if (selectedEmployeeId) {
        const selectedUser = await db
          .collection('users')
          .findOne({ _id: new ObjectId(selectedEmployeeId) });
        if (selectedUser?.applicantId) {
          previousPunchQuery.applicantId = selectedUser.applicantId.toString();
        }
      } else if (userType !== 'Client') {
        if (applicantId) {
          previousPunchQuery.applicantId = applicantId.toString();
        }
      }

      const previousPunches = await db
        .collection('timecard')
        .find(previousPunchQuery)
        .project({
          timeIn: 1,
          timeOut: 1,
          jobId: 1,
          clockInCoordinates: 1,
        })
        .maxTimeMS(5000) // 5 second timeout for previous week
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

      // OPTIMIZED: Batch geofence checks for previous week
      const prevUniqueJobIds = [
        ...new Set(previousPunches.map((punch) => punch.jobId).filter(Boolean)),
      ];
      
      const prevJobsForGeofence = await db
        .collection('jobs')
        .find({
          _id: { $in: prevUniqueJobIds.map((id) => new ObjectId(id)) },
        })
        .project({
          _id: 1,
          venueCoordinates: 1,
        })
        .toArray();
      
      const prevJobGeofenceMap = new Map();
      prevJobsForGeofence.forEach((job) => {
        prevJobGeofenceMap.set(job._id.toString(), job);
      });
      
      let prevGeofenceViolations = 0;
      for (const punch of previousPunches) {
        if (!punch.clockInCoordinates || !punch.jobId) continue;
        
        const job = prevJobGeofenceMap.get(punch.jobId.toString());
        if (!job || !job.venueCoordinates) {
          if (punch.clockInCoordinates.accuracy > 50) {
            prevGeofenceViolations++;
          }
          continue;
        }
        
        const distance = calculateDistanceInFeet(
          punch.clockInCoordinates.latitude,
          punch.clockInCoordinates.longitude,
          job.venueCoordinates.latitude,
          job.venueCoordinates.longitude
        );
        
        if (distance > 100) {
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
      totalSpend: userType === 'Client' ? totalSpend : undefined,
      weeklyChange,
    };
  } catch (error) {
    console.error('Error calculating dashboard stats:', error);
    
    // If it's a timeout error, return empty stats instead of crashing
    if (error && typeof error === 'object' && 'codeName' in error) {
      const mongoError = error as { codeName?: string; code?: number };
      if (mongoError.codeName === 'MaxTimeMSExpired' || mongoError.code === 50) {
        console.warn('Query timeout - returning empty stats');
        return {
          totalHours: 0,
          shiftsCompleted: 0,
          absences: 0,
          geofenceViolations: 0,
          totalSpend: 0,
          weeklyChange: {
            hours: 0,
            shifts: 0,
            absences: 0,
            violations: 0,
          },
        };
      }
    }
    
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
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
  selectedEmployeeId?: string
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

    const userType = (user as { userType?: string }).userType;
    const applicantId = user.applicantId;
    
    // Determine which applicantId to use for filtering
    let filterApplicantId: string | undefined;
    if (selectedEmployeeId) {
      // Filter by specific employee
      const selectedUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(selectedEmployeeId) });
      if (selectedUser?.applicantId) {
        filterApplicantId = selectedUser.applicantId.toString();
      }
    } else if (userType !== 'Client') {
      // For non-Client users, filter by their own applicantId
      filterApplicantId = applicantId;
    }
    // For Client users viewing all employees, don't filter by applicantId (undefined)

    // Monthly attendance data (last 6 months)
    const monthlyAttendance: MonthlyAttendanceData[] = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(currentDate, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const monthQuery: {
        type: 'punch';
        timeIn: {
          $ne: null;
          $gte: string;
          $lte: string;
        };
        timeOut: { $ne: null };
        applicantId?: string;
      } = {
        type: 'punch',
        timeIn: {
          $ne: null,
          $gte: monthStart.toISOString(),
          $lte: monthEnd.toISOString(),
        },
        timeOut: { $ne: null },
      };
      if (filterApplicantId) {
        monthQuery.applicantId = filterApplicantId;
      }
      
      const monthPunches = await db
        .collection('timecard')
        .find(monthQuery)
        .project({
          timeIn: 1,
        })
        .maxTimeMS(3000) // 3 second timeout per month
        .toArray();

      const daysWorked = new Set(
        monthPunches.map((punch) => new Date(punch.timeIn).toDateString())
      ).size;

      // Get previous year same month for comparison
      const previousYearMonth = new Date(monthDate);
      previousYearMonth.setFullYear(previousYearMonth.getFullYear() - 1);
      const prevYearStart = startOfMonth(previousYearMonth);
      const prevYearEnd = endOfMonth(previousYearMonth);

      const prevYearQuery: {
        type: 'punch';
        timeIn: {
          $ne: null;
          $gte: string;
          $lte: string;
        };
        timeOut: { $ne: null };
        applicantId?: string;
      } = {
        type: 'punch',
        timeIn: {
          $ne: null,
          $gte: prevYearStart.toISOString(),
          $lte: prevYearEnd.toISOString(),
        },
        timeOut: { $ne: null },
      };
      if (filterApplicantId) {
        prevYearQuery.applicantId = filterApplicantId;
      }
      
      const prevYearPunches = await db
        .collection('timecard')
        .find(prevYearQuery)
        .project({
          timeIn: 1,
        })
        .maxTimeMS(3000) // 3 second timeout per month
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

      const dayQuery: {
        type: 'punch';
        timeIn: {
          $ne: null;
          $gte: string;
          $lte: string;
        };
        applicantId?: string;
      } = {
        type: 'punch',
        timeIn: {
          $ne: null,
          $gte: dayStart.toISOString(),
          $lte: dayEnd.toISOString(),
        },
      };
      if (filterApplicantId) {
        dayQuery.applicantId = filterApplicantId;
      }
      
      const dayPunches = await db
        .collection('timecard')
        .find(dayQuery)
        .project({
          timeIn: 1,
          timeOut: 1,
        })
        .maxTimeMS(2000) // 2 second timeout per day
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
    
    // If it's a timeout error, return empty data instead of crashing
    if (error && typeof error === 'object' && 'codeName' in error) {
      const mongoError = error as { codeName?: string; code?: number };
      if (mongoError.codeName === 'MaxTimeMSExpired' || mongoError.code === 50) {
        console.warn('Query timeout - returning empty attendance data');
        return {
          monthlyAttendance: [],
          weeklyTrends: [],
        };
      }
    }
    
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
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
  selectedEmployeeId?: string
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

    const userType = (user as { userType?: string }).userType;
    const applicantId = user.applicantId;
    const dateRange = getDateRange('weekly', startDate, endDate, weekStartsOn);
    
    // Determine which applicantId to use for filtering
    let filterApplicantId: string | undefined;
    if (selectedEmployeeId) {
      // Filter by specific employee
      const selectedUser = await db
        .collection('users')
        .findOne({ _id: new ObjectId(selectedEmployeeId) });
      if (selectedUser?.applicantId) {
        filterApplicantId = selectedUser.applicantId.toString();
      }
    } else if (userType !== 'Client') {
      // For non-Client users, filter by their own applicantId
      filterApplicantId = applicantId;
    }
    // For Client users viewing all employees, don't filter by applicantId (undefined)

    // Build match query - must match the pattern from employee punches endpoint
    const matchQuery: {
      type: 'punch';
      timeIn: {
        $ne: null;
        $gte: string;
        $lte: string;
      };
      applicantId?: string;
    } = {
      type: 'punch',
      timeIn: {
        $ne: null,
        $gte: dateRange.start.toISOString(),
        $lte: dateRange.end.toISOString(),
      },
    };
    if (filterApplicantId) {
      matchQuery.applicantId = filterApplicantId;
    }

    // Get punches with job info - optimized with projection and timeout
    const punches = await db
      .collection('timecard')
      .aggregate([
        {
          $match: matchQuery,
        },
        {
          $project: {
            timeIn: 1,
            timeOut: 1,
            jobId: 1,
            shiftSlug: 1,
            clockInCoordinates: 1,
            applicantId: 1,
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
            pipeline: [
              {
                $project: {
                  _id: 1,
                  title: 1,
                  venueName: 1,
                  shifts: 1,
                  additionalConfig: 1,
                  venueCoordinates: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$jobInfo',
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .maxTimeMS(8000) // 8 second timeout
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

    // OPTIMIZED: Batch geofence violation checks
    const uniqueJobIdsForGeofence = [
      ...new Set(punches.map((punch) => punch.jobId).filter(Boolean)),
    ];
    
    const jobsForGeofence = await db
      .collection('jobs')
      .find({
        _id: { $in: uniqueJobIdsForGeofence.map((id) => new ObjectId(id)) },
      })
      .project({
        _id: 1,
        title: 1,
        venueName: 1,
        venueCoordinates: 1,
      })
      .toArray();
    
    const jobGeofenceMap = new Map();
    jobsForGeofence.forEach((job) => {
      jobGeofenceMap.set(job._id.toString(), job);
    });
    
    // Also populate map from aggregation result's jobInfo if available
    punches.forEach((punch) => {
      if (punch.jobInfo && punch.jobInfo._id) {
        const jobId = punch.jobInfo._id.toString();
        if (!jobGeofenceMap.has(jobId)) {
          jobGeofenceMap.set(jobId, {
            _id: punch.jobInfo._id,
            title: punch.jobInfo.title,
            venueName: punch.jobInfo.venueName,
            venueCoordinates: punch.jobInfo.venueCoordinates,
          });
        } else {
          // Update existing entry with title/venueName if missing
          const existing = jobGeofenceMap.get(jobId);
          if (!existing.title && punch.jobInfo.title) {
            existing.title = punch.jobInfo.title;
          }
          if (!existing.venueName && punch.jobInfo.venueName) {
            existing.venueName = punch.jobInfo.venueName;
          }
          if (!existing.venueCoordinates && punch.jobInfo.venueCoordinates) {
            existing.venueCoordinates = punch.jobInfo.venueCoordinates;
          }
        }
      }
    });
    
    let geofenceViolations = 0;
    for (const punch of punches) {
      if (!punch.clockInCoordinates || !punch.jobId) continue;
      
      const job = jobGeofenceMap.get(punch.jobId.toString());
      if (!job || !job.venueCoordinates) {
        if (punch.clockInCoordinates.accuracy > 50) {
          geofenceViolations++;
        }
        continue;
      }
      
      const distance = calculateDistanceInFeet(
        punch.clockInCoordinates.latitude,
        punch.clockInCoordinates.longitude,
        job.venueCoordinates.latitude,
        job.venueCoordinates.longitude
      );
      
      if (distance > 100) {
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

    // OPTIMIZED: Batch fetch all jobs for shift details (reuse jobGeofenceMap)
    // Get unique job IDs from completed punches
    const shiftDetailsJobIds = [
      ...new Set(completedPunches.map((punch) => punch.jobId).filter(Boolean)),
    ];
    
    // Fetch jobs that aren't already in jobGeofenceMap
    const missingJobIds = shiftDetailsJobIds.filter(
      (id) => !jobGeofenceMap.has(id.toString())
    );
    
    if (missingJobIds.length > 0) {
      const additionalJobs = await db
        .collection('jobs')
        .find({
          _id: { $in: missingJobIds.map((id) => new ObjectId(id)) },
        })
        .project({
          _id: 1,
          title: 1,
          venueName: 1,
          venueCoordinates: 1,
        })
        .toArray();
      
      additionalJobs.forEach((job) => {
        jobGeofenceMap.set(job._id.toString(), job);
      });
    }

    // Generate shift details
    const shiftDetails: ShiftTableData[] = [];

    for (const punch of completedPunches) {
      const timeIn = new Date(punch.timeIn);
      const timeOut = punch.timeOut ? new Date(punch.timeOut) : null;
      const hours = timeOut
        ? (timeOut.getTime() - timeIn.getTime()) / (1000 * 60 * 60)
        : 0;

      // Use jobInfo from aggregation result first, then fall back to jobGeofenceMap
      let isOutsideGeofence = false;
      let jobSite = 'Unknown Job';
      
      // Try to get job info from aggregation result first (has title/venueName)
      let job = null;
      if (punch.jobInfo && punch.jobInfo._id) {
        // Use jobInfo from aggregation (already has title/venueName)
        job = punch.jobInfo;
      } else if (punch.jobId) {
        // Fall back to jobGeofenceMap - handle both ObjectId and string
        const jobIdStr = typeof punch.jobId === 'string' 
          ? punch.jobId 
          : punch.jobId?.toString() || '';
        if (jobIdStr) {
          job = jobGeofenceMap.get(jobIdStr);
        }
      }
      
      if (job) {
        // Get job name - prefer title, then venueName
        jobSite = (job.title || job.venueName || 'Unknown Job').toString();
        
        // Check geofence using job data
        if (punch.clockInCoordinates && job.venueCoordinates) {
          const distance = calculateDistanceInFeet(
            punch.clockInCoordinates.latitude,
            punch.clockInCoordinates.longitude,
            job.venueCoordinates.latitude,
            job.venueCoordinates.longitude
          );
          isOutsideGeofence = distance > 100;
        } else if (punch.clockInCoordinates?.accuracy > 50) {
          isOutsideGeofence = true;
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
    
    // If it's a timeout error, return empty data instead of crashing
    if (error && typeof error === 'object' && 'codeName' in error) {
      const mongoError = error as { codeName?: string; code?: number };
      if (mongoError.codeName === 'MaxTimeMSExpired' || mongoError.code === 50) {
        console.warn('Query timeout - returning empty performance metrics');
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
    }
    
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
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
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
