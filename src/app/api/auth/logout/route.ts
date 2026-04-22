// app/api/auth/logout/route.ts
// Custom logout endpoint that handles Auth0, OTP, and (V4) Clerk sessions.
import { NextRequest, NextResponse } from 'next/server';
import { handleLogout } from '@auth0/nextjs-auth0';
import redisService from '@/lib/cache/redis-client';
import { IS_V4 } from '@/lib/config/auth-mode';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // V4: Clerk owns the session. Revoke all sessions for the signed-in user
  // server-side (so the cookie stops being valid even if the client never
  // calls signOut), then redirect home. Clerk itself clears the __session
  // cookie on the next authed request; explicitly clear any stragglers too.
  if (IS_V4) {
    try {
      const { auth, clerkClient } = await import('@clerk/nextjs/server');
      const { userId } = await auth();
      if (userId) {
        const client = await clerkClient();
        const sessions = await client.sessions.getSessionList({ userId });
        await Promise.all(
          sessions.data.map((s) => client.sessions.revokeSession(s.id))
        );
      }
    } catch (error) {
      console.error('V4 logout: Clerk session revoke failed', error);
    }
    const response = NextResponse.redirect(new URL('/', request.url));
    // Clerk session cookie name varies (__session in prod, __clerk_db_jwt in dev);
    // clear the commonly-set ones so the browser doesn't hold stale auth.
    ['__session', '__clerk_db_jwt', '__client_uat'].forEach((name) => {
      response.cookies.set(name, '', {
        expires: new Date(0),
        path: '/',
      });
    });
    return response;
  }

  try {
    // Get OTP session ID before clearing cookies
    const otpSessionId = request.cookies.get('otp_session_id')?.value;

    // Get user info for logging before clearing session
    let userInfoForLogging: {
      userId?: string;
      applicantId?: string;
      agent?: string;
      email?: string;
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
          const activityEmail = otpSessionData.email?.toLowerCase().trim();
          let resolvedUserId: string | undefined;
          let resolvedApplicantId: string | undefined;
          const tenantData = activityEmail
            ? await redisService.getTenantData(activityEmail)
            : null;
          const tenantDbName = tenantData?.tenant?.dbName;
          if (tenantDbName && activityEmail) {
            try {
              const { mongoConn } = await import('@/lib/db/mongodb');
              const { resolveActivityIdentityByEmail } = await import(
                '@/lib/services/activity-identity'
              );
              const { db } = await mongoConn(tenantDbName);
              const resolved = await resolveActivityIdentityByEmail(
                db,
                activityEmail
              );
              resolvedUserId = resolved.userId;
              resolvedApplicantId = resolved.applicantId;
            } catch {
              // Ignore lookup errors and fall back to OTP session values
            }
          }

          userInfoForLogging = {
            userId: resolvedUserId || otpSessionData.userId,
            applicantId: resolvedApplicantId || otpSessionData.userId,
            agent: otpSessionData.name || otpSessionData.firstName || otpSessionData.email,
            email: otpSessionData.email,
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
          const activityEmail = auth0Session.user.email?.toLowerCase().trim();
          const tenantData = activityEmail
            ? await redisService.getTenantData(activityEmail)
            : null;
          const tenantDbName = tenantData?.tenant?.dbName;
          let resolvedAuthUserId: string | undefined;
          let resolvedAuthApplicantId: string | undefined;

          if (tenantDbName && activityEmail) {
            try {
              const { mongoConn } = await import('@/lib/db/mongodb');
              const { resolveActivityIdentityByEmail } = await import(
                '@/lib/services/activity-identity'
              );
              const { db } = await mongoConn(tenantDbName);
              const resolved = await resolveActivityIdentityByEmail(
                db,
                activityEmail
              );
              resolvedAuthUserId = resolved.userId;
              resolvedAuthApplicantId = resolved.applicantId;
            } catch {
              // Ignore lookup errors and fall back to available session values
            }
          }

          // Safety: never write Auth0 subject IDs into activity user/applicant fields.
          if (resolvedAuthUserId && resolvedAuthApplicantId) {
            userInfoForLogging = {
              userId: resolvedAuthUserId,
              applicantId: resolvedAuthApplicantId,
              agent: auth0Session.user.name || auth0Session.user.email,
              email: auth0Session.user.email,
            };
          } else {
            console.warn(
              `Skipping logout activity log: could not resolve DB user/applicant IDs for ${activityEmail || 'unknown email'}`
            );
          }
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
        const activityEmail = (userEmail || userInfoForLogging.email || '').toLowerCase().trim();
        const tenantData = activityEmail
          ? await redisService.getTenantData(activityEmail)
          : null;
        const tenantDbName = tenantData?.tenant?.dbName;
        if (!tenantDbName) {
          console.warn(
            `Skipping logout activity log: tenant dbName unavailable for ${activityEmail || 'unknown email'}`
          );
        } else if (!userInfoForLogging.userId || !userInfoForLogging.applicantId) {
          console.warn(
            `Skipping logout activity log: missing resolved IDs for ${activityEmail || 'unknown email'}`
          );
        } else {
          const { db } = await mongoConn(tenantDbName);
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
        }
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

