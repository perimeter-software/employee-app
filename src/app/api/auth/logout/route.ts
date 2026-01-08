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

    // Get user info for logging before clearing session
    let userInfoForLogging: {
      userId?: string;
      applicantId?: string;
      agent?: string;
    } | null = null;

    if (otpSessionId) {
      try {
        const otpSessionData = await redisService.get<{
          userId: string;
          email: string;
          name: string;
          firstName?: string;
          lastName?: string;
        }>(`otp_session:${otpSessionId}`);
        
        if (otpSessionData) {
          userInfoForLogging = {
            userId: otpSessionData.userId,
            applicantId: otpSessionData.userId, // For OTP, userId might be the same
            agent: otpSessionData.name || otpSessionData.firstName || otpSessionData.email,
          };
        }
      } catch {
        // Ignore errors getting OTP session for logging
      }
    }

    // Try to get Auth0 session for logging
    let userEmail: string | undefined;
    try {
      const { getSession } = await import('@auth0/nextjs-auth0');
      const auth0Session = await getSession();
      if (auth0Session?.user) {
        userEmail = auth0Session.user.email;
        if (!userInfoForLogging) {
          userInfoForLogging = {
            userId: auth0Session.user.sub,
            applicantId: auth0Session.user.sub,
            agent: auth0Session.user.name || auth0Session.user.email,
          };
        }
      }
    } catch {
      // Ignore errors getting Auth0 session
    }

    // Log logout activity before clearing session
    if (userInfoForLogging) {
      try {
        const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
        const { mongoConn } = await import('@/lib/db/mongodb');
        const { db } = await mongoConn();
        await logActivity(
          db,
          createActivityLogData(
            'User Logout',
            `${userInfoForLogging.agent || 'User'} logged out`,
            {
              applicantId: userInfoForLogging.applicantId,
              userId: userInfoForLogging.userId,
              agent: userInfoForLogging.agent,
              email: userEmail || '',
              details: {
                logoutMethod: otpSessionId ? 'OTP' : 'Auth0',
              },
            }
          )
        );
      } catch (error) {
        // Don't fail logout if logging fails
        console.error('Error logging logout activity:', error);
      }
    }

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
    // Set returnTo with loggedout parameter to prevent auto-login redirect
    // Auth0 expects a relative path, not a full URL
    const returnToPath = '/?loggedout=true';
    const auth0Response = await handleLogout(request, context, {
      returnTo: returnToPath,
    });

    // Get redirect URL from Location header
    // Auth0 might redirect to its own logout endpoint first, then back to returnTo
    // We need to ensure the final redirect includes the loggedout parameter
    const locationHeader = auth0Response.headers.get('location');
    let redirectUrl: URL;
    
    if (locationHeader) {
      redirectUrl = new URL(locationHeader, request.url);
      // If it's pointing to our domain (not Auth0's), ensure loggedout param is present
      if (redirectUrl.pathname === '/' && !redirectUrl.searchParams.has('loggedout')) {
        redirectUrl.searchParams.set('loggedout', 'true');
      }
    } else {
      // Fallback: redirect to home with loggedout parameter
      redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('loggedout', 'true');
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

    // Clear all auth-related cookies to ensure complete logout
    const cookiesToClear = [
      'otp_session_id',
      'auth0.is.authenticated',
      'appSession',
      'appSession.0',
      'appSession.1',
      'appSession.2',
    ];

    cookiesToClear.forEach((cookieName) => {
      // Delete cookie
      response.cookies.delete(cookieName);
      // Set expired cookie for all possible paths
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: cookieName !== 'auth0.is.authenticated',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    });

    console.log('✅ All sessions cleared (Auth0 and OTP)');

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    
    // Even if there's an error, try to clear cookies and redirect
    // Add loggedout parameter to prevent auto-login redirect
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('loggedout', 'true');
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

