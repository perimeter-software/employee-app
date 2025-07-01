import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  findNotificationById,
  updateNotification,
} from '@/domains/notification';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// PUT Handler for Updating Notification
async function updateNotificationHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const notificationId =
      typeof params.id === 'string' ? params.id : params.id?.[0];

    if (!notificationId || !ObjectId.isValid(notificationId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid-notification-id',
          message: 'Invalid notification ID',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing-data',
          message: 'Missing notification data',
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    const result = await updateNotification(db, notificationId, body);

    if (!result || result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'notification-not-found',
          message: 'Notification not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Notification updated successfully!',
        data: {
          modifiedCount: result.modifiedCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating notification:', error);
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

// GET Handler for Fetching Notification
async function getNotificationHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const notificationId =
      typeof params.id === 'string' ? params.id : params.id?.[0];

    if (!notificationId) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing-notification-id',
          message: 'Missing notification ID',
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(notificationId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid-notification-id',
          message: 'Invalid notification ID',
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    const notification = await findNotificationById(db, notificationId);

    if (!notification) {
      return NextResponse.json(
        {
          success: false,
          error: 'notification-not-found',
          message: 'Notification not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Notification retrieved successfully',
        data: notification,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching notification:', error);
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

// DELETE Handler for Deleting Notification (soft delete)
async function deleteNotificationHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const notificationId =
      typeof params.id === 'string' ? params.id : params.id?.[0];

    if (!notificationId || !ObjectId.isValid(notificationId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid-notification-id',
          message: 'Invalid notification ID',
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    // Mark as deleted instead of actually deleting for audit purposes
    const result = await updateNotification(db, notificationId, {
      status: 'deleted',
    });

    if (!result || result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'notification-not-found',
          message: 'Notification not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Notification deleted successfully!',
        data: {
          modifiedCount: result.modifiedCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting notification:', error);
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

// Export with enhanced auth wrapper
export const PUT = withEnhancedAuthAPI(updateNotificationHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const GET = withEnhancedAuthAPI(getNotificationHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const DELETE = withEnhancedAuthAPI(deleteNotificationHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
