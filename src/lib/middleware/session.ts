// lib/middleware/session.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import { AuthenticatedRequest, RouteHandler } from './types';
import { Auth0SessionUser, EnhancedUser } from '@/domains/user';
import redisService from '@/lib/cache/redis-client';

/**
 * Get user session from either Auth0 or OTP
 * Returns user data in Auth0-compatible format
 */
async function getUserSession(request: NextRequest): Promise<Auth0SessionUser | null> {
  try {
    // First, try Auth0 session
    const auth0Session = await getSession();
    if (auth0Session?.user?.email) {
      return auth0Session.user as Auth0SessionUser;
    }

    // If no Auth0 session, try OTP session
    const otpSessionId = request.cookies.get('otp_session_id')?.value;
    if (!otpSessionId) {
      return null;
    }

    const otpSessionData = await redisService.get<{
      userId: string;
      email: string;
      name: string;
      firstName?: string;
      lastName?: string;
      picture?: string;
      loginMethod: string;
      isLimitedAccess?: boolean;
      employmentStatus?: string;
      createdAt: string;
    }>(`otp_session:${otpSessionId}`);

    if (!otpSessionData) {
      return null;
    }

    // Convert OTP session to Auth0-compatible format
    return {
      sub: otpSessionData.userId,
      email: otpSessionData.email,
      name: otpSessionData.name,
      firstName: otpSessionData.firstName,
      lastName: otpSessionData.lastName,
      picture: otpSessionData.picture,
      loginMethod: otpSessionData.loginMethod,
      isLimitedAccess: otpSessionData.isLimitedAccess || false,
      employmentStatus: otpSessionData.employmentStatus,
    } as Auth0SessionUser;
  } catch (error) {
    console.error('Error getting user session:', error);
    return null;
  }
}

export function withAuthAPI<T = unknown>(handler: RouteHandler<T>) {
  return async function (
    request: NextRequest,
    context: { params: Promise<Record<string, string | string[] | undefined>> }
  ): Promise<NextResponse<T> | NextResponse<unknown>> {
    try {
      // Get user session (Auth0 or OTP)
      const user = await getUserSession(request);

      if (!user?.email) {
        return NextResponse.json(
          { error: 'not-authenticated', message: 'Authentication required' },
          { status: 401 }
        );
      }

      // Add user to request
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = user as Auth0SessionUser;

      return handler(authenticatedRequest, context);
    } catch (error) {
      console.error('Auth middleware error:', error);

      return NextResponse.json(
        { error: 'auth-error', message: 'Authentication failed' },
        { status: 500 }
      );
    }
  };
}

