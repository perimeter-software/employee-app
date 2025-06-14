// lib/middleware/session.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import { AuthenticatedRequest, RouteHandler } from "./types";
import { Auth0SessionUser, EnhancedUser } from "@/domains/user";

export function withAuthAPI<T = unknown>(handler: RouteHandler<T>) {
  return async function (
    request: NextRequest,
    context?: Record<string, unknown>
  ): Promise<NextResponse<T> | NextResponse<unknown>> {
    try {
      // Use auth0.getSession(request) for API routes
      const session = await auth0.getSession();

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "not-authenticated", message: "Authentication required" },
          { status: 401 }
        );
      }

      // Add user to request
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = session.user as Auth0SessionUser;

      return handler(authenticatedRequest, context);
    } catch (error) {
      console.error("Auth middleware error:", error);
      return NextResponse.json(
        { error: "auth-error", message: "Authentication failed" },
        { status: 500 }
      );
    }
  };
}

export function withEnhancedAuthAPI<T = unknown>(
  handler: RouteHandler<T>,
  options: {
    requireDatabaseUser?: boolean;
    requireTenant?: boolean;
  } = {}
) {
  return async function (
    request: NextRequest,
    context?: Record<string, unknown>
  ): Promise<NextResponse<T> | NextResponse<unknown>> {
    try {
      // Use auth0.getSession() for API routes
      const session = await auth0.getSession();

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "not-authenticated", message: "Authentication required" },
          { status: 401 }
        );
      }

      const userEmail = session.user.email;
      let enhancedUser: Auth0SessionUser | null = null;

      // FIRST: Try to get enhanced user data from middleware headers
      const enhancedUserHeader = request.headers.get("x-enhanced-user");
      if (enhancedUserHeader) {
        try {
          const parsedUser = JSON.parse(enhancedUserHeader) as EnhancedUser;
          console.log(`📦 Using enhanced user from middleware: ${userEmail}`, {
            _id: parsedUser._id,
            applicantId: parsedUser.applicantId,
            tenant: parsedUser.tenant,
          });

          // Convert EnhancedUser to Auth0SessionUser format
          enhancedUser = {
            // Auth0 fields
            sub: session.user.sub,
            email: parsedUser.email,
            name: parsedUser.name,

            // Enhanced fields from database
            _id: parsedUser._id,
            applicantId: parsedUser.applicantId,
            firstName: parsedUser.firstName,
            lastName: parsedUser.lastName,
            userType: parsedUser.userType,
            employeeType: parsedUser.employeeType,
            status: parsedUser.status,
            tenant: parsedUser.tenant,
            availableTenants: parsedUser.availableTenants,
          } as Auth0SessionUser;
        } catch (error) {
          console.error("❌ Error parsing enhanced user from headers:", error);
        }
      }

      // FALLBACK: If no enhanced user in headers, fetch from database
      if (
        !enhancedUser &&
        (options.requireDatabaseUser || options.requireTenant)
      ) {
        console.log(
          "⚠️ No enhanced user in headers, fetching from database..."
        );

        try {
          const { mongoConn } = await import("@/lib/db");
          const { checkUserExistsByEmail, checkUserMasterEmail } = await import(
            "@/domains/user/utils"
          );

          const { db, dbTenant, userDb } = await mongoConn();

          // Get user data from database
          const userExists = await checkUserExistsByEmail(db, userEmail);

          if (!userExists) {
            console.log(`❌ User not found in database: ${userEmail}`);
            return NextResponse.json(
              {
                error: "user-not-found",
                message: "User not found in database",
              },
              { status: 404 }
            );
          }

          // Get tenant data if required
          let userMasterRecord = null;
          if (options.requireTenant) {
            userMasterRecord = await checkUserMasterEmail(
              userDb,
              dbTenant,
              userEmail
            );

            if (!userMasterRecord?.tenant) {
              console.log(`❌ No tenant found for user: ${userEmail}`);
              return NextResponse.json(
                { error: "no-tenant", message: "No tenant found for user" },
                { status: 404 }
              );
            }
          }

          // Create enhanced user object
          enhancedUser = {
            // Auth0 data
            sub: session.user.sub,
            email: userEmail,
            name: session.user.name,

            // Database user data
            _id: userExists._id,
            applicantId: userExists.applicantId,
            firstName: userExists.firstName,
            lastName: userExists.lastName,
            userType: userExists.userType,
            employeeType: userExists.employeeType,
            status: userExists.status,

            // Tenant data (if available)
            tenant: userMasterRecord?.tenant || undefined,
            availableTenants: userMasterRecord?.availableTenantObjects || [],
          } as Auth0SessionUser;

          console.log(`✅ Enhanced user data loaded from DB: ${userEmail}`, {
            _id: enhancedUser._id,
            applicantId: enhancedUser.applicantId,
            tenant: enhancedUser.tenant,
          });
        } catch (dbError) {
          console.error("Database validation error:", dbError);
          return NextResponse.json(
            { error: "database-error", message: "Database validation failed" },
            { status: 500 }
          );
        }
      }

      // Validate requirements
      if (options.requireDatabaseUser && !enhancedUser?._id) {
        return NextResponse.json(
          {
            error: "database-user-required",
            message: "Database user record required",
          },
          { status: 403 }
        );
      }

      if (options.requireTenant && !enhancedUser?.tenant) {
        return NextResponse.json(
          {
            error: "tenant-required",
            message: "Tenant access required",
          },
          { status: 403 }
        );
      }

      // Add enhanced user to request
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user =
        enhancedUser || (session.user as Auth0SessionUser);

      console.log(
        `✅ API Request authenticated: ${userEmail} → ${request.url}`
      );

      return handler(authenticatedRequest, context);
    } catch (error) {
      console.error("Enhanced auth middleware error:", error);
      return NextResponse.json(
        { error: "auth-error", message: "Authentication failed" },
        { status: 500 }
      );
    }
  };
}
