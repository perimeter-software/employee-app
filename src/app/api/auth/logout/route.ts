// app/api/auth/logout/route.ts
// Custom logout endpoint that handles both Auth0 and OTP sessions
import { NextRequest, NextResponse } from 'next/server';
import { handleLogout } from '@auth0/nextjs-auth0';
import redisService from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get OTP session ID before clearing cookies
    const otpSessionId = request.cookies.get('otp_session_id')?.value;

    // Clear OTP session from Redis if it exists
    if (otpSessionId) {
      try {
        await redisService.del(`otp_session:${otpSessionId}`);
        console.log('✅ OTP session cleared from Redis');
      } catch (error) {
        console.error('Error clearing OTP session from Redis:', error);
      }
    }

    // Handle Auth0 logout (this will clear Auth0 cookies and redirect)
    // handleLogout expects (request, context, options) for App Router
    // Context should have params as Record<string, string | string[]>
    const context = { params: {} };
    // Redirect to clean home page without any parameters
    const returnToPath = '/';
    const auth0Response = await handleLogout(request, context, {
      returnTo: returnToPath,
    });

    // Get redirect URL from Location header
    // Auth0 might redirect to its own logout endpoint first, then back to returnTo
    const locationHeader = auth0Response.headers.get('location');
    let redirectUrl: URL;
    
    if (locationHeader) {
      redirectUrl = new URL(locationHeader, request.url);
      // If it's pointing to our domain (not Auth0's), ensure clean URL without parameters
      if (redirectUrl.pathname === '/') {
        redirectUrl.search = ''; // Remove all query parameters
      }
    } else {
      // Fallback: redirect to clean home page
      redirectUrl = new URL('/', request.url);
    }

    // Convert Response to NextResponse to access cookies
    const response = NextResponse.redirect(redirectUrl, {
      status: auth0Response.status,
      statusText: auth0Response.statusText,
    });

    // Copy headers from Auth0 response (except Location, which we handle above)
    auth0Response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'location') {
        response.headers.set(key, value);
      }
    });

    // Also clear OTP session cookies
    response.cookies.delete('otp_session_id');
    response.cookies.set('otp_session_id', '', {
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    // Clear auth0.is.authenticated cookie (used for compatibility)
    response.cookies.delete('auth0.is.authenticated');
    response.cookies.set('auth0.is.authenticated', '', {
      expires: new Date(0),
      path: '/',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    // Clear appSession cookies (Auth0 session cookies)
    const appSessionCookies = ['appSession', 'appSession.0', 'appSession.1', 'appSession.2'];
    appSessionCookies.forEach((cookieName) => {
      response.cookies.delete(cookieName);
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    });

    console.log('✅ All sessions cleared (Auth0 and OTP)');

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    
    // Even if there's an error, try to clear cookies and redirect
    // Redirect to clean home page
    const redirectUrl = new URL('/', request.url);
    const response = NextResponse.redirect(redirectUrl);
    
    // Clear all auth cookies
    const cookiesToClear = [
      'appSession',
      'appSession.0',
      'appSession.1',
      'appSession.2',
      'auth0',
      'auth0.is.authenticated',
      'otp_session_id',
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
}

