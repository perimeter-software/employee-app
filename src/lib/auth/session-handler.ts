// lib/auth/session-handler.ts - Edge Runtime compatible session handling
import { NextRequest, NextResponse } from 'next/server';

// Simple session check for middleware - just check if cookie exists
// This is Edge Runtime compatible since it only checks cookies
export function hasSessionCookie(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get('appSession');
  const otpSessionCookie = request.cookies.get('otp_session_id');
  return !!(sessionCookie?.value || otpSessionCookie?.value);
}

export function clearAuthCookies(response: NextResponse) {
  const cookiesToClear = [
    'appSession',
    'appSession.0',
    'appSession.1',
    'appSession.2',
    'auth0',
    'auth0.is.authenticated',
    'otp_session_id', // Add OTP session cookie
  ];

  cookiesToClear.forEach((cookieName) => {
    response.cookies.delete(cookieName);
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  return response;
}
