import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { parseISO, format } from 'date-fns';
import { ObjectId } from 'mongodb';

// POST Handler for Finding Employee Punches (for Client role)
async function findEmployeePunchesHandler(request: AuthenticatedRequest) {
  try {
    const { startDate, endDate, jobIds, shiftSlugs } = await request.json();
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
      shiftSlug?: string | { $in: string[] };
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

    // If shiftSlugs array is provided, filter by shifts
    // ERROR-PROOF: Validate and normalize shift filter
    if (shiftSlugs && Array.isArray(shiftSlugs) && shiftSlugs.length > 0) {
      const validSlugs = shiftSlugs.filter((s) => s && s.trim() !== '');
      if (validSlugs.length > 0) {
        query.shiftSlug = { $in: validSlugs.map((s) => s.trim()) };

        // Log for debugging (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log('[Employee Punches API] Filtering by shiftSlugs:', validSlugs);
        }
      }
    } else {
      // Explicitly don't filter by shift when empty or undefined
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
            clockOutCoordinates: 1,
            userNote: 1, // ERROR-PROOF: Include userNote field
            managerNote: 1, // ERROR-PROOF: Include managerNote field
            employeeName: {
              $concat: [
                { $ifNull: ['$applicant.firstName', ''] },
                ' ',
                { $ifNull: ['$applicant.lastName', ''] },
              ],
            },
            firstName: { $ifNull: ['$applicant.firstName', ''] },
            lastName: { $ifNull: ['$applicant.lastName', ''] },
            employeeEmail: {
              $ifNull: ['$applicant.email', '$user.emailAddress', ''],
            },
            phoneNumber: { $ifNull: ['$applicant.phone', ''] },
            profileImg: {
              $ifNull: ['$applicant.profileImg', '$user.profileImg', null],
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
    // Convert jobIds to ObjectId, filtering out invalid ones
    const validJobObjectIds = uniqueJobIds
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((id): id is ObjectId => id !== null);

    const jobDocs = await db
      .collection('jobs')
      .find({
        _id: {
          $in: validJobObjectIds,
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
        shiftSlugsFilter: shiftSlugs?.length || 0,
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
    // Type for punch data - includes all properties from aggregation pipeline
    type PunchData = {
      _id: string;
      userId: string;
      applicantId: string;
      jobId: string;
      timeIn: string;
      timeOut: string | null;
      status?: string;
      shiftSlug?: string;
      shiftName: string | null;
      employeeName?: string;
      firstName?: string;
      lastName?: string;
      employeeEmail?: string;
      phoneNumber?: string;
      profileImg?: string | null;
      jobTitle?: string;
      jobSite?: string;
      location?: string;
      clockInCoordinates?: unknown;
      clockOutCoordinates?: unknown;
      userNote?: string;
      managerNote?: string;
      [key: string]: unknown;
    };
    
    const convertedPunches: PunchData[] = punches.map((punch) => {
      const converted = convertToJSON(punch);
      const punchData = converted as {
        shiftSlug?: string;
        shiftName?: string;
        jobId?: string;
        timeIn?: string;
        timeOut?: string | null;
        [key: string]: unknown;
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
        timeIn: punchData.timeIn || punch.timeIn?.toString() || '',
        timeOut: punchData.timeOut || punch.timeOut?.toString() || null,
        shiftSlug: punchData.shiftSlug || punch.shiftSlug?.toString() || '',
      } as PunchData;
    });

    // Generate future punches if date range includes future dates
    const now = new Date();
    const hasFutureDates = endDateTime.getTime() > now.getTime();
    
    // Future punches use the same type as convertedPunches
    const futurePunches: PunchData[] = [];
    
    // Use jobIds from request if provided, otherwise use uniqueJobIds from actual punches
    const jobsToProcess = (jobIds && Array.isArray(jobIds) && jobIds.length > 0) 
      ? jobIds 
      : uniqueJobIds;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Future punch generation check:', {
        hasFutureDates,
        endDateTime: endDateTime.toISOString(),
        now: now.toISOString(),
        jobIdsFromRequest: jobIds,
        uniqueJobIdsFromPunches: uniqueJobIds,
        jobsToProcess,
        jobsToProcessCount: jobsToProcess.length,
      });
    }
    
    if (hasFutureDates && jobsToProcess.length > 0) {
      try {
        // Fetch jobs with full shift data (defaultSchedule and shiftRoster)
        const futureJobObjectIds = jobsToProcess
          .map((id) => {
            try {
              return new ObjectId(id);
            } catch {
              return null;
            }
          })
          .filter((id): id is ObjectId => id !== null);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Employee Punches API] Fetching jobs for future punch generation:', {
            jobsToProcessCount: jobsToProcess.length,
            validObjectIdsCount: futureJobObjectIds.length,
          });
        }

        const futureJobs = await db
          .collection('jobs')
          .find({
            _id: { $in: futureJobObjectIds },
          })
          .project({
            _id: 1,
            title: 1,
            venueName: 1,
            venueSlug: 1,
            location: 1,
            'shifts.slug': 1,
            'shifts.shiftName': 1,
            'shifts.shiftStartDate': 1,
            'shifts.shiftEndDate': 1,
            'shifts.defaultSchedule': 1,
            'shifts.shiftRoster': 1,
          })
          .toArray();

        // Generate future punches from shift schedules
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
        const currentDate = new Date(startDateTime);
        currentDate.setHours(0, 0, 0, 0);
        const endDateCopy = new Date(endDateTime);
        endDateCopy.setHours(23, 59, 59, 999);

        const debugInfo: {
          daysProcessed: number;
          daysInFuture: number;
          shiftsChecked: number;
          shiftsWithSchedule: number;
          shiftsWithRoster: number;
          punchesCreated: number;
          rosterEntriesProcessed: number;
          rosterEntriesSkipped: number;
          rosterEntriesWithEmployeeId: number;
          sampleRosterEntry?: string | { employeeId?: string; date?: string; _id?: string };
          sampleShiftSlug?: string;
          sampleDayOfWeek?: string;
          punchesPerDay?: Record<string, number>;
        } = {
          daysProcessed: 0,
          daysInFuture: 0,
          shiftsChecked: 0,
          shiftsWithSchedule: 0,
          shiftsWithRoster: 0,
          punchesCreated: 0,
          rosterEntriesProcessed: 0,
          rosterEntriesSkipped: 0,
          rosterEntriesWithEmployeeId: 0,
          punchesPerDay: {},
        };

        while (currentDate <= endDateCopy) {
          const dayOfWeek = daysOfWeek[currentDate.getDay()];
          const dateKey = format(currentDate, 'yyyy-MM-dd');
          const dateTime = currentDate.getTime();
          debugInfo.daysProcessed++;

          // Only generate for future dates
          if (dateTime > now.getTime()) {
            debugInfo.daysInFuture++;
            for (const jobDoc of futureJobs) {
              const job = convertToJSON(jobDoc) as {
                _id: string;
                title?: string;
                venueName?: string;
                venueSlug?: string;
                location?: { locationName?: string };
                shifts?: Array<{
                  slug: string;
                  shiftName?: string;
                  shiftStartDate: string | Date;
                  shiftEndDate: string | Date;
                  defaultSchedule?: {
                    [key in typeof daysOfWeek[number]]?: {
                      start: string | Date;
                      end: string | Date;
                      roster?: Array<string | { employeeId: string; date?: string } | { _id: string }>;
                    };
                  };
                  shiftRoster?: Array<{
                    _id: string;
                    firstName?: string;
                    lastName?: string;
                    email?: string;
                    phone?: string;
                    profileImg?: string;
                  }>;
                }>;
              };

              if (!job.shifts || job.shifts.length === 0) continue;

              for (const shift of job.shifts) {
                debugInfo.shiftsChecked++;
                // Filter by selected shift(s) if specified
                if (shiftSlugs && Array.isArray(shiftSlugs) && shiftSlugs.length > 0) {
                  const validSlugs = shiftSlugs.filter((s) => s && s.trim() !== '');
                  if (validSlugs.length > 0 && !validSlugs.includes(shift.slug)) {
                    continue;
                  }
                }

                // Check if shift is active for this date
                const shiftStartDate = new Date(shift.shiftStartDate);
                shiftStartDate.setHours(0, 0, 0, 0);
                const shiftEndDate = new Date(shift.shiftEndDate);
                shiftEndDate.setHours(23, 59, 59, 999);
                
                if (currentDate < shiftStartDate || currentDate > shiftEndDate) {
                  continue;
                }

                // Get the schedule for this day
                const daySchedule = shift.defaultSchedule?.[dayOfWeek];
                if (!daySchedule || !daySchedule.start || !daySchedule.end) {
                  continue;
                }
                debugInfo.shiftsWithSchedule++;

                // Get roster for this day - only employees explicitly assigned to this date
                const rawRoster: Array<string | { employeeId: string; date?: string } | { _id: string }> = (daySchedule.roster || []) as Array<string | { employeeId: string; date?: string } | { _id: string }>;
                
                // Filter roster entries to only those that match the current date.
                // Someone is "scheduled" only when added to the roster with a date for that day.
                // Entries with a date must match dateKey; entries without a date are not used (no date = not scheduled for a specific day).
                const roster = rawRoster.filter((entry) => {
                  if (typeof entry === 'string') {
                    return false; // String IDs have no date - don't treat as scheduled for this day
                  }
                  if (entry && typeof entry === 'object' && 'employeeId' in entry) {
                    const e = entry as { employeeId: string; date?: string };
                    return e.date === dateKey;
                  }
                  return false;
                });
                
                if (roster.length === 0) {
                  continue;
                }
                debugInfo.shiftsWithRoster++;
                
                // Store sample roster entry for debugging
                if (!debugInfo.sampleRosterEntry && roster.length > 0) {
                  debugInfo.sampleRosterEntry = roster[0];
                  debugInfo.sampleShiftSlug = shift.slug;
                  debugInfo.sampleDayOfWeek = dayOfWeek;
                }

                // Process roster entries
                for (const rosterEntry of roster) {
                  debugInfo.rosterEntriesProcessed++;
                  let employeeId: string | null = null;
                  let employeeData: {
                    firstName?: string;
                    lastName?: string;
                    email?: string;
                    phone?: string;
                    profileImg?: string;
                  } | null = null;

                  // Handle different roster formats
                  if (typeof rosterEntry === 'string') {
                    // String ID - use for all dates
                    employeeId = rosterEntry;
                    debugInfo.rosterEntriesWithEmployeeId++;
                    // Try to find employee data in shiftRoster
                    if (shift.shiftRoster && Array.isArray(shift.shiftRoster)) {
                      const rosterApplicant = shift.shiftRoster.find(
                        (emp) => emp._id === employeeId
                      );
                      if (rosterApplicant) {
                        employeeData = rosterApplicant;
                      }
                    }
                  } else if (rosterEntry && typeof rosterEntry === 'object') {
                    if ('employeeId' in rosterEntry) {
                      const entry = rosterEntry as { employeeId: string; date?: string };
                      // At this point, roster has already been filtered by date, so we can use this entry
                      employeeId = entry.employeeId;
                      debugInfo.rosterEntriesWithEmployeeId++;
                      // Try to find employee data in shiftRoster
                      if (shift.shiftRoster && Array.isArray(shift.shiftRoster)) {
                        const rosterApplicant = shift.shiftRoster.find(
                          (emp) => emp._id === employeeId
                        );
                        if (rosterApplicant) {
                          employeeData = rosterApplicant;
                        }
                      }
                    } else if ('_id' in rosterEntry) {
                      // Object with _id - use for all dates
                      employeeId = rosterEntry._id;
                      debugInfo.rosterEntriesWithEmployeeId++;
                      // Try to find employee data in shiftRoster
                      if (shift.shiftRoster && Array.isArray(shift.shiftRoster)) {
                        const rosterApplicant = shift.shiftRoster.find(
                          (emp) => emp._id === employeeId
                        );
                        if (rosterApplicant) {
                          employeeData = rosterApplicant;
                        }
                      }
                    } else {
                      debugInfo.rosterEntriesSkipped++;
                    }
                  } else {
                    debugInfo.rosterEntriesSkipped++;
                  }

                  if (!employeeId) {
                    debugInfo.rosterEntriesSkipped++;
                    continue;
                  }

                  // For future punches, use just the date (start of day) - no specific time
                  const timeIn = new Date(currentDate);
                  timeIn.setHours(0, 0, 0, 0);

                  // Get employee data
                  const firstName = employeeData?.firstName || '';
                  const lastName = employeeData?.lastName || '';
                  const employeeName = `${firstName} ${lastName}`.trim() || 'Unknown Employee';
                  const email = employeeData?.email || '';
                  const profileImg = employeeData?.profileImg || null;

                  futurePunches.push({
                    _id: `future-${job._id}-${shift.slug}-${employeeId}-${dateKey}`,
                    userId: employeeId,
                    applicantId: employeeId,
                    jobId: job._id,
                    timeIn: timeIn.toISOString(),
                    timeOut: null, // Future punches have no clock out
                    status: 'scheduled',
                    shiftSlug: shift.slug,
                    shiftName: shift.shiftName || null,
                    employeeName,
                    firstName,
                    lastName,
                    employeeEmail: email,
                    phoneNumber: employeeData?.phone || '',
                    profileImg,
                    jobTitle: job.title || '',
                    jobSite: job.venueName || job.title || '',
                    location: job.location?.locationName || job.venueSlug || '',
                  });
                  debugInfo.punchesCreated++;
                  // Track punches per day
                  if (!debugInfo.punchesPerDay) {
                    debugInfo.punchesPerDay = {};
                  }
                  debugInfo.punchesPerDay[dateKey] = (debugInfo.punchesPerDay[dateKey] || 0) + 1;
                }
              }
            }
          }

          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Employee Punches API] Future punch generation debug:', debugInfo);
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('[Employee Punches API] Future punch generation result:', {
            count: futurePunches.length,
            dateRange: {
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
            },
            jobsProcessed: futureJobs.length,
            sampleFuturePunch: futurePunches.length > 0 ? {
              _id: futurePunches[0]?._id,
              jobId: futurePunches[0]?.jobId,
              shiftSlug: futurePunches[0]?.shiftSlug,
              timeIn: futurePunches[0]?.timeIn,
            } : null,
          });
        }
      } catch (error) {
        console.error('[Employee Punches API] Error generating future punches:', error);
        // Don't fail the request if future punch generation fails
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.log('[Employee Punches API] Skipping future punch generation:', {
        hasFutureDates,
        jobsToProcessCount: jobsToProcess.length,
        reason: !hasFutureDates ? 'No future dates in range' : 'No jobs to process',
      });
    }

    // Merge actual punches with future punches
    // Remove duplicates - prefer actual punches over future punches
    const allPunches = [...convertedPunches, ...futurePunches];
    const uniquePunches = new Map<string, typeof convertedPunches[0]>();
    
    for (const punch of allPunches) {
      const key = `${punch.userId || punch.applicantId}-${punch.jobId}-${punch.shiftSlug}-${format(parseISO(punch.timeIn), 'yyyy-MM-dd')}`;
      if (!uniquePunches.has(key)) {
        uniquePunches.set(key, punch);
      } else {
        // Prefer actual punch over future punch
        const existing = uniquePunches.get(key);
        if (punch._id && !punch._id.startsWith('future-') && existing?._id?.startsWith('future-')) {
          uniquePunches.set(key, punch);
        }
      }
    }

    const finalPunches = Array.from(uniquePunches.values());

    // Check which timecards are in submitted payroll batches
    try {
      const PayrollBatches = db.collection('payroll-batches');
      
      // Find all submitted payroll batches in the date range
      const submittedBatches = await PayrollBatches.find({
        payrollStatus: 'Submitted',
        $or: [
          {
            startDate: { $lte: endDateISO },
            endDate: { $gte: startDateISO },
          },
        ],
      }).toArray();

      // Create a Set of timecardId+applicantId combinations that are completed
      const completedTimecards = new Set<string>();
      
      submittedBatches.forEach((batch) => {
        if (batch.submittedJobTimecards && Array.isArray(batch.submittedJobTimecards)) {
          batch.submittedJobTimecards.forEach((timecard) => {
            if (timecard._id && timecard.applicantId) {
              // Use timecardId + applicantId as the key
              const timecardId = timecard._id.toString();
              const applicantId = timecard.applicantId.toString();
              const key = `${timecardId}_${applicantId}`;
              completedTimecards.add(key);
            }
          });
        }
      });

      // Update status to "completed" for timecards in submitted batches
      finalPunches.forEach((punch) => {
        if (punch._id && punch.applicantId) {
          const key = `${punch._id}_${punch.applicantId}`;
          if (completedTimecards.has(key)) {
            punch.status = 'completed';
          }
        }
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[Employee Punches API] Payroll batch status check:', {
          submittedBatchesCount: submittedBatches.length,
          completedTimecardsCount: completedTimecards.size,
          punchesUpdated: finalPunches.filter(p => p.status === 'completed').length,
        });
      }
    } catch (error) {
      console.error('[Employee Punches API] Error checking payroll batch status:', error);
      // Don't fail the request if payroll batch check fails
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Employee punches retrieved successfully',
        count: finalPunches.length,
        data: finalPunches,
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
