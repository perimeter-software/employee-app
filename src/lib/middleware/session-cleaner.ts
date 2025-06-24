// lib/middleware/session-cleaner.ts
import { NextRequest, NextResponse } from 'next/server';

export function sessionCleanerMiddleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Check if this is a request that's having JWE issues
  const hasSessionCookie =
    request.cookies.has('appSession') ||
    request.cookies.has('appSession.0') ||
    request.cookies.has('appSession.1');

  // If there are auth errors in headers or URL params, clear cookies
  const hasAuthError =
    url.searchParams.has('error') ||
    url.searchParams.get('error')?.includes('auth') ||
    request.headers.get('x-auth-error');

  if (hasSessionCookie && hasAuthError) {
    console.log('🧹 Clearing corrupted session cookies automatically...');

    const response = NextResponse.redirect(
      new URL('/api/auth/login', request.url)
    );

    // Clear all Auth0 session cookies
    const cookiesToClear = [
      'appSession',
      'appSession.0',
      'appSession.1',
      'appSession.2',
      'auth0',
      'auth0.is.authenticated',
    ];

    cookiesToClear.forEach((cookieName) => {
      response.cookies.delete(cookieName);
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    });

    return response;
  }

  return null; // Continue to next middleware
}
