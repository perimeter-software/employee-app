import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { parseClockInCoordinates } from '@/lib/utils';
import { updatePunchUserCoordinates } from '@/domains/punch/utils';

// POST Handler for Updating Punch Coordinates
async function updatePunchCoordinatesHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    const { location } = await request.json();

    if (!location) {
      return NextResponse.json(
        { error: 'missing-location', message: 'Location is required' },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    // Call the utility function to update punch coordinates
    const result = await updatePunchUserCoordinates(
      db,
      user._id || '',
      user.applicantId || '',
      parseClockInCoordinates(location)
    );

    // If result is null, nothing was updated — return 204 No Content
    if (!result) {
      return NextResponse.json(
        { error: 'no-updates', message: 'No updates were necessary' },
        { status: 204 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Punch coordinates updated successfully!',
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating punch coordinates:', error);
    return NextResponse.json(
      { error: 'internal-error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const POST = withEnhancedAuthAPI(updatePunchCoordinatesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
