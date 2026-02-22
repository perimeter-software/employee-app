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
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
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
      await redisService.set(otpKey, {
        ...otpData,
        attempts: otpData.attempts + 1,
      }, 600);

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
      const isTerminatedOrInactive = employmentStatus === 'Terminated' || employmentStatus === 'Inactive';
      
      sessionData = {
        userId: user._id.toString(),
        applicantId: user.applicantId, // May be null
        email: user.emailAddress || normalizedEmail,
        name: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.firstName || user.lastName || user.emailAddress || normalizedEmail,
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
        redirectUrl = '/paycheck-stubs';
      } else if (returnTo) {
        const decoded = decodeURIComponent(returnTo);
        // Only allow relative paths to prevent open redirect
        if (decoded.startsWith('/') && !decoded.startsWith('//')) {
          redirectUrl = decoded;
        }
      }
    } else {
      // NEW: APPLICANT-ONLY FLOW
      const { findApplicantAndTenantsByEmail } = await import('@/domains/user/utils/mongo-user-utils');
      const applicantData = await findApplicantAndTenantsByEmail(normalizedEmail);

      if (!applicantData || applicantData.tenants.length === 0) {
        await redisService.del(otpKey);
        return NextResponse.json(
          { error: 'Account not found. Please contact your supervisor.' },
          { status: 404 }
        );
      }

      isApplicantOnly = true;
      
      sessionData = {
        userId: applicantData.applicantId, // Use applicantId as userId (applicant._id)
        applicantId: applicantData.applicantId, // Same as userId for applicants
        email: normalizedEmail,
        name: applicantData.applicantInfo.firstName && applicantData.applicantInfo.lastName
          ? `${applicantData.applicantInfo.firstName} ${applicantData.applicantInfo.lastName}`.trim()
          : applicantData.applicantInfo.firstName || applicantData.applicantInfo.lastName || normalizedEmail,
        firstName: applicantData.applicantInfo.firstName,
        lastName: applicantData.applicantInfo.lastName,
        loginMethod: 'otp',
        isLimitedAccess: true, // Applicants only get paycheck stub access
        isApplicantOnly: true, // Flag to indicate applicant-only session
        userType: 'applicant', // Indicates applicant-only
        status: applicantData.applicantInfo.status, // e.g., "Employee"
        employmentStatus: applicantData.applicantInfo.employmentStatus, // e.g., "Active"
        createdAt: new Date().toISOString(),
      };

      // Applicants always redirect to paycheck stubs
      redirectUrl = '/paycheck-stubs';
    }

    // Delete OTP after successful verification
    await redisService.del(otpKey);

    // Create OTP session in Redis (24 hours)
    const sessionId = `otp_session_${crypto.randomUUID()}`;
    await redisService.set(`otp_session:${sessionId}`, sessionData, 24 * 60 * 60);

    // Note: Tenant data caching is handled in /api/current-user for consistency
    // This ensures fresh cache on every page load, same as regular users

    // Log OTP login activity
    try {
      const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
      const { db } = await mongoConn();
      const agentName: string = sessionData.firstName && sessionData.lastName 
        ? `${sessionData.firstName} ${sessionData.lastName}`.trim()
        : (sessionData.firstName || sessionData.lastName || sessionData.email || normalizedEmail) as string;
      
      await logActivity(
        db,
        createActivityLogData(
          'OTP Login',
          `${agentName} logged in using OTP (Email: ${normalizedEmail})${isApplicantOnly ? ' [Applicant-Only]' : ''}`,
          {
            applicantId: sessionData.applicantId ? String(sessionData.applicantId) : undefined,
            userId: sessionData.userId ? String(sessionData.userId) : undefined,
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

