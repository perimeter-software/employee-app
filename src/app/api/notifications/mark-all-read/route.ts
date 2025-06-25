import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { markAllUnreadNotificationsAsRead } from "@/domains/notification";

export const dynamic = 'force-dynamic';

// PUT Handler for Marking All Notifications as Read
async function markAllNotificationsReadHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (!user._id) {
      return NextResponse.json(
        {
          success: false,
          error: "unauthorized",
          message: "User ID not found",
        },
        { status: 401 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const result = await markAllUnreadNotificationsAsRead(db, user._id);

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No unread notifications found.",
          data: {
            modifiedCount: 0,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Marked ${result.modifiedCount} notification(s) as read.`,
        data: {
          modifiedCount: result.modifiedCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return NextResponse.json(
      {
        success: false,
        error: "internal-error",
        message: "Failed to update notifications",
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const PUT = withEnhancedAuthAPI(markAllNotificationsReadHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
