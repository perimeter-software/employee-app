import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';

// POST Handler for Getting Active Employee Count (for Client role)
async function getActiveEmployeeCountHandler(request: AuthenticatedRequest) {
  try {
    const { jobIds, shiftSlug } = await request.json();
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
    // ERROR-PROOF: Explicitly check that timeIn exists and timeOut is null or doesn't exist
    const query: {
      type: 'punch';
      timeIn: { $ne: null; $exists: true };
      $or: [{ timeOut: null }, { timeOut: { $exists: false } }];
      jobId?: { $in: string[] };
      shiftSlug?: string;
    } = {
      type: 'punch',
      timeIn: { $ne: null, $exists: true },
      $or: [{ timeOut: null }, { timeOut: { $exists: false } }],
    };

    // If jobIds are provided, filter by them
    // Convert to ObjectId if they are valid ObjectId strings
    if (jobIds && Array.isArray(jobIds) && jobIds.length > 0) {
      const objectIds = jobIds.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id; // If not a valid ObjectId, use as string
        }
      });
      query.jobId = { $in: objectIds };
    }

    // If shiftSlug is provided, filter by it
    if (shiftSlug && shiftSlug !== 'all') {
      query.shiftSlug = shiftSlug;
    }

    // Log query for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Active Employee Count API] Query:', JSON.stringify(query, null, 2));
    }

    // Count distinct applicants with active punches
    // This finds all punches where timeIn exists and timeOut is null/missing
    const activeCount = await db
      .collection('timecard')
      .distinct('applicantId', query);

    // Log result for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Active Employee Count API] Result:', {
        count: activeCount.length,
        applicantIds: activeCount,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Active employee count retrieved successfully',
        count: activeCount.length,
        data: { count: activeCount.length },
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
