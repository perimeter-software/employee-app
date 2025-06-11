import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import { deletePunchById } from "@/domains/punch";

// DELETE Handler for Deleting Punch by ID
async function deletePunchHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const { punchId } = request.params as { punchId: string };

    if (!user._id || !punchId) {
      console.error("Missing required parameters:", {
        userId: user._id,
        punchId,
      });
      return NextResponse.json(
        { error: "missing-parameters", message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    const result = await deletePunchById(db, punchId);

    console.log(`Deleted punch ${punchId} for user ${user._id}`);

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
export const DELETE = withEnhancedAuthAPI(deletePunchHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
