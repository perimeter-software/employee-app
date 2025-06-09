// lib/middleware/session.ts
import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import { AuthenticatedRequest, RouteHandler } from "./types";
import { Auth0SessionUser } from "@/domains/user";

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
      // Use auth0.getSession(request) for API routes
      const session = await auth0.getSession();

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "not-authenticated", message: "Authentication required" },
          { status: 401 }
        );
      }

      const userEmail = session.user.email;

      // Database validation
      if (options.requireDatabaseUser) {
        try {
          const { mongoConn } = await import("@/lib/db");
          const { checkUserExistsByEmail } = await import(
            "@/domains/user/utils"
          );

          const { db } = await mongoConn();
          const userExists = await checkUserExistsByEmail(db, userEmail);

          if (!userExists) {
            return NextResponse.json(
              {
                error: "user-not-found",
                message: "User not found in database",
              },
              { status: 404 }
            );
          }
        } catch (dbError) {
          console.error("Database validation error:", dbError);
          return NextResponse.json(
            { error: "database-error", message: "Database validation failed" },
            { status: 500 }
          );
        }
      }

      // Tenant validation
      if (options.requireTenant) {
        try {
          const { mongoConn } = await import("@/lib/db");
          const { checkUserMasterEmail } = await import("@/domains/user/utils");

          const { dbTenant, userDb } = await mongoConn();
          const userMasterRecord = await checkUserMasterEmail(
            userDb,
            dbTenant,
            userEmail
          );

          if (!userMasterRecord?.tenant) {
            return NextResponse.json(
              { error: "no-tenant", message: "No tenant found for user" },
              { status: 404 }
            );
          }
        } catch (tenantError) {
          console.error("Tenant validation error:", tenantError);
          return NextResponse.json(
            { error: "tenant-error", message: "Tenant validation failed" },
            { status: 500 }
          );
        }
      }

      // Add user to request
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = session.user as Auth0SessionUser;

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
