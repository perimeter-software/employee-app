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
    "/favicon.ico",
    "/images",
    "/powered-by-gig-blue.png",
    "/sitemap.xml",
    "/robots.txt",
  ],
};
