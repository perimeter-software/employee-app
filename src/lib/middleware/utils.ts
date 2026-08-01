import type { NextRequest } from "next/server";
import { routeConfig } from "./routes";

export function isPublicRoute(pathname: string): boolean {
  return routeConfig.publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * The candidate-facing public pages, whose first path segment is a tenant
 * dbName: /:tenant/render-assessment/... and /:tenant/render-form/...
 *
 * Matched explicitly because the tenant segment is attacker-of-coincidence
 * territory: a tenant whose dbName happened to be "admin", "jobs", "profile",
 * etc. would otherwise trip the prefix check below and bounce candidates to
 * login on a link that must work logged out.
 */
const PUBLIC_RENDER_ROUTE = /^\/[^/]+\/render-(assessment|form)(\/|$)/;

export function isPublicRenderRoute(pathname: string): boolean {
  return PUBLIC_RENDER_ROUTE.test(pathname);
}

export function isProtectedRoute(pathname: string): boolean {
  if (isPublicRenderRoute(pathname)) return false;
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

// Returns the raw path — NOT encoded. `createRedirectUrl` puts it through
// `searchParams.set`, which does the encoding. Encoding here too yielded
// `returnTo=%252Fevents`, which the login screen then decoded to `%2Fevents`
// and pushed as a route, landing the user on `/%2Fevents`.
export function createReturnUrl(request: NextRequest): string {
  return request.nextUrl.pathname + request.nextUrl.search;
}

/**
 * Builds an absolute URL for `path` on the *public* origin.
 *
 * `request.url` carries the internal origin (localhost:3000) when nginx
 * proxies to the Next.js server, so redirecting against it would send the
 * browser somewhere it can't reach. The forwarded headers hold the real host.
 */
export function buildForwardedUrl(request: NextRequest, path: string): URL {
  const forwardedHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const base = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : request.nextUrl.origin;

  return new URL(path, base);
}

export function createRedirectUrl(
  request: NextRequest,
  path: string,
  returnUrl?: string
): URL {
  const url = buildForwardedUrl(request, path);
  if (returnUrl) {
    url.searchParams.set("returnTo", returnUrl);
  }
  return url;
}
