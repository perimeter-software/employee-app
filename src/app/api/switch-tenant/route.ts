// app/api/switch-tenant/route.ts
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/server/auth0";
import { updateTenantLastLoginDate } from "@/lib/server/mongoUtils";
import { mongoConn } from "@/lib/server/dbConn";
import redisService from "@/lib/server/redisClient";
import type { TenantInfo } from "@/types/tenant";

export async function POST(request: Request) {
  try {
    // Get the authenticated session
    const session = await auth0.getSession();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "not-authenticated", message: "User not authenticated" },
        { status: 401 }
      );
    }

    const { user } = session;
    const userEmail = user?.email?.toLowerCase() || "";

    if (!userEmail) {
      return NextResponse.json(
        { error: "missing-user-email", message: "User email is required" },
        { status: 400 }
      );
    }

    const { tenantUrl } = await request.json();

    if (!tenantUrl) {
      return NextResponse.json(
        { error: "missing-tenant-url", message: "Tenant URL is required" },
        { status: 400 }
      );
    }

    // Fetch current tenant data from Redis
    const tenantData = await redisService.getTenantData(userEmail);

    if (!tenantData || !tenantData.availableTenants) {
      return NextResponse.json(
        { error: "no-tenant-data", message: "No tenant data found" },
        { status: 404 }
      );
    }

    // Find the selected tenant
    const selectedTenant = tenantData.availableTenants.find(
      (tenant: TenantInfo) => tenant.url === tenantUrl
    );

    if (!selectedTenant) {
      return NextResponse.json(
        {
          error: "tenant-not-found",
          message: "Tenant not found in available tenants",
        },
        { status: 404 }
      );
    }

    // Connect to databases
    const { userDb } = await mongoConn();

    // Update tenantData in Redis with the new selected tenant
    const updatedTenantData = {
      ...tenantData,
      tenant: selectedTenant,
    };

    await redisService.setTenantData(
      userEmail,
      updatedTenantData,
      60 * 60 * 24 // 1 day expiry
    );

    // Update lastLoginDate for the selected tenant in MongoDB
    await updateTenantLastLoginDate(userDb, userEmail, selectedTenant.url);

    return NextResponse.json({
      success: true,
      message: "Tenant switched successfully",
      tenant: selectedTenant,
    });
  } catch (error) {
    console.error("Tenant switch error:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Failed to switch tenant" },
      { status: 500 }
    );
  }
}
