// app/api/auth/otp/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongoConn } from '@/lib/db/mongodb';
import { checkUserExistsByEmail } from '@/domains/user/utils/mongo-user-utils';
import redisService from '@/lib/cache/redis-client';
import { SignJWT } from 'jose';

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

    // Code is valid, get user from database
    const { db } = await mongoConn();
    const user = await checkUserExistsByEmail(db, normalizedEmail);

    if (!user || !user._id) {
      await redisService.del(otpKey);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete OTP after successful verification
    await redisService.del(otpKey);

    // Check employment status - Terminated/Inactive users get limited access (PDF only)
    const employmentStatus = user.status || '';
    const isTerminatedOrInactive = employmentStatus === 'Terminated' || employmentStatus === 'Inactive';
    
    // Create OTP session in Redis (30 days)
    const sessionId = `otp_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const sessionData = {
      userId: user._id.toString(),
      email: user.emailAddress || normalizedEmail,
      name: user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.lastName || user.emailAddress || normalizedEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      picture: user.picture,
      loginMethod: 'otp',
      isLimitedAccess: isTerminatedOrInactive, // Limited access for Terminated/Inactive employees
      employmentStatus: employmentStatus,
      createdAt: new Date().toISOString(),
    };

    await redisService.set(`otp_session:${sessionId}`, sessionData, 30 * 24 * 60 * 60);

    // Determine redirect URL
    // Terminated/Inactive employees should only access PDF pages
    let redirectUrl = '/time-attendance';
    if (returnTo) {
      const decodedReturnTo = decodeURIComponent(returnTo);
      // If returnTo is a PDF route, allow it for limited access users
      if (decodedReturnTo.startsWith('/paycheck-stubs/') || decodedReturnTo.startsWith('/paycheck-stubs')) {
        redirectUrl = decodedReturnTo;
      } else if (!isTerminatedOrInactive) {
        // Full access users can go to any returnTo
        redirectUrl = decodedReturnTo;
      }
      // Limited access users trying to access non-PDF routes will be redirected to PDF page
    } else if (isTerminatedOrInactive) {
      // Terminated/Inactive employees default to paycheck stubs page
      redirectUrl = '/paycheck-stubs';
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
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Also set auth0.is.authenticated for compatibility with existing checks
    response.cookies.set('auth0.is.authenticated', 'true', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
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

