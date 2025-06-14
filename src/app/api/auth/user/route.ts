import { NextResponse } from "next/server";
import { mongoConn } from "@/lib/db";
import {
  checkUserExistsByEmail,
  checkUserMasterEmail,
} from "@/domains/user/utils";
import type { EnhancedUser } from "@/domains/user/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Connect to databases
    const { db, dbTenant, userDb } = await mongoConn();

    // Get user and tenant info
    const userExists = await checkUserExistsByEmail(db, email);
    const userMasterRecord = await checkUserMasterEmail(
      userDb,
      dbTenant,
      email
    );

    if (!userExists || !userMasterRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create enhanced user object
    const enhancedUser: EnhancedUser = {
      _id: userExists._id,
      applicantId: userExists.applicantId,
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
      email: email,
      firstName: userExists.firstName,
      lastName: userExists.lastName,
      name:
        userExists.firstName && userExists.lastName
          ? `${userExists.firstName} ${userExists.lastName}`
          : email,
      userType: userExists.userType,
      employeeType: userExists.employeeType,
      status: userExists.status,
    };

    return NextResponse.json(enhancedUser);
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
