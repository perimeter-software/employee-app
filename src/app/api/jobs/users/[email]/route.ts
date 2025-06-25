import { NextResponse } from "next/server";
import { mongoConn } from "@/lib/db";
import { getUserApplicantJobPipeline } from "@/domains/user/utils/mongo-user-utils";
import { AuthenticatedRequest } from "@/domains/user/types";
import { withEnhancedAuthAPI } from "@/lib/middleware";

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getUserApplicantJobPipelineHandler(
  request: AuthenticatedRequest
) {
  try {
    const { db } = await mongoConn();
    const email = request.nextUrl.pathname.split("/").pop();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "missing-email", message: "Email not found" },
        { status: 400 }
      );
    }

    const result = await getUserApplicantJobPipeline(db, email);

    if (!result) {
      return NextResponse.json(
        { success: false, error: "user-not-found", message: "User not found" },
        { status: 404 }
      );
    }

    // Return with 'data' field to match your ApiResponse type
    return NextResponse.json(
      {
        success: true,
        message: "User found",
        data: result, // Changed from 'user' to 'data'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in job pipeline endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        error: "internal-server-error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getUserApplicantJobPipelineHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
