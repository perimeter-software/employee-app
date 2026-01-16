import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

// GET Handler for Getting Venue Primary Location
async function getVenueLocationHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { venueSlug: string } | undefined;
    const venueSlug = params?.venueSlug;

    if (!venueSlug) {
      return NextResponse.json(
        {
          error: 'invalid-request',
          message: 'Venue slug is required',
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Fetch venue with locations array
    const venue = await db.collection('venues').findOne(
      { slug: venueSlug },
      {
        projection: {
          _id: 1,
          name: 1,
          slug: 1,
          locations: 1, // Get the locations array
        },
      }
    );

    if (!venue) {
      return NextResponse.json(
        {
          error: 'not-found',
          message: 'Venue not found',
        },
        { status: 404 }
      );
    }

    const convertedVenue = convertToJSON(venue) as {
      _id?: string;
      name?: string;
      slug?: string;
      locations?: Array<{
        locationName?: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
        primaryLocation?: string;
        geocoordinates?: {
          coordinates?: [number, number]; // [longitude, latitude]
          geoFenceRadius?: number;
          type?: string;
        };
        latitude?: number;
        longitude?: number;
        graceDistanceFeet?: number;
      }>;
    };

    // Find primary location (where primaryLocation === "Yes")
    const primaryLocation = convertedVenue.locations?.find(
      (loc) => loc.primaryLocation === 'Yes'
    );

    // If no primary location, use first location
    const location = primaryLocation || convertedVenue.locations?.[0];

    if (!location) {
      return NextResponse.json(
        {
          error: 'not-found',
          message: 'No location found for venue',
        },
        { status: 404 }
      );
    }

    // Extract coordinates from geocoordinates.coordinates array [longitude, latitude]
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (location.geocoordinates?.coordinates && Array.isArray(location.geocoordinates.coordinates)) {
      [longitude, latitude] = location.geocoordinates.coordinates;
    } else if (location.latitude && location.longitude) {
      latitude = location.latitude;
      longitude = location.longitude;
    }

    if (!latitude || !longitude) {
      return NextResponse.json(
        {
          error: 'invalid-data',
          message: 'Location coordinates not found',
        },
        { status: 404 }
      );
    }

    // Calculate geoFenceRadius
    const geoFenceRadius =
      location.geocoordinates?.geoFenceRadius ||
      (location.graceDistanceFeet ? location.graceDistanceFeet * 0.3048 : 100);

    // Calculate graceDistance in meters (converted from feet)
    const graceDistance = location.graceDistanceFeet
      ? location.graceDistanceFeet * 0.3048
      : undefined;

    return NextResponse.json(
      {
        success: true,
        message: 'Venue location retrieved successfully',
        data: {
          latitude,
          longitude,
          name: location.locationName || convertedVenue.name || 'Venue Location',
          address:
            location.address ||
            `${location.city || ''}, ${location.state || ''} ${location.zip || ''}`.trim(),
          geoFenceRadius,
          graceDistance,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching venue location:', error);
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
export const GET = withEnhancedAuthAPI(getVenueLocationHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
