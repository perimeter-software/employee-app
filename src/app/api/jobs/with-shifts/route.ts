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

    // OPTIMIZATION: Fetch only active jobs with shifts, limit results, and optimize projection
    // Filter by status to avoid fetching inactive/old jobs (case-insensitive)
    const query = {
      $or: [{ shiftJob: 'Yes' }, { shiftJob: true }],
      shifts: { $exists: true, $ne: [] },
      // Only fetch active jobs to reduce dataset size (exclude deleted/inactive)
      status: { $nin: ['Deleted', 'deleted', 'Inactive', 'inactive'] },
    };

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
