import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { findAllOpenPunchesWithJobInfo } from "@/domains/punch";
import { deletePunchById } from "@/domains/punch";

// GET Handler for Fetching Punches
async function getPunchesHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const { userId } = request.params as { userId: string };

    if (!userId) {
      return NextResponse.json(
        { error: "missing-parameters", message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Get search params from URL
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // Connect to database
    const { db } = await mongoConn();

    let punches;

    if (type === "allOpen") {
      punches = await findAllOpenPunchesWithJobInfo(
        db,
        user._id || "",
        user.applicantId || ""
      );
    } else {
      return NextResponse.json(
        { error: "invalid-type", message: "Invalid or missing type parameter" },
        { status: 400 }
      );
    }

    if (
      !punches ||
      (typeof punches === "object" && Object.keys(punches).length === 0)
    ) {
      return NextResponse.json(
        { success: true, message: "No punches found", punches: [] },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Punches retrieved successfully",
        punches,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching punches:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE Handler for Deleting Punch by ID
async function deletePunchHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const { userId } = request.params as { userId: string };

    if (!user._id || !userId) {
      console.error("Missing required parameters:", {
        userId: user._id,
        punchId: userId,
      });
      return NextResponse.json(
        { error: "missing-parameters", message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const result = await deletePunchById(db, userId);

    console.log(`Deleted punch ${userId} for user ${user._id}`);

    return NextResponse.json(
      {
        success: true,
        message: "Punch deleted successfully",
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting punch:", error);
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
export const GET = withEnhancedAuthAPI(getPunchesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const DELETE = withEnhancedAuthAPI(deletePunchHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
