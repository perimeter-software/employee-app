// app/api/auth/otp/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoConn } from '@/lib/db/mongodb';
import {
  checkUserExistsByEmail,
  findUserAndTenantsByEmail,
} from '@/domains/user/utils/mongo-user-utils';
import redisService from '@/lib/cache/redis-client';
import { buildApplicantSessionData } from '@/lib/auth/applicant-session';
import { createTenantSelectionTicket } from '@/lib/auth/tenant-selection-ticket';
import { logOtpLoginActivity } from '@/lib/auth/otp-login-activity';
import { normalizeReturnTo } from '@/lib/auth/return-to';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // `tenantDomain` is an optional hint (e.g. a login link that came from a
    // specific tenant's apply page). It is validated against the applicant's own
    // tenants before being honored — never trusted as-is.
    const { email, code, returnTo, tenantDomain } = body;

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

    // Code is valid, check if user or applicant.
    // Employees are resolved through usermaster (the authoritative membership
    // list), not by looking in one hardcoded database — otherwise an employee of
    // any non-default tenant is invisible here and falls through to the
    // applicant flow, ending up with an applicant-only session.
    const resolvedUser = await findUserAndTenantsByEmail(normalizedEmail);

    // Legacy fallback: usermaster can't always resolve a membership to a tenant
    // (stale url, missing tenant doc). Check the default database exactly as
    // this route used to, so nobody who could sign in before now can't.
    const user =
      resolvedUser?.user ??
      (await checkUserExistsByEmail(
        (await mongoConn()).db,
        normalizedEmail
      ));

    let sessionData;
    let redirectUrl = '/time';
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

      // Seed the tenant cache the same way the applicant flow does, so the very
      // first authenticated request (and the activity log below) resolves the
      // tenant this login actually landed on. /api/current-user refreshes it.
      if (resolvedUser) {
        await redisService.setTenantData(
          normalizedEmail,
          {
            tenant: resolvedUser.tenant,
            availableTenants: resolvedUser.tenants,
            isApplicantOnly: false,
          },
          24 * 60 * 60
        );
      }

      if (isTerminatedOrInactive) {
        redirectUrl = '/payroll';
      } else {
        // Relative paths only (open-redirect guard), and unwrapped if the
        // value arrived still percent-encoded.
        const safeReturnTo = normalizeReturnTo(returnTo);
        if (safeReturnTo) {
          redirectUrl = safeReturnTo;
        }
      }
    } else {
      // APPLICANT-ONLY FLOW
      // Gating + session shape are shared with the handoff-consume route so the
      // two entry points can never drift. A safe relative `returnTo` deep-links
      // "Applicant"-status users (e.g. /applicant/jobs?run=aiscreening).
      const safeReturnTo = normalizeReturnTo(returnTo) ?? undefined;
      const result = await buildApplicantSessionData(
        normalizedEmail,
        safeReturnTo,
        typeof tenantDomain === 'string' ? tenantDomain : undefined
      );

      // The email belongs to more than one eligible tenant. The code has been
      // verified, so burn it and hand back a short-lived ticket the client
      // redeems once the applicant picks — see /api/auth/otp/select-tenant.
      if (result.ok === 'needs-tenant-selection') {
        await redisService.del(otpKey);
        const ticket = await createTenantSelectionTicket(
          normalizedEmail,
          result.tenants.map((t) => t.clientDomain),
          safeReturnTo
        );
        return NextResponse.json({
          success: false,
          needsTenantSelection: true,
          ticket,
          tenants: result.tenants,
        });
      }

      if (!result.ok) {
        await redisService.del(otpKey);
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      isApplicantOnly = true;
      sessionData = result.sessionData;
      redirectUrl = result.redirectUrl;
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

    // Log OTP login activity (best-effort; shared with the tenant-selection route)
    await logOtpLoginActivity(normalizedEmail, sessionData, isApplicantOnly);

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
