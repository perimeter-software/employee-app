import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import { checkUserExistsByEmail, checkUserMasterEmail } from "@/domains/user";
import redisService from "@/lib/cache/redis-client";
import type { AuthenticatedRequest, EnhancedUser } from "@/domains/user/types";

async function getUserDataHandler(request: AuthenticatedRequest) {
  try {
    // User is authenticated AND exists in database AND has tenant access
    const user = request.user;
    const userEmail = user.email!;

    console.log("Enhanced authenticated user:", user.sub, userEmail);

    // Connect to databases (we know user exists because of withEnhancedAuth)
    const { db, dbTenant, userDb } = await mongoConn();

    // Get user and tenant info (we know they exist)
    const userExists = await checkUserExistsByEmail(db, userEmail);
    const userMasterRecord = await checkUserMasterEmail(
      userDb,
      dbTenant,
      userEmail
    );

    // Store tenant data in Redis
    const tenantData = {
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
    };

    await redisService.setTenantData(
      userEmail.toLowerCase(),
      tenantData,
      60 * 60 * 24
    );

    // Return enhanced user data
    const enhancedUser: EnhancedUser = {
      _id: userExists?._id,
      applicantId: userExists?.applicantId,
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
      email: user.email,
      name: user.name,
    };

    return NextResponse.json({ user: enhancedUser });
  } catch (error) {
    console.error("User data API error:", error);
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
export const GET = withEnhancedAuthAPI(getUserDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
