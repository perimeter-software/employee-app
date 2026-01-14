import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type { GignologyJob } from '@/domains/job/types';

// GET Handler for Getting All Jobs with Shifts (for Client role)
async function getJobsWithShiftsHandler(request: AuthenticatedRequest) {
  try {
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

    // Fetch all jobs that have shifts
    // For Client role, we want all jobs with shifts (not just user's jobs)
    const jobs = await db
      .collection('jobs')
      .find({
        $or: [
          { shiftJob: 'Yes' },
          { shiftJob: true },
        ],
        shifts: { $exists: true, $ne: [] },
      })
      .project({
        _id: 1,
        title: 1,
        jobSlug: 1,
        shifts: 1,
        venueName: 1,
        location: 1,
      })
      .toArray();

    const convertedJobs = jobs.map((job) => {
      const converted = convertToJSON(job);
      return {
        ...converted,
        _id: job._id.toString(),
        shifts: converted.shifts || [],
      } as GignologyJob;
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Jobs with shifts retrieved successfully',
        count: convertedJobs.length,
        data: convertedJobs,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching jobs with shifts:', error);
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
export const GET = withEnhancedAuthAPI(getJobsWithShiftsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
