import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { parseISO } from 'date-fns';
import { ObjectId } from 'mongodb';

// POST Handler for Finding Employee Punches (for Client role)
async function findEmployeePunchesHandler(request: AuthenticatedRequest) {
  try {
    const { startDate, endDate, jobIds, shiftSlug } = await request.json();
    const user = request.user;

    // Only allow Client role to access this endpoint
    if (user.userType !== 'Client') {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Access denied. Client role required.',
        },
        { status: 403 }
      );
    }

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'Missing required parameters: startDate and endDate',
        },
        { status: 400 }
      );
    }

    // Validate date format (should be ISO strings)
    let startDateTime: Date;
    let endDateTime: Date;
    
    try {
      startDateTime = parseISO(startDate);
      endDateTime = parseISO(endDate);
      
      // Validate dates are valid
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        return NextResponse.json(
          {
            error: 'invalid-date-format',
            message: 'Invalid date format. Expected ISO 8601 date strings.',
            received: { startDate, endDate },
          },
          { status: 400 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: 'invalid-date-format',
          message: 'Failed to parse date strings',
          details: (error as Error).message,
          received: { startDate, endDate },
        },
        { status: 400 }
      );
    }

    // Validate date range (start <= end)
    if (startDateTime.getTime() > endDateTime.getTime()) {
      return NextResponse.json(
        {
          error: 'invalid-date-range',
          message: 'startDate must be before or equal to endDate',
          received: {
            startDate: startDateTime.toISOString(),
            endDate: endDateTime.toISOString(),
          },
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // ERROR-PROOF: Use the ISO strings directly from frontend
    // Frontend sends dates normalized to midnight (start) and 23:59:59.999 (end) in local time
    // These are already converted to UTC ISO strings via toISOString()
    // We use them directly without re-formatting to avoid timezone mismatches
    // 
    // IMPORTANT: Do NOT use formatISO() here as it may re-normalize the date
    // The frontend has already done: startOfDay/setHours(0,0,0,0) and setHours(23,59,59,999)
    // and converted to ISO string, so we use the strings directly
    
    // Safety check: Ensure endDateTime includes the full day
    // If endDateTime is at midnight (00:00:00), it means frontend didn't set end of day
    // This should not happen if frontend code is correct, but we add this as a safety net
    if (endDateTime.getHours() === 0 && endDateTime.getMinutes() === 0 && endDateTime.getSeconds() === 0) {
      // Only adjust if milliseconds are also 0 (true midnight, not 23:59:59.999)
      const endTime = endDateTime.getTime();
      const startTime = startDateTime.getTime();
      const dayDiff = Math.floor((endTime - startTime) / (1000 * 60 * 60 * 24));
      
      // If end is same day as start or next day at midnight, set to end of that day
      if (dayDiff <= 1) {
        endDateTime.setHours(23, 59, 59, 999);
      }
    }

    // Use the ISO strings directly - they're already in UTC format
    // This matches exactly what the frontend sends and what MongoDB expects
    const startDateISO = startDateTime.toISOString();
    const endDateISO = endDateTime.toISOString();
    
    // Log for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Date range:', {
        received: { startDate, endDate },
        parsed: {
          start: startDateISO,
          end: endDateISO,
        },
        local: {
          start: startDateTime.toLocaleString(),
          end: endDateTime.toLocaleString(),
        },
      });
    }

    // Build query - get all punches within date range
    // Note: jobId in timecard might be stored as string or ObjectId
    const query: {
      type: 'punch';
      timeIn: {
        $ne: null;
        $gte: string;
        $lte: string;
      };
      $or?: Array<{ jobId: { $in: unknown[] } }>;
      shiftSlug?: string;
    } = {
      type: 'punch',
      timeIn: {
        $ne: null,
        $gte: startDateISO,
        $lte: endDateISO,
      },
    };

    // If jobIds are provided, filter by them
    // Handle both string and ObjectId formats
    if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
      const objectIds = jobIds.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id; // If not a valid ObjectId, use as string
        }
      });
      // Match both string and ObjectId formats
      query.$or = [
        { jobId: { $in: objectIds } },
        { jobId: { $in: jobIds } }, // Also match as strings
      ];
    }

    // If shiftSlug is provided, filter by it
    // ERROR-PROOF: Validate and normalize shiftSlug
    if (shiftSlug && shiftSlug !== 'all' && shiftSlug.trim() !== '') {
      query.shiftSlug = shiftSlug.trim();
      
      // Log for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Employee Punches API] Filtering by shiftSlug:', shiftSlug);
      }
    } else if (shiftSlug === 'all' || !shiftSlug) {
      // Explicitly don't filter by shift when 'all' or undefined
      if (process.env.NODE_ENV === 'development') {
        console.log('[Employee Punches API] Not filtering by shift (all shifts)');
      }
    }

    // Log the final query for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Final MongoDB query:', JSON.stringify(query, null, 2));
    }

    // Fetch punches with employee and job information
    const punches = await db
      .collection('timecard')
      .aggregate([
        {
          $match: query,
        },
        // Convert string IDs to ObjectIds for lookups
        // This handles the case where IDs are stored as strings in timecard collection
        {
          $addFields: {
            userIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$userId' }, 'string'] },
                then: { $toObjectId: '$userId' },
                else: '$userId',
              },
            },
            applicantIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$applicantId' }, 'string'] },
                then: { $toObjectId: '$applicantId' },
                else: '$applicantId',
              },
            },
            jobIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$jobId' }, 'string'] },
                then: { $toObjectId: '$jobId' },
                else: '$jobId',
              },
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userIdObjectId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $lookup: {
            from: 'applicants',
            localField: 'applicantIdObjectId',
            foreignField: '_id',
            as: 'applicant',
          },
        },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobIdObjectId',
            foreignField: '_id',
            as: 'job',
            // ERROR-PROOF: Include shifts field in lookup
            pipeline: [
              {
                $project: {
                  _id: 1,
                  title: 1,
                  venueName: 1,
                  location: 1,
                  shifts: 1, // Ensure shifts are included
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$user',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$applicant',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$job',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            // ERROR-PROOF: Look up shiftName from job.shifts if not stored in timecard
            resolvedShiftName: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ['$shiftName', null] },
                    { $ne: ['$shiftName', ''] },
                  ],
                },
                then: '$shiftName',
                else: {
                  $cond: {
                    if: {
                      $and: [
                        { $ne: ['$job', null] },
                        { $ne: ['$job.shifts', null] },
                        { $isArray: '$job.shifts' },
                        { $gt: [{ $size: '$job.shifts' }, 0] },
                        { $ne: ['$shiftSlug', null] },
                        { $ne: ['$shiftSlug', ''] },
                      ],
                    },
                    then: {
                      $let: {
                        vars: {
                          matchingShift: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: '$job.shifts',
                                  as: 'shift',
                                  cond: {
                                    $eq: ['$$shift.slug', '$shiftSlug'],
                                  },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: {
                          $ifNull: ['$$matchingShift.shiftName', null],
                        },
                      },
                    },
                    else: null,
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            applicantId: 1,
            jobId: 1,
            timeIn: 1,
            timeOut: 1,
            status: 1,
            shiftSlug: 1,
            // ERROR-PROOF: Use resolved shift name
            shiftName: '$resolvedShiftName',
            clockInCoordinates: 1,
            userNote: 1, // ERROR-PROOF: Include userNote field
            managerNote: 1, // ERROR-PROOF: Include managerNote field
            employeeName: {
              $concat: [
                { $ifNull: ['$applicant.firstName', ''] },
                ' ',
                { $ifNull: ['$applicant.lastName', ''] },
              ],
            },
            employeeEmail: {
              $ifNull: ['$applicant.email', '$user.emailAddress', ''],
            },
            jobTitle: { $ifNull: ['$job.title', ''] },
            jobSite: { $ifNull: ['$job.venueName', '$job.title', ''] },
            location: { $ifNull: ['$job.venueName', '$job.location.name', ''] },
          },
        },
        {
          $sort: {
            timeIn: -1,
          },
        },
      ])
      .toArray();

    // ERROR-PROOF: Fetch jobs separately and create a map (following pattern from findAllPunchesByDateRange)
    // Get unique jobIds from punches
    const uniqueJobIds = Array.from(
      new Set(
        punches
          .map((p) => {
            const jobId = p.jobId;
            if (!jobId) return null;
            try {
              return typeof jobId === 'string' ? jobId : jobId.toString();
            } catch {
              return null;
            }
          })
          .filter((id): id is string => id !== null)
      )
    );

    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Extracted unique jobIds:', {
        count: uniqueJobIds.length,
        jobIds: uniqueJobIds.slice(0, 5),
      });
    }

    // Fetch jobs with shifts
    const jobDocs = await db
      .collection('jobs')
      .find({
        _id: {
          $in: uniqueJobIds.map((id) => {
            try {
              return new ObjectId(id);
            } catch {
              return id;
            }
          }),
        },
      })
      .toArray();

    // Create job map
    const jobMap = new Map<string, { shifts?: Array<{ slug: string; shiftName: string }> }>();
    jobDocs.forEach((jobDoc) => {
      const convertedJob = convertToJSON(jobDoc) as {
        _id: string;
        shifts?: Array<{ slug: string; shiftName: string }>;
      };
      const jobIdStr = jobDoc._id.toString();
      jobMap.set(jobIdStr, { shifts: convertedJob.shifts });
      
      if (process.env.NODE_ENV === 'development' && jobMap.size <= 3) {
        console.log('[Employee Punches API] Job added to map:', {
          jobId: jobIdStr,
          shiftsCount: convertedJob.shifts?.length || 0,
          shiftSlugs: convertedJob.shifts?.map((s) => s.slug) || [],
        });
      }
    });

    // Log results for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Query results:', {
        totalPunches: punches.length,
        uniqueJobIds: uniqueJobIds.length,
        jobsFound: jobMap.size,
        shiftSlugFilter: shiftSlug || 'all',
        samplePunches: punches.slice(0, 3).map((p) => {
          const jobIdStr = p.jobId?.toString() || '';
          const job = jobMap.get(jobIdStr);
          return {
            id: p._id?.toString(),
            shiftSlug: p.shiftSlug,
            shiftName: p.shiftName,
            jobId: jobIdStr,
            hasJobInMap: jobMap.has(jobIdStr),
            jobShiftsCount: job?.shifts?.length || 0,
          };
        }),
      });
    }

    // ERROR-PROOF: Post-process to resolve shiftName from job.shifts (following pattern from findAllPunchesByDateRange)
    const convertedPunches = punches.map((punch) => {
      const converted = convertToJSON(punch);
      const punchData = converted as {
        shiftSlug?: string;
        shiftName?: string;
        jobId?: string;
      };

      // Get jobId as string - handle both ObjectId and string formats
      let jobIdStr = '';
      if (punch.jobId) {
        if (typeof punch.jobId === 'string') {
          jobIdStr = punch.jobId;
        } else if (punch.jobId.toString) {
          jobIdStr = punch.jobId.toString();
        }
      }
      if (!jobIdStr && punchData.jobId) {
        jobIdStr = punchData.jobId;
      }

      const job = jobMap.get(jobIdStr);

      // If shiftName is already set and not null/empty, use it
      let resolvedShiftName = punchData.shiftName || null;

      // Otherwise, look up shiftName from job.shifts using shiftSlug
      if (!resolvedShiftName && punchData.shiftSlug) {
        if (job?.shifts && Array.isArray(job.shifts)) {
          const matchingShift = job.shifts.find(
            (shift) => shift.slug === punchData.shiftSlug
          );
          
          if (matchingShift) {
            resolvedShiftName = matchingShift.shiftName;
          } else {
            // Shift not found - likely deleted. Format slug as fallback
            // Remove timestamp and random suffix, then format nicely
            const formattedSlug = punchData.shiftSlug
              .replace(/-\d{13}-[a-z0-9]+$/i, '') // Remove timestamp and random suffix
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            resolvedShiftName = formattedSlug;
            
            if (process.env.NODE_ENV === 'development' && punches.indexOf(punch) === 0) {
              console.log('[Employee Punches API] Shift not found, using formatted slug:', {
                originalSlug: punchData.shiftSlug,
                formattedShiftName: formattedSlug,
                jobId: jobIdStr,
                allShiftSlugs: job.shifts.map((s) => s.slug),
              });
            }
          }
          
          if (process.env.NODE_ENV === 'development' && punches.indexOf(punch) === 0 && matchingShift) {
            console.log('[Employee Punches API] Shift lookup result:', {
              shiftSlug: punchData.shiftSlug,
              jobId: jobIdStr,
              foundMatch: true,
              resolvedShiftName,
            });
          }
        } else if (process.env.NODE_ENV === 'development' && punches.indexOf(punch) === 0) {
          console.log('[Employee Punches API] Shift lookup failed - no job or shifts:', {
            shiftSlug: punchData.shiftSlug,
            jobId: jobIdStr,
            hasJob: !!job,
            hasShifts: !!job?.shifts,
            jobMapKeys: Array.from(jobMap.keys()).slice(0, 5),
          });
          // Fallback: format the slug even if no job found
          if (punchData.shiftSlug) {
            const formattedSlug = punchData.shiftSlug
              .replace(/-\d{13}-[a-z0-9]+$/i, '')
              .split('-')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            resolvedShiftName = formattedSlug;
          }
        }
      }

      return {
        ...converted,
        _id: punch._id.toString(),
        userId: punch.userId?.toString() || '',
        applicantId: punch.applicantId?.toString() || '',
        jobId: jobIdStr,
        shiftName: resolvedShiftName,
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Employee punches retrieved successfully',
        count: convertedPunches.length,
        data: convertedPunches,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching employee punches:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const POST = withEnhancedAuthAPI(findEmployeePunchesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
