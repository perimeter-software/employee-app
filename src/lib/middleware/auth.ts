import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";
import { auth0 } from "@/lib/auth";
import { isProtectedRoute, createReturnUrl, createRedirectUrl } from "./utils";
import type { EnhancedUser } from "@/domains/user/types";

// Cache duration for user data (1 hour)
// const USER_CACHE_TTL = 60 * 60; // No longer needed

async function getEnhancedUserData(
  email: string
): Promise<EnhancedUser | null> {
  try {
    // Fetch user data from API
    const response = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_URL
      }/api/auth/user?email=${encodeURIComponent(email)}`
    );
    if (!response.ok) {
      console.log(`❌ User not found in database: ${email}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`❌ Error fetching enhanced user data for ${email}:`, error);
    return null;
  }
}

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

    // Get enhanced user data (no caching)
    const enhancedUser = await getEnhancedUserData(session.user.email!);

    if (!enhancedUser) {
      console.log(`❌ User not found in database: ${session.user.email}`);

      // Redirect to registration or error page
      const redirectUrl = createRedirectUrl(request, "/auth/register");
      return Response.redirect(redirectUrl);
    }

    console.log(
      `✅ Enhanced authenticated access: ${enhancedUser.email} (ID: ${enhancedUser._id}, Applicant: ${enhancedUser.applicantId}) → ${request.nextUrl.pathname}`
    );

    // Add enhanced user data to request headers for API routes to access
    const response = Response.next();
    response.headers.set("x-enhanced-user", JSON.stringify(enhancedUser));

    return response;
  } catch (error) {
    console.error("Auth middleware error:", error);

    // Redirect to login on auth errors
    const redirectUrl = createRedirectUrl(request, "/auth/login");
    return Response.redirect(redirectUrl);
  }
}

// Utility function to clear user cache (no longer needed)
// export async function clearUserCache(email: string): Promise<void> {
//   try {
//     const cacheKey = `user:enhanced:${email.toLowerCase()}`;
//     await redisService.del(cacheKey);
//     console.log(`🗑️ Cleared user cache: ${email}`);
//   } catch (error) {
//     console.error(`❌ Error clearing user cache for ${email}:`, error);
//   }
// }
