// lib/middleware/middleware.ts - Auth0 v3 compatible
import type { NextRequest } from 'next/server';
import { authMiddleware } from './auth';
import { loggingMiddleware } from './logging';
import { isAuthRoute, isStaticAsset } from './utils';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let Auth0 handle auth routes
  if (isAuthRoute(pathname)) {
    console.log(`🔐 Auth route detected: ${pathname}`);
    return null; // Let the API route handle it
  }

  // Skip middleware for static assets
  if (isStaticAsset(pathname)) {
    return null;
  }

  // Run middleware chain
  console.log(`📝 Request to: ${pathname}`);

  try {
    // First run logging
    const loggingResult = await loggingMiddleware(request);
    if (loggingResult) return loggingResult;

    // Then run auth middleware for protected routes
    const authResult = await authMiddleware(request);
    if (authResult) return authResult;

    return null; // Continue
  } catch (error) {
    console.error('Middleware error:', error);
    return null;
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
  '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
];
