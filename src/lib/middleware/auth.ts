import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";
import { auth0 } from "@/lib/auth";
import { isProtectedRoute, createReturnUrl, createRedirectUrl } from "./utils";

export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  // Only apply auth logic to protected routes
  if (!isProtectedRoute(request.nextUrl.pathname)) {
    return null; // Continue to next middleware
  }

  try {
    const session = await auth0.getSession(request);

    if (!session?.user) {
      console.log(`Unauthenticated access to: ${request.nextUrl.pathname}`);

      const returnUrl = createReturnUrl(request);
      const redirectUrl = createRedirectUrl(request, "/auth/login", returnUrl);

      return Response.redirect(redirectUrl);
    }

    console.log(
      `Authenticated access: ${session.user.email} → ${request.nextUrl.pathname}`
    );
    return null; // Continue to next middleware
  } catch (error) {
    console.error("Auth middleware error:", error);

    // Redirect to login on auth errors
    const redirectUrl = createRedirectUrl(request, "/auth/login");
    return Response.redirect(redirectUrl);
  }
}
