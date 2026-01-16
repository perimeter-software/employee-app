import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";
import { isApiRoute, isStaticAsset, isAuthRoute } from "./utils";

// ERROR-PROOF: Per-route rate limiting to prevent one route from blocking others
const rateLimitMap = new Map<
  string,
  { count: number; lastReset: number; route: string }
>();

// ERROR-PROOF: Exclude Next.js internal routes and development-only routes
function shouldRateLimit(pathname: string): boolean {
  // Skip Next.js internal routes
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__nextjs_original-stack-frame") ||
    pathname.startsWith("/__nextjs_")
  ) {
    return false;
  }

  // Skip static assets
  if (isStaticAsset(pathname)) {
    return false;
  }

  // Skip auth routes (they have their own rate limiting)
  if (isAuthRoute(pathname)) {
    return false;
  }

  // Only rate limit API routes
  return isApiRoute(pathname);
}

export async function rateLimitMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  // ERROR-PROOF: Skip rate limiting for internal Next.js routes
  if (!shouldRateLimit(pathname)) {
    return null;
  }

  // ERROR-PROOF: Use a combination of IP and route for more granular rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  
  // Create a unique key per IP + route combination
  const rateLimitKey = `${ip}:${pathname}`;
  const now = Date.now();
  
  // ERROR-PROOF: Different limits for different route types
  let windowMs = 60 * 1000; // 1 minute
  let maxRequests = 60; // Reduced from 100 to be more conservative

  // More lenient limits for frequently called endpoints
  if (
    pathname.includes("/notifications") ||
    pathname.includes("/current-user") ||
    pathname.includes("/companies/primary")
  ) {
    windowMs = 60 * 1000; // 1 minute
    maxRequests = 30; // Lower limit for frequently polled endpoints
  }

  // Get or create rate limit entry
  const userLimit = rateLimitMap.get(rateLimitKey) || {
    count: 0,
    lastReset: now,
    route: pathname,
  };

  // Reset if window expired
  if (now - userLimit.lastReset > windowMs) {
    userLimit.count = 0;
    userLimit.lastReset = now;
  }

  userLimit.count++;
  rateLimitMap.set(rateLimitKey, userLimit);

  // ERROR-PROOF: Clean up old entries to prevent memory leaks
  if (rateLimitMap.size > 1000) {
    const entriesToDelete: string[] = [];
    for (const [key, value] of rateLimitMap.entries()) {
      if (now - value.lastReset > windowMs * 2) {
        entriesToDelete.push(key);
      }
    }
    entriesToDelete.forEach((key) => rateLimitMap.delete(key));
  }

  // Check if over limit
  if (userLimit.count > maxRequests) {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `⚠️ Rate limit exceeded: ${pathname} - ${userLimit.count}/${maxRequests} requests in ${windowMs}ms`
      );
    }
    return Response.json(
      { error: "Too many requests", message: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  return null;
}
