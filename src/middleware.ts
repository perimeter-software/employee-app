// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  // Let Auth0 handle all auth routes and session management
  const authRes = await auth0.middleware(request);

  // Ensure your own middleware does not handle the `/auth` routes - they're auto-mounted by the SDK
  if (request.nextUrl.pathname.startsWith("/auth")) {
    return authRes;
  }

  // Allow access to the login page, API routes, and static assets
  if (
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/api/") ||
    request.nextUrl.pathname.startsWith("/_next/") ||
    request.nextUrl.pathname.startsWith("/favicon.ico") ||
    request.nextUrl.pathname.startsWith("/powered-by-gig-blue.png")
  ) {
    return authRes;
  }

  // Protected routes that require authentication
  const protectedRoutes = ["/dashboard", "/profile", "/applications", "/jobs"];
  const isProtectedRoute = protectedRoutes.some(
    (route) =>
      request.nextUrl.pathname === route ||
      request.nextUrl.pathname.startsWith(`${route}/`)
  );

  if (isProtectedRoute) {
    const session = await auth0.getSession();

    // If no session, redirect to login
    if (!session) {
      const returnUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/auth/login?returnTo=${returnUrl}`, request.url)
      );
    }
  }

  // Continue with Auth0's response for all other cases
  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
