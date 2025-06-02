import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import { findPrimaryCompany } from "@/domains/company";
import type { AuthenticatedRequest } from "@/domains/user/types";

async function getPrimaryCompanyHandler(request: AuthenticatedRequest) {
  try {
    // User is authenticated AND exists in database AND has tenant access
    const user = request.user;
    const userEmail = user.email!;

    console.log("Enhanced authenticated user:", user.sub, userEmail);

    // Connect to databases
    const { db } = await mongoConn();

    // Get primary company
    const primaryCompany = await findPrimaryCompany(db);

    if (!primaryCompany) {
      return NextResponse.json(
        { error: "not-found", message: "Primary company not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ company: primaryCompany });
  } catch (error) {
    console.error("Primary company API error:", error);
    return NextResponse.json(
      {
        error: "internal-error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper (validates database user AND tenant)
export const GET = withEnhancedAuthAPI(getPrimaryCompanyHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
