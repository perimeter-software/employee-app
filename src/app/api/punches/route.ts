import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { findAllPunchesByDateRange } from "@/domains/punch/utils";

// POST Handler for Finding Punches by Date Range
async function findPunchesByDateRangeHandler(request: AuthenticatedRequest) {
  try {
    const { userId, jobIds, startDate, endDate, status } = await request.json();

    if (!userId || !jobIds || jobIds.length === 0 || !startDate || !endDate) {
      console.error("Missing required parameters:", {
        userId,
        jobIds,
        startDate,
        endDate,
      });
      return NextResponse.json(
        { error: "missing-parameters", message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const punches = await findAllPunchesByDateRange(
      db,
      userId,
      jobIds,
      startDate,
      endDate,
      status
    );

    console.log(
      `Found ${punches.length} punches for user ${userId} from ${startDate} to ${endDate}`
    );

    return NextResponse.json(
      {
        success: true,
        message: "Punches retrieved successfully",
        count: punches.length,
        data: punches,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching punches:", error);
    return NextResponse.json(
      {
        error: "internal-error",
        message: "Internal server error",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const POST = withEnhancedAuthAPI(findPunchesByDateRangeHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
