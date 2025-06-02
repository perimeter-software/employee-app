import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";
import { AuthenticatedRequest, RouteHandler } from "./types";
import { Auth0SessionUser } from "@/domains/user";

export function withAuthAPI<T = unknown>(handler: RouteHandler<T>) {
  return async function (
    request: NextRequest,
    context?: Record<string, unknown>
  ): Promise<NextResponse<T> | NextResponse<unknown>> {
    try {
      // Check authentication
      const session = await auth0.getSession();

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "not-authenticated", message: "Authentication required" },
          { status: 401 }
        );
      }

      // Cast session.user to our type (it should match the structure)
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = session.user as Auth0SessionUser;

      // Call the actual handler with authenticated request
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

// Enhanced version with database validation (Node.js runtime only - for API routes)
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
      // Check Auth0 session
      const session = await auth0.getSession();

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "not-authenticated", message: "Authentication required" },
          { status: 401 }
        );
      }

      // Get email safely
      const userEmail = session.user.email;

      // Optional: Check if user exists in database (API routes only)
      if (options.requireDatabaseUser) {
        const { mongoConn } = await import("@/lib/db");
        const { checkUserExistsByEmail } = await import("@/domains/user");

        const { db } = await mongoConn();
        const userExists = await checkUserExistsByEmail(db, userEmail);

        if (!userExists) {
          return NextResponse.json(
            { error: "user-not-found", message: "User not found in database" },
            { status: 404 }
          );
        }
      }

      // Optional: Check tenant access (API routes only)
      if (options.requireTenant) {
        const { mongoConn } = await import("@/lib/db");
        const { checkUserMasterEmail } = await import("@/domains/user");

        const { dbTenant, userDb } = await mongoConn();
        const userMasterRecord = await checkUserMasterEmail(
          userDb,
          dbTenant,
          userEmail
        );

        if (!userMasterRecord.tenant) {
          return NextResponse.json(
            { error: "no-tenant", message: "No tenant found for user" },
            { status: 404 }
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
