// lib/middleware/middleware.ts - Main middleware logic
import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth";
import { authMiddleware } from "./auth";
import { securityMiddleware } from "./security";
import { loggingMiddleware } from "./logging";
import { rateLimitMiddleware } from "./rate-limiting";
import { isAuthRoute, isStaticAsset, isApiRoute } from "./utils";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let Auth0 handle auth routes
  if (isAuthRoute(pathname)) {
    return auth0.middleware(request);
  }

  // Skip middleware for static assets
  if (isStaticAsset(pathname)) {
    return auth0.middleware(request);
  }

  // Create environment-specific middleware chain
  const middlewares = [
    loggingMiddleware,
    securityMiddleware,
    ...(isApiRoute(pathname) ? [rateLimitMiddleware] : []), // Rate limit API routes
    authMiddleware,
  ];

  // Execute middleware chain
  try {
    for (const middlewareFunc of middlewares) {
      const result = await middlewareFunc(request);
      if (result) return result;
    }

    return auth0.middleware(request);
  } catch (error) {
    console.error("Middleware error:", error);
    return auth0.middleware(request);
  }
}

// Define matcher in a separate export
export const matcher = [
  /*
   * Match all request paths except for the ones starting with:
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico, sitemap.xml, robots.txt (metadata files)
   */
  "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
];
