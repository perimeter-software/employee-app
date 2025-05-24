// app/api/user-data/route.ts
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/server/auth0";
import { mongoConn } from "@/lib/server/dbConn";
import {
  checkUserExistsByEmail,
  checkUserMasterEmail,
} from "@/lib/server/mongoUtils";
import redisService from "@/lib/server/redisClient";

export async function GET() {
  try {
    // In Auth0 v4, getSession() doesn't take parameters in API routes
    const session = await auth0.getSession();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "No authenticated user" },
        { status: 401 }
      );
    }

    const { user } = session;

    // Connect to databases
    const { db, dbTenant, userDb } = await mongoConn();

    // Check if user exists in your database
    const userExists = await checkUserExistsByEmail(db, user.email!);

    console.log("userExists", userExists);

    if (!userExists) {
      return NextResponse.json(
        {
          error: "user-not-found",
          message: "User not found in database",
        },
        { status: 404 }
      );
    }

    // Get tenant information
    const userMasterRecord = await checkUserMasterEmail(
      userDb,
      dbTenant,
      user.email!
    );

    console.log("userMasterRecord", userMasterRecord);

    if (!userMasterRecord.tenant) {
      return NextResponse.json(
        {
          error: "no-tenant",
          message: "No tenant found for user",
        },
        { status: 404 }
      );
    }

    // Store tenant data in Redis
    const tenantData = {
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
    };

    await redisService.setTenantData(
      user.email!.toLowerCase(),
      tenantData,
      60 * 60 * 24 // 1 day expiry
    );

    // Return enhanced user data
    const enhancedUser = {
      ...user,
      _id: userExists._id,
      applicantId: userExists.applicantId,
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
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
