import type { RouteConfig } from "./types";

export const routeConfig: RouteConfig = {
  publicRoutes: [
    "/", // Home/login page
    "/about", // If you have this
    "/contact", // If you have this
    "/api/health", // Health check endpoint
  ],

  // Every app screen that needs a session. Matched by prefix, so nested
  // routes (/forms/123, /paycheck-stubs/abc) are covered.
  //
  // Keep this in sync with the pages under src/app — a protected page missing
  // from this list is reachable by deep link with an expired session, and the
  // user ends up staring at a spinner while every request 401s instead of
  // being sent back to the login screen.
  //
  // Deliberately NOT here (they must render logged out): "/", "/sign-in",
  // "/sign-up", "/terms", "/link", "/logout", "/offline",
  // "/compatibility-mode", and the public /:tenant/render-* pages.
  protectedRoutes: [
    "/applicant",
    "/conversation",
    "/dashboard",
    "/documents",
    "/events",
    "/forms",
    "/home",
    "/invoices",
    "/notifications",
    "/paycheck-stubs",
    "/payroll",
    "/privacy",
    "/profile",
    "/pto",
    "/time",
    "/venues",
  ],

  authRoutes: [
    "/auth", // Auth0 handles these
  ],

  staticAssets: [
    "/_next",
    "/__nextjs_original-stack-frame", // ERROR-PROOF: Exclude Next.js error stack frames
    "/__nextjs_", // ERROR-PROOF: Exclude all Next.js internal routes
    "/favicon.ico",
    "/images",
    "/powered-by-gig-blue.png",
    "/sitemap.xml",
    "/robots.txt",
  ],
};
