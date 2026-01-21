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
      console.log('[Active Employee Count API] Query:', JSON.stringify(query, null, 2));
    }

    // Use aggregation pipeline similar to employee punches API
    // This ensures we get distinct applicants with active punches
    const activePunches = await db
      .collection('timecard')
      .aggregate([
        {
          $match: query,
        },
        // Convert string IDs to ObjectIds for lookups (same as employee punches API)
        {
          $addFields: {
            applicantIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$applicantId' }, 'string'] },
                then: { $toObjectId: '$applicantId' },
                else: '$applicantId',
              },
            },
          },
        },
        // Lookup applicant to ensure we're counting valid employees
        {
          $lookup: {
            from: 'applicants',
            localField: 'applicantIdObjectId',
            foreignField: '_id',
            as: 'applicant',
          },
        },
        // Only count punches where applicant exists
        {
          $match: {
            applicant: { $ne: [] },
          },
        },
        // Group by applicantId to get distinct applicants
        {
          $group: {
            _id: '$applicantId',
          },
        },
      ])
      .toArray();

    const activeCount = activePunches.length;

    // Log result for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Active Employee Count API] Result:', {
        count: activeCount,
        applicantIds: activePunches.map((p) => p._id).slice(0, 10), // Log first 10 for debugging
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Active employee count retrieved successfully',
        count: activeCount,
        data: { count: activeCount },
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
