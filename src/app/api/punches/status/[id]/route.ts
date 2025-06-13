import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { getPunchStatus } from "@/domains/punch";

// GET Handler for Fetching Punch Status
async function getPunchStatusHandler(request: AuthenticatedRequest) {
  try {
    const { id } = request.params as { id: string };

    if (!id) {
      return NextResponse.json(
        { error: "missing-id", message: "Punch ID is required" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const punch = await getPunchStatus(db, id);

    if (!punch) {
      return NextResponse.json(
        { error: "punch-not-found", message: "Punch not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Punch status retrieved successfully",
        data: punch,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching punch status:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getPunchStatusHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
