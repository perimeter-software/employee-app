import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { ObjectId } from 'mongodb';

// GET Handler for Getting Shifts for a Job (for Client role)
async function getJobShiftsHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const user = request.user;
    const params = (await context?.params) as { jobId: string } | undefined;
    const jobId = params?.jobId;

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

    if (!jobId) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'Missing required parameter: jobId',
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Convert jobId to ObjectId if it's a string
    let jobObjectId;
    try {
      jobObjectId = new ObjectId(jobId);
    } catch {
      return NextResponse.json(
        {
          error: 'invalid-parameter',
          message: 'Invalid jobId format',
        },
        { status: 400 }
      );
    }

    // Fetch job with shifts
    const job = await db.collection('jobs').findOne(
      { _id: jobObjectId },
      {
        projection: {
          _id: 1,
          shifts: 1,
        },
      }
    );

    if (!job) {
      return NextResponse.json(
        {
          error: 'not-found',
          message: 'Job not found',
        },
        { status: 404 }
      );
    }

    const convertedJob = convertToJSON(job);
    const shifts = convertedJob.shifts || [];

    return NextResponse.json(
      {
        success: true,
        message: 'Job shifts retrieved successfully',
        data: {
          jobId: job._id.toString(),
          shifts,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching job shifts:', error);
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
export const GET = withEnhancedAuthAPI(getJobShiftsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
