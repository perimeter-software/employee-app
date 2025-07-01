// lib/middleware/auth.ts - Auth0 v3 middleware
import type { NextRequest, NextResponse } from 'next/server';
import { NextResponse as Response } from 'next/server';
import { isProtectedRoute, createReturnUrl, createRedirectUrl } from './utils';
import { hasSessionCookie } from '../auth/session-handler';

export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  // Only apply auth logic to protected routes
  if (!isProtectedRoute(request.nextUrl.pathname)) {
    return null; // Continue to next middleware
  }

  try {
    // Simple session cookie check for middleware
    // Full session validation will happen in API route handlers
    if (!hasSessionCookie(request)) {
      console.log(`Unauthenticated access to: ${request.nextUrl.pathname}`);

      const returnUrl = createReturnUrl(request);
      const redirectUrl = createRedirectUrl(
        request,
        '/api/auth/login',
        returnUrl
      );

      return Response.redirect(redirectUrl);
    }

    console.log(`✅ Session cookie found for: ${request.nextUrl.pathname}`);

    // Continue with session cookie present
    const nextResponse = Response.next();
    nextResponse.headers.set('x-has-session', 'true');

    return nextResponse;
  } catch (error) {
    console.error('Auth middleware error:', error);

    // Redirect to login on auth errors
    const redirectUrl = createRedirectUrl(request, '/api/auth/login');
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
