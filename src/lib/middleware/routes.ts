import type { RouteConfig } from "./types";

export const routeConfig: RouteConfig = {
  publicRoutes: [
    "/", // Home/login page
    "/about", // If you have this
    "/contact", // If you have this
    "/api/health", // Health check endpoint
  ],

  protectedRoutes: [
    "/dashboard",
    "/profile",
    "/applications",
    "/jobs",
    "/timecard",
    "/schedule",
    "/admin",
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
