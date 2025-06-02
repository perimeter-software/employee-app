import type { NextRequest } from "next/server";
import { routeConfig } from "./routes";

export function isPublicRoute(pathname: string): boolean {
  return routeConfig.publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isProtectedRoute(pathname: string): boolean {
  return routeConfig.protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isAuthRoute(pathname: string): boolean {
  return routeConfig.authRoutes.some((route) => pathname.startsWith(route));
}

export function isStaticAsset(pathname: string): boolean {
  return routeConfig.staticAssets.some((asset) => pathname.startsWith(asset));
}

export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function requiresAuthentication(pathname: string): boolean {
  // If it's a public route, auth is not required
  if (isPublicRoute(pathname)) {
    return false;
  }

  // If it's an auth route (like login), auth is not required
  if (isAuthRoute(pathname)) {
    return false;
  }

  // If it's a static asset, auth is not required
  if (isStaticAsset(pathname)) {
    return false;
  }

  // For API routes, check if they're protected
  if (isApiRoute(pathname)) {
    return isProtectedRoute(pathname);
  }

  // For all other routes, check if they're protected
  return isProtectedRoute(pathname);
}

export function createReturnUrl(request: NextRequest): string {
  return encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
}

export function createRedirectUrl(
  request: NextRequest,
  path: string,
  returnUrl?: string
): URL {
  const url = new URL(path, request.url);
  if (returnUrl) {
    url.searchParams.set("returnTo", returnUrl);
  }
  return url;
}
