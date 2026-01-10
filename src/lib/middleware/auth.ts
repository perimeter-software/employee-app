// lib/middleware/auth.ts - Auth0 v3 middleware
import type { NextRequest, NextResponse } from 'next/server';
import { NextResponse as Response } from 'next/server';
import { isProtectedRoute, createReturnUrl, createRedirectUrl, isPaycheckStubRoute } from './utils';
import { hasSessionCookie } from '../auth/session-handler';

export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  
  // Only apply auth logic to protected routes and paycheck stub routes
  if (!isProtectedRoute(pathname) && !isPaycheckStubRoute(pathname)) {
    return null; // Continue to next middleware
  }

  try {
    // Simple session cookie check for middleware
    // Full session validation will happen in API route handlers
    if (!hasSessionCookie(request)) {
      console.log(`Unauthenticated access to: ${pathname}`);

      const returnUrl = createReturnUrl(request);
      // Redirect to app's login page (/) instead of /api/auth/login
      // This allows users to choose between Auth0 and OTP login methods
      const redirectUrl = createRedirectUrl(
        request,
        '/',
        returnUrl
      );

      return Response.redirect(redirectUrl);
    }

    console.log(`✅ Session cookie found for: ${pathname}`);

    // Check for limited access users - redirect them away from protected routes (but allow paycheck stubs)
    const isLimitedAccess = request.cookies.get('is_limited_access')?.value === 'true';
    console.log(`🔒 Limited access check: ${isLimitedAccess}, pathname: ${pathname}, isProtected: ${isProtectedRoute(pathname)}, isPaycheck: ${isPaycheckStubRoute(pathname)}`);
    
    if (isLimitedAccess && isProtectedRoute(pathname) && !isPaycheckStubRoute(pathname)) {
      console.log(`🚫 Redirecting limited access user from ${pathname} to /paycheck-stubs`);
      return Response.redirect(new URL('/paycheck-stubs', request.url));
    }

    // Continue with session cookie present
    const nextResponse = Response.next();
    nextResponse.headers.set('x-has-session', 'true');

    return nextResponse;
  } catch (error) {
    console.error('Auth middleware error:', error);

    // Redirect to app's login page on auth errors (allows OTP option)
    const redirectUrl = createRedirectUrl(request, '/');
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
