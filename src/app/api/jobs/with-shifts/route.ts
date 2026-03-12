import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type { GignologyJob } from '@/domains/job/types';
import { ObjectId } from 'mongodb';

// Type definition for clientOrgs structure
type ClientOrg = {
  slug?: string;
  userType?: string;
  status?: string;
  primary?: string;
  modifiedDate?: string;
};

type UserWithClientOrgs = {
  clientOrgs?: ClientOrg[];
};

/**
 * Extract client organization slugs from user record
 * Returns empty array if user has no clientOrgs or if extraction fails
 */
function extractClientOrgSlugs(clientOrgs: ClientOrg[] | undefined): string[] {
  if (!clientOrgs || !Array.isArray(clientOrgs)) {
    return [];
  }

  return clientOrgs
    .map((org) => org.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.trim() !== '');
}

/**
 * GET /api/jobs/with-shifts (Client role only)
 *
 * Query params:
 * - includeHiddenJobs: when "true", includes jobs where hideThisJob === 'Yes'.
 *   When omitted or not "true", excludes those jobs (default).
 */
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

    // Validate user._id exists
    if (!user._id) {
      // Security: If no user ID, return empty results
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Jobs with Shifts API] User ID missing for Client user');
      }
      return NextResponse.json(
        {
          success: true,
          message: 'Jobs with shifts retrieved successfully',
          count: 0,
          data: [],
        },
        { status: 200 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Get user's clientOrgs to filter jobs by venue
    // For Client users, ALWAYS filter by clientOrgs - if no orgs, return empty results
    let clientOrgSlugs: string[] = [];
    try {
      // Validate ObjectId format before querying
      let userObjectId: ObjectId;
      try {
        userObjectId = new ObjectId(user._id.toString());
      } catch {
        console.error('[Jobs with Shifts API] Invalid user._id format:', user._id);
        return NextResponse.json(
          {
            success: true,
            message: 'Jobs with shifts retrieved successfully',
            count: 0,
            data: [],
          },
          { status: 200 }
        );
      }

      const clientUser = await db.collection('users').findOne({
        _id: userObjectId,
      });

      if (!clientUser) {
        // User not found in database - return empty results for security
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Jobs with Shifts API] User not found in database:', user._id);
        }
        return NextResponse.json(
          {
            success: true,
            message: 'Jobs with shifts retrieved successfully',
            count: 0,
            data: [],
          },
          { status: 200 }
        );
      }

      // Extract clientOrgs array from user record
      // Structure: clientOrgs: [{ slug: "formula-one-lv", userType: "User", status: "Active", ... }, ...]
      const clientOrgs = (clientUser as UserWithClientOrgs)?.clientOrgs;
      clientOrgSlugs = extractClientOrgSlugs(clientOrgs);

      // Log for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Jobs with Shifts API] Client user clientOrgs:', {
          userId: user._id,
          clientOrgSlugs,
          clientOrgsCount: clientOrgs?.length || 0,
          willFilter: clientOrgSlugs.length > 0,
        });
      }
    } catch (error) {
      console.error('[Jobs with Shifts API] Error fetching user clientOrgs:', error);
      // If we can't fetch clientOrgs, return empty results for security
      return NextResponse.json(
        {
          success: true,
          message: 'Jobs with shifts retrieved successfully',
          count: 0,
          data: [],
        },
        { status: 200 }
      );
    }

    // PERFORMANCE: Early return if no clientOrgs - no need to query database
    if (clientOrgSlugs.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Jobs with Shifts API] No clientOrgs found, returning empty result');
      }
      return NextResponse.json(
        {
          success: true,
          message: 'Jobs with shifts retrieved successfully',
          count: 0,
          data: [],
        },
        { status: 200 }
      );
    }

    // Include jobs where hideThisJob is 'Yes' only when client requests it (default: exclude)
    const includeHiddenJobs = request.nextUrl.searchParams.get('includeHiddenJobs') === 'true';

    // OPTIMIZATION: Fetch only active jobs with shifts, limit results, and optimize projection
    // Filter by status to avoid fetching inactive/old jobs (case-insensitive)
    const query: Record<string, unknown> = {
      $or: [{ shiftJob: 'Yes' }, { shiftJob: true }],
      shifts: { $exists: true, $ne: [] },
      // Only fetch active jobs to reduce dataset size (exclude deleted/inactive)
      status: { $nin: ['Deleted', 'deleted', 'Inactive', 'inactive'] },
      // ALWAYS filter by clientOrgs for Client users
      venueSlug: { $in: clientOrgSlugs },
    };

    if (!includeHiddenJobs) {
      query.hideThisJob = { $ne: 'Yes' };
    }

    // OPTIMIZATION: Limit shifts projection to only essential fields (slug and shiftName)
    // This dramatically reduces data transfer for jobs with many shifts
    const jobs = await db
      .collection('jobs')
      .find(query)
      .project({
        _id: 1,
        title: 1,
        jobSlug: 1,
        venueName: 1,
        venueSlug: 1, // Need venueSlug to fetch venue location if job location is missing
        hideThisJob: 1,
        // OPTIMIZATION: Only fetch minimal location data needed for geofence
        'location.latitude': 1,
        'location.longitude': 1,
        'location.locationName': 1,
        'location.address': 1,
        'location.city': 1,
        'location.state': 1,
        'location.geocoordinates.coordinates': 1, // [longitude, latitude] array
        'location.geocoordinates.geoFenceRadius': 1,
        'location.graceDistanceFeet': 1,
        // OPTIMIZATION: Project only essential shift fields to reduce payload
        'shifts.slug': 1,
        'shifts.shiftName': 1,
        'shifts.shiftStartDate': 1,
        'shifts.shiftEndDate': 1,
      })
      .sort({ modifiedDate: -1 }) // Most recently modified first
      .limit(500) // OPTIMIZATION: Reasonable limit to prevent excessive data transfer
      .toArray();

    // OPTIMIZATION: Process in batches and filter out jobs with empty shifts after projection
    const convertedJobs = jobs
      .map((job) => {
        const converted = convertToJSON(job) as {
          shifts?: Array<{
            slug?: string;
            shiftName?: string;
            shiftStartDate?: string;
            shiftEndDate?: string;
          }>;
          title?: string;
          jobSlug?: string;
          venueName?: string;
          venueSlug?: string;
          location?: {
            latitude?: number;
            longitude?: number;
            locationName?: string;
            address?: string;
            city?: string;
            state?: string;
            geocoordinates?: {
              coordinates?: [number, number]; // [longitude, latitude]
              geoFenceRadius?: number;
              type?: string;
            };
            graceDistanceFeet?: number;
          };
        } | null;

        if (!converted) {
          return null;
        }

        // Filter out any jobs that ended up with empty shifts after projection
        const shifts = (converted.shifts || []).filter(
          (shift: { slug?: string; shiftName?: string }) =>
            shift.slug && shift.shiftName
        );

        if (shifts.length === 0) {
          return null; // Skip jobs with no valid shifts
        }

        return {
          ...converted,
          _id: job._id.toString(),
          shifts,
        } as GignologyJob;
      })
      .filter((job): job is GignologyJob => job !== null);

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
    console.error('[Jobs with Shifts API] Error fetching jobs with shifts:', error);
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
