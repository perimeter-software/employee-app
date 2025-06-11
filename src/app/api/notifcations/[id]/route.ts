import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import {
  findNotificationById,
  updateNotification,
} from "@/domains/notification";
import { ObjectId } from "mongodb";

// PUT Handler for Updating Notification
async function updateNotificationHandler(request: AuthenticatedRequest) {
  try {
    const { notificationId } = request.params as { notificationId: string };

    if (!notificationId || !ObjectId.isValid(notificationId)) {
      return NextResponse.json(
        {
          error: "invalid-notification-id",
          message: "Invalid notification ID",
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "missing-data", message: "Missing notification data" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const result = await updateNotification(db, notificationId, body);

    if (!result || result.matchedCount === 0) {
      return NextResponse.json(
        { error: "notification-not-found", message: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Notification updated successfully!",
        modifiedCount: result.modifiedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET Handler for Fetching Notification
async function getNotificationHandler(request: AuthenticatedRequest) {
  try {
    const { notificationId } = request.params as { notificationId: string };

    if (!notificationId) {
      return NextResponse.json(
        {
          error: "missing-notification-id",
          message: "Missing notification ID",
        },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(notificationId)) {
      return NextResponse.json(
        {
          error: "invalid-notification-id",
          message: "Invalid notification ID",
        },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const notification = await findNotificationById(db, notificationId);

    if (!notification) {
      return NextResponse.json(
        { error: "notification-not-found", message: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Notification retrieved successfully",
        notification,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching notification:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
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
