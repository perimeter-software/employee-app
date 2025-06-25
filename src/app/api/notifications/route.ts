import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { findNotificationsByUserId } from "@/domains/notification";

export const dynamic = 'force-dynamic';

// GET Handler for Fetching User Notifications
async function getUserNotificationsHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (!user._id) {
      return NextResponse.json(
        {
          success: false,
          error: "missing-user-id",
          message: "User ID not found",
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();
    const notifications = await findNotificationsByUserId(db, user._id);

    if (
      !notifications ||
      (Array.isArray(notifications) && notifications.length === 0) ||
      (typeof notifications === "object" &&
        Object.keys(notifications).length === 0)
    ) {
      return NextResponse.json(
        {
          success: true,
          message: "No notifications found",
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
        message: "Notifications retrieved successfully",
        data: {
          notifications: notificationArray,
          count: notificationArray.length,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: "internal-error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getUserNotificationsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
