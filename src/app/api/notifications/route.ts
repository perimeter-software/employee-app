import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { findNotificationsByUserId } from '@/domains/notification';

export const dynamic = 'force-dynamic';

// GET Handler for Fetching User Notifications
async function getUserNotificationsHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    // For applicant-only sessions, return empty notifications
    // Applicants don't have user._id and don't receive notifications
    if (user.isApplicantOnly || !user._id) {
      return NextResponse.json(
        {
          success: true,
          message: 'No notifications found',
          data: {
            notifications: [],
            count: 0,
          },
        },
        { status: 200 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);
    const notifications = await findNotificationsByUserId(db, user._id);

    if (
      !notifications ||
      (Array.isArray(notifications) && notifications.length === 0) ||
      (typeof notifications === 'object' &&
        Object.keys(notifications).length === 0)
    ) {
      return NextResponse.json(
        {
          success: true,
          message: 'No notifications found',
          data: {
            notifications: [],
            count: 0,
          },
        },
        { status: 200 }
      );
    }

    const notificationArray = Array.isArray(notifications)
      ? notifications
      : [notifications];

    return NextResponse.json(
      {
        success: true,
        message: 'Notifications retrieved successfully',
        data: {
          notifications: notificationArray,
          count: notificationArray.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Export with applicant-aware auth wrapper (allows both users and applicants)
// Applicants will get empty notifications array
export const GET = withEnhancedAuthAPI(getUserNotificationsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
