// lib/auth/session-handler.ts - Auth0 v3 session handling
import { NextRequest, NextResponse } from 'next/server';

// Simple session check for middleware - just check if cookie exists
export function hasSessionCookie(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get('appSession');
  return !!sessionCookie?.value;
}

// Server-side session handler for API routes (where we have req/res context)
export async function getServerSession() {
  try {
    const { getSession } = await import('@auth0/nextjs-auth0');
    const session = await getSession();
    return session;
  } catch (error) {
    console.error('Server session error:', error);
    return null;
  }
}

export function clearAuthCookies(response: NextResponse) {
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
    });
  });

  return response;
}
