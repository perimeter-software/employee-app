// app/api/auth/otp/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoConn } from '@/lib/db/mongodb';
import { checkUserExistsByEmail } from '@/domains/user/utils/mongo-user-utils';
import redisService from '@/lib/cache/redis-client';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, returnTo } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'OTP code is required' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Get OTP from Redis
    const otpKey = `otp:${normalizedEmail}`;
    const otpData = await redisService.get<{
      code: string;
      email: string;
      createdAt: string;
      attempts: number;
      isApplicantOnly?: boolean;
    }>(otpKey);

    if (!otpData) {
      return NextResponse.json(
        { error: 'Invalid or expired code. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check attempts
    if (otpData.attempts >= MAX_ATTEMPTS) {
      await redisService.del(otpKey);
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    // Verify code
    if (otpData.code !== code) {
      // Increment attempts
      await redisService.set(
        otpKey,
        {
          ...otpData,
          attempts: otpData.attempts + 1,
        },
        600
      );

      return NextResponse.json(
        { error: 'Invalid code. Please try again.' },
        { status: 400 }
      );
    }

    // Code is valid, check if user or applicant
    const { db } = await mongoConn();
    const user = await checkUserExistsByEmail(db, normalizedEmail);

    let sessionData;
    let redirectUrl = '/time-attendance';
    let isApplicantOnly = false;

    if (user && user._id) {
      // EXISTING USER FLOW
      const employmentStatus = user.status || '';
      const isTerminatedOrInactive =
        employmentStatus === 'Terminated' || employmentStatus === 'Inactive';

      sessionData = {
        userId: user._id.toString(),
        applicantId: user.applicantId, // May be null
        email: user.emailAddress || normalizedEmail,
        name:
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName ||
              user.lastName ||
              user.emailAddress ||
              normalizedEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        picture: user.picture,
        loginMethod: 'otp',
        isLimitedAccess: isTerminatedOrInactive,
        employmentStatus: employmentStatus,
        userType: 'user', // Indicates full user
        createdAt: new Date().toISOString(),
      };

      if (isTerminatedOrInactive) {
        redirectUrl = '/payroll';
      } else if (returnTo) {
        const decoded = decodeURIComponent(returnTo);
        // Only allow relative paths to prevent open redirect
        if (decoded.startsWith('/') && !decoded.startsWith('//')) {
          redirectUrl = decoded;
        }
      }
    } else {
      // APPLICANT-ONLY FLOW
      const { findApplicantAndTenantsByEmail } = await import(
        '@/domains/user/utils/mongo-user-utils'
      );
      const applicantData =
        await findApplicantAndTenantsByEmail(normalizedEmail);

      if (!applicantData || applicantData.tenants.length === 0) {
        await redisService.del(otpKey);
        return NextResponse.json(
          { error: 'Account not found. Please contact your supervisor.' },
          { status: 404 }
        );
      }

      const { status, applicantStatus, acknowledgedDate } =
        applicantData.applicantInfo;

      // Block login if the applicant record status is not a recognized value
      if (status !== 'Employee' && status !== 'Applicant') {
        await redisService.del(otpKey);
        return NextResponse.json(
          {
            error:
              'Your account is not currently active. Please contact your supervisor.',
          },
          { status: 403 }
        );
      }

      // For "Applicant" status, also validate applicantStatus is a known pipeline stage
      if (status === 'Applicant') {
        const ALL_APPLICANT_STAGES = ['New', 'ATC', 'Screened', 'Pre-Hire'];
        if (
          !applicantStatus ||
          !ALL_APPLICANT_STAGES.includes(applicantStatus)
        ) {
          await redisService.del(otpKey);
          return NextResponse.json(
            {
              error:
                'Your application is not in an eligible stage. Please contact your supervisor.',
            },
            { status: 403 }
          );
        }
      }

      isApplicantOnly = true;

      // Cache tenant data immediately so withEnhancedAuthAPI can resolve tenant on
      // the very first authenticated request, without waiting for /api/current-user.
      if (applicantData.tenants.length > 0) {
        await redisService.setTenantData(
          normalizedEmail,
          {
            tenant: applicantData.tenants[0],
            availableTenants: applicantData.tenants.slice(1),
            isApplicantOnly: true,
          },
          24 * 60 * 60
        );
      }

      // Determine the redirect URL.
      // For "Employee" status applicants: existing payroll flow.
      // For "Applicant" status: determine sub-type using the default minStageToOnboarding
      // ("Screened"). The client-side protection hook will enforce the actual company setting.
      if (status === 'Applicant') {
        const DEFAULT_MIN_STAGE = 'Screened';
        const ALL_STAGES = ['New', 'ATC', 'Screened', 'Pre-Hire'];
        const minStageIndex = ALL_STAGES.indexOf(DEFAULT_MIN_STAGE);
        const stageIndex = ALL_STAGES.indexOf(applicantStatus ?? '');
        const isAllowedForOnboarding =
          stageIndex >= minStageIndex && stageIndex !== -1;

        if (isAllowedForOnboarding && !acknowledgedDate) {
          // Ready for onboarding, hasn't completed it yet
          redirectUrl = '/onboarding';
        } else {
          // Pre-onboarding stages OR post-onboarding (acknowledged) → applicant overview
          redirectUrl = '/applicant/overview';
        }
      } else {
        // status === 'Employee': payroll/paystub access only
        redirectUrl = '/payroll';
      }

      sessionData = {
        userId: applicantData.applicantId,
        applicantId: applicantData.applicantId,
        email: normalizedEmail,
        name:
          applicantData.applicantInfo.firstName &&
          applicantData.applicantInfo.lastName
            ? `${applicantData.applicantInfo.firstName} ${applicantData.applicantInfo.lastName}`.trim()
            : applicantData.applicantInfo.firstName ||
              applicantData.applicantInfo.lastName ||
              normalizedEmail,
        firstName: applicantData.applicantInfo.firstName,
        lastName: applicantData.applicantInfo.lastName,
        loginMethod: 'otp',
        isLimitedAccess: true,
        isApplicantOnly: true,
        userType: 'applicant',
        status, // "Employee" | "Applicant"
        employmentStatus: applicantData.applicantInfo.employmentStatus,
        applicantStatus: applicantData.applicantInfo.applicantStatus,
        acknowledgedDate: applicantData.applicantInfo.acknowledgedDate,
        // Persist the resolved tenant so every authenticated request can read it
        // directly from the session without a second Redis lookup or DB scan.
        tenant: applicantData.tenants[0] ?? null,
        availableTenants: applicantData.tenants.slice(1),
        createdAt: new Date().toISOString(),
      };
    }

    // Delete OTP after successful verification
    await redisService.del(otpKey);

    // Create OTP session in Redis (24 hours)
    const sessionId = `otp_session_${crypto.randomUUID()}`;
    await redisService.set(
      `otp_session:${sessionId}`,
      sessionData,
      24 * 60 * 60
    );

    // Note: Tenant data caching is handled in /api/current-user for consistency
    // This ensures fresh cache on every page load, same as regular users

    // Log OTP login activity
    try {
      const { logActivity, createActivityLogData } = await import(
        '@/lib/services/activity-logger'
      );
      const tenantData = await redisService.getTenantData(normalizedEmail);
      const tenantDbName = tenantData?.tenant?.dbName;
      if (!tenantDbName) {
        console.warn(
          `Skipping OTP login activity log: tenant dbName unavailable for ${normalizedEmail}`
        );
      } else {
        const { db } = await mongoConn(tenantDbName);
        const { resolveActivityIdentityByEmail } = await import(
          '@/lib/services/activity-identity'
        );
        const resolvedIdentity = await resolveActivityIdentityByEmail(
          db,
          normalizedEmail
        );
        const userId =
          resolvedIdentity.userId ||
          (sessionData.userId ? String(sessionData.userId) : undefined);
        const applicantId =
          resolvedIdentity.applicantId ||
          (sessionData.applicantId
            ? String(sessionData.applicantId)
            : undefined);
        if (!userId || !applicantId) {
          console.warn(
            `Skipping OTP login activity log: unresolved DB IDs for ${normalizedEmail}`
          );
        } else {
          const agentName: string =
            sessionData.firstName && sessionData.lastName
              ? `${sessionData.firstName} ${sessionData.lastName}`.trim()
              : ((sessionData.firstName ||
                  sessionData.lastName ||
                  sessionData.email ||
                  normalizedEmail) as string);

          await logActivity(
            db,
            createActivityLogData(
              'OTP Login',
              `${agentName} logged in using OTP (Email: ${normalizedEmail})${isApplicantOnly ? ' [Applicant-Only]' : ''}`,
              {
                applicantId,
                userId,
                agent: agentName,
                email: normalizedEmail,
                details: {
                  loginMethod: 'OTP',
                  email: normalizedEmail,
                  employmentStatus: sessionData.employmentStatus,
                  isLimitedAccess: sessionData.isLimitedAccess,
                  isApplicantOnly: isApplicantOnly,
                },
              }
            )
          );
        }
      }
    } catch (error) {
      // Don't fail login if logging fails
      console.error('Error logging OTP login activity:', error);
    }

    // Return JSON response instead of redirect (fetch doesn't follow redirects for POST)
    const response = NextResponse.json({
      success: true,
      redirectUrl,
      message: 'OTP verified successfully',
    });

    // Set OTP session cookie
    response.cookies.set('otp_session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    // Also set auth0.is.authenticated for compatibility with existing checks
    response.cookies.set('auth0.is.authenticated', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
