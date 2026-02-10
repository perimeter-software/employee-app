import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';

// POST Handler for Getting Active Employee Count (for Client role)
// Optionally returns full list of active employees when includeList=true
async function getActiveEmployeeCountHandler(request: AuthenticatedRequest) {
  try {
    const { jobIds, shiftSlug, includeList } = await request.json();
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

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Build query - get all active punches (has timeIn but no timeOut)
    // Follow the same pattern as employee punches API
    const baseQuery: Record<string, unknown> = {
      type: 'punch',
      timeIn: { $ne: null, $exists: true },
      $or: [{ timeOut: null }, { timeOut: { $exists: false } }],
    };

    // If jobIds are provided, filter by them
    // Handle both string and ObjectId formats (same as employee punches API)
    if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
      const objectIds = jobIds.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id; // If not a valid ObjectId, use as string
        }
      });
      // Match both string and ObjectId formats (same as employee punches API)
      // Use $and to combine with the existing $or for timeOut
      baseQuery.$and = [
        {
          $or: [
            { jobId: { $in: objectIds } },
            { jobId: { $in: jobIds } }, // Also match as strings
          ],
        },
      ];
    }

    // If shiftSlug is provided, filter by it
    // ERROR-PROOF: Validate and normalize shiftSlug (same as employee punches API)
    if (shiftSlug && shiftSlug !== 'all' && shiftSlug.trim() !== '') {
      baseQuery.shiftSlug = shiftSlug.trim();
    }

    const query = baseQuery;

    // Log query for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Active Employee Count API] Query:', {
        includeList,
        jobIds: jobIds?.length || 0,
        shiftSlug: shiftSlug || 'all',
      });
    }

    // Build aggregation pipeline - if includeList=true, return full employee details
    // Otherwise just count distinct applicants
    const pipeline: Record<string, unknown>[] = [
      {
        $match: query,
      },
      // Convert string IDs to ObjectIds for lookups (applicant always; job only when includeList)
      {
        $addFields: {
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
      // Lookup applicant – only the fields we need (firstName, lastName, email, phone)
      {
        $lookup: {
          from: 'applicants',
          let: { applicantIdObj: '$applicantIdObjectId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$applicantIdObj'] } } },
            { $project: { firstName: 1, lastName: 1, email: 1, phone: 1 } },
          ],
          as: 'applicant',
        },
      },
      // Unwind applicant array
      {
        $unwind: {
          path: '$applicant',
          preserveNullAndEmptyArrays: false, // Only include punches with valid applicants
        },
      },
    ];

    // If includeList=true, add job lookup and project full details (applicant has email; profileImg from applicant only)
    if (includeList) {
      pipeline.push(
        // Lookup job – only the fields we need (title, venueName, venueSlug, location, shifts)
        {
          $lookup: {
            from: 'jobs',
            let: { jobIdObj: '$jobIdObjectId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$jobIdObj'] } } },
              { $project: { title: 1, venueName: 1, venueSlug: 1, location: 1, shifts: 1 } },
            ],
            as: 'job',
          },
        },
        {
          $unwind: {
            path: '$job',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Resolve shift name from job.shifts array
        {
          $addFields: {
            resolvedShiftName: {
              $cond: {
                if: { $and: ['$shiftSlug', '$job.shifts'] },
                then: {
                  $let: {
                    vars: {
                      matchedShift: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $ifNull: ['$job.shifts', []] },
                              as: 'shift',
                              cond: { $eq: ['$$shift.slug', '$shiftSlug'] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: { $ifNull: ['$$matchedShift.shiftName', null] },
                  },
                },
                else: null,
              },
            },
          },
        },
        // Project employee details (matching employee punches API)
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
            shiftName: '$resolvedShiftName',
            clockInCoordinates: 1,
            clockOutCoordinates: 1,
            userNote: 1,
            managerNote: 1,
            employeeName: {
              $concat: [
                { $ifNull: ['$applicant.firstName', ''] },
                ' ',
                { $ifNull: ['$applicant.lastName', ''] },
              ],
            },
            firstName: { $ifNull: ['$applicant.firstName', ''] },
            lastName: { $ifNull: ['$applicant.lastName', ''] },
            employeeEmail: { $ifNull: ['$applicant.email', ''] },
            phoneNumber: { $ifNull: ['$applicant.phone', ''] },
            jobTitle: { $ifNull: ['$job.title', ''] },
            jobSite: { $ifNull: ['$job.venueName', '$job.title', ''] },
            location: { $ifNull: ['$job.location.locationName', '$job.venueSlug', ''] },
          },
        },
        // Sort by timeIn descending (most recent first)
        {
          $sort: {
            timeIn: -1,
          },
        }
      );
    } else {
      // If not including list, just group by applicantId to count distinct employees
      pipeline.push({
        $group: {
          _id: '$applicantId',
        },
      });
    }

    const result = await db
      .collection('timecard')
      .aggregate(pipeline)
      .toArray();

    const activeCount = result.length;

    // Log result for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Active Employee Count API] Result:', {
        count: activeCount,
        includeList,
      });
    }

    // Return response - if includeList=true, include employees array
    const responseData = includeList
      ? { count: activeCount, employees: result }
      : { count: activeCount };

    return NextResponse.json(
      {
        success: true,
        message: includeList
          ? 'Active employees retrieved successfully'
          : 'Active employee count retrieved successfully',
        count: activeCount,
        data: responseData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching active employee count:', error);
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
export const POST = withEnhancedAuthAPI(getActiveEmployeeCountHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
