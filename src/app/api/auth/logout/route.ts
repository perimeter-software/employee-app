// app/api/auth/logout/route.ts
// Custom logout endpoint that handles both Auth0 and OTP sessions
import { NextRequest, NextResponse } from 'next/server';
import { handleLogout } from '@auth0/nextjs-auth0';
import redisService from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

// Create the Auth0 logout handler
const auth0Logout = handleLogout({
  returnTo: '/',
});

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
    const response = await auth0Logout(request);

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

    console.log('✅ All sessions cleared (Auth0 and OTP)');

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    
    // Even if there's an error, try to clear cookies and redirect
    const response = NextResponse.redirect(new URL('/', request.url));
    
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

