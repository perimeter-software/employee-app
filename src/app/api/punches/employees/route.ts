import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { startOfDay, endOfDay, parseISO, formatISO } from 'date-fns';
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

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'Missing required parameters: startDate and endDate',
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    const startDateTime = startOfDay(parseISO(startDate));
    const endDateTime = endOfDay(parseISO(endDate));

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
        $gte: formatISO(startDateTime),
        $lte: formatISO(endDateTime),
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
    if (shiftSlug && shiftSlug !== 'all') {
      query.shiftSlug = shiftSlug;
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
          $project: {
            _id: 1,
            userId: 1,
            applicantId: 1,
            jobId: 1,
            timeIn: 1,
            timeOut: 1,
            status: 1,
            shiftSlug: 1,
            shiftName: 1,
            clockInCoordinates: 1,
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

    const convertedPunches = punches.map((punch) => {
      const converted = convertToJSON(punch);
      return {
        ...converted,
        _id: punch._id.toString(),
        userId: punch.userId?.toString() || '',
        applicantId: punch.applicantId?.toString() || '',
        jobId: punch.jobId?.toString() || '',
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