export function withEnhancedAuthAPI<T = unknown>(
  handler: RouteHandler<T>,
  options: {
    requireDatabaseUser?: boolean;
    requireTenant?: boolean;
  } = {}
) {
  return async function (
    request: NextRequest,
    context: { params: Promise<Record<string, string | string[] | undefined>> }
  ): Promise<NextResponse<T> | NextResponse<unknown>> {
    try {
      // Get user session (Auth0 or OTP)
      const user = await getUserSession(request);

      // If no session, return 401
      if (!user?.email) {
        return NextResponse.json(
          { error: 'not-authenticated', message: 'Authentication required' },
          { status: 401 }
        );
      }

      const userEmail = user.email;
      let enhancedUser: Auth0SessionUser | null = null;

      // FIRST: Try to get enhanced user data from middleware headers
      const enhancedUserHeader = request.headers.get('x-enhanced-user');
      if (enhancedUserHeader) {
        try {
          const parsedUser = JSON.parse(enhancedUserHeader) as EnhancedUser;
          console.log(`📦 Using enhanced user from middleware: ${userEmail}`, {
            _id: parsedUser._id,
            applicantId: parsedUser.applicantId,
            tenant: parsedUser.tenant,
          });

          // Convert EnhancedUser to Auth0SessionUser format
          enhancedUser = {
            // Auth0 fields
            sub: user.sub,
            email: parsedUser.email,
            name: parsedUser.name,

            // Enhanced fields from database
            _id: parsedUser._id,
            applicantId: parsedUser.applicantId,
            firstName: parsedUser.firstName,
            lastName: parsedUser.lastName,
            userType: parsedUser.userType,
            employeeType: parsedUser.employeeType,
            status: parsedUser.status,
            tenant: parsedUser.tenant,
            availableTenants: parsedUser.availableTenants,
          } as Auth0SessionUser;
        } catch (error) {
          console.error('❌ Error parsing enhanced user from headers:', error);
        }
      }

      // FALLBACK: If no enhanced user in headers, fetch from database
      if (
        !enhancedUser &&
        (options.requireDatabaseUser || options.requireTenant)
      ) {
        console.log(
          '⚠️ No enhanced user in headers, fetching from database...'
        );

        try {
          const { getTenantAwareConnection } = await import('@/lib/db');
          const { checkUserExistsByEmail, checkUserMasterEmail } = await import(
            '@/domains/user/utils'
          );
          const redisService = await import('@/lib/cache/redis-client');

          // FIRST: Check if we have tenant-specific user identity cached
          const cachedTenantData =
            await redisService.default.getTenantData(userEmail);
          let userExists = null;
          let userMasterRecord = null;

          if (
            cachedTenantData?.tenant?.dbName &&
            cachedTenantData?.userIdentity
          ) {
            console.log(
              `📦 Using cached user identity for tenant: ${cachedTenantData.tenant.dbName}`,
              {
                _id: cachedTenantData.userIdentity._id,
                applicantId: cachedTenantData.userIdentity.applicantId,
              }
            );

            // Use cached user identity for the current tenant
            userExists = cachedTenantData.userIdentity;
            userMasterRecord = {
              tenant: cachedTenantData.tenant,
              availableTenantObjects: cachedTenantData.availableTenants || [],
            };
          } else {
            // FALLBACK: Look up in database using tenant-aware connection
            // Create a temporary authenticated request for getTenantAwareConnection
            const tempRequest = request as AuthenticatedRequest;
            tempRequest.user = user as Auth0SessionUser;
            
            const { db, dbTenant, userDb } = await getTenantAwareConnection(tempRequest);

            // Get user data from tenant-specific database
            userExists = await checkUserExistsByEmail(db, userEmail);

            if (!userExists) {
              console.log(`❌ User not found in database: ${userEmail}`);
              return NextResponse.json(
                {
                  error: 'user-not-found',
                  message: 'User not found in database',
                },
                { status: 404 }
              );
            }

            // Get tenant data if required
            if (options.requireTenant) {
              userMasterRecord = await checkUserMasterEmail(
                userDb,
                dbTenant,
                userEmail
              );

              if (!userMasterRecord?.tenant) {
                console.log(`❌ No tenant found for user: ${userEmail}`);
                return NextResponse.json(
                  { error: 'no-tenant', message: 'No tenant found for user' },
                  { status: 404 }
                );
              }
            }
          }

          // Create enhanced user object
          enhancedUser = {
            // Auth0 data
            sub: user.sub,
            email: userEmail,
            name: user.name,

            // Database user data
            _id: userExists._id,
            applicantId: userExists.applicantId,
            firstName: userExists.firstName,
            lastName: userExists.lastName,
            userType: userExists.userType,
            employeeType: userExists.employeeType,
            status: userExists.status,

            // Tenant data (if available)
            tenant: userMasterRecord?.tenant || undefined,
            availableTenants: userMasterRecord?.availableTenantObjects || [],
          } as Auth0SessionUser;

          console.log(`✅ Enhanced user data loaded from DB: ${userEmail}`, {
            _id: enhancedUser._id,
            applicantId: enhancedUser.applicantId,
            tenant: enhancedUser.tenant,
          });
        } catch (dbError) {
          console.error('Database validation error:', dbError);
          return NextResponse.json(
            { error: 'database-error', message: 'Database validation failed' },
            { status: 500 }
          );
        }
      }

      // Validate requirements
      if (options.requireDatabaseUser && !enhancedUser?._id) {
        return NextResponse.json(
          {
            error: 'database-user-required',
            message: 'Database user record required',
          },
          { status: 403 }
        );
      }

      if (options.requireTenant && !enhancedUser?.tenant) {
        return NextResponse.json(
          {
            error: 'tenant-required',
            message: 'Tenant access required',
          },
          { status: 403 }
        );
      }

      // Add enhanced user to request
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user =
        enhancedUser || (user as Auth0SessionUser);

      console.log(
        `✅ Enhanced API Request authenticated: ${userEmail} → ${request.url}`
      );

      return handler(authenticatedRequest, context);
    } catch (error) {
      console.error('Enhanced auth middleware error:', error);

      // If it's a JWE error, return 401 with clear message
      if (
        error instanceof Error &&
        (error.message.includes('JWE') ||
          error.message.includes('jwt') ||
          error.message.includes('Invalid'))
      ) {
        return NextResponse.json(
          {
            error: 'invalid-session',
            message: 'Session expired or invalid. Please log in again.',
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: 'auth-error', message: 'Authentication failed' },
        { status: 500 }
      );
    }
  };
}
