// app/api/auth/me/route.ts
// Custom /api/auth/me endpoint that supports both Auth0 and OTP sessions
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth0/nextjs-auth0';
import redisService from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // First, try to get Auth0 session
    const auth0Session = await getSession();
    
    if (auth0Session?.user) {
      // Return Auth0 user data (Auth0's default behavior)
      return NextResponse.json(auth0Session.user);
    }

    // If no Auth0 session, check for OTP session
    const otpSessionId = request.cookies.get('otp_session_id')?.value;

    if (!otpSessionId) {
      // No session found - return 204 (No Content) like Auth0 does
      return new NextResponse(null, { status: 204 });
    }

    // Get OTP session data from Redis (same shape as session.ts / otp verify)
    const otpSessionData = await redisService.get<{
      userId: string;
      applicantId?: string;
      email: string;
      name: string;
      firstName?: string;
      lastName?: string;
      picture?: string;
      loginMethod: string;
      isLimitedAccess?: boolean;
      isApplicantOnly?: boolean;
      userType?: string;
      employmentStatus?: string;
      status?: string;
      createdAt: string;
    }>(`otp_session:${otpSessionId}`);

    if (!otpSessionData) {
      // Session expired or invalid
      return new NextResponse(null, { status: 204 });
    }

    // Return OTP user data in Auth0-compatible format (aligned with session.ts return shape)
    return NextResponse.json({
      sub: otpSessionData.userId,
      email: otpSessionData.email,
      name: otpSessionData.name,
      firstName: otpSessionData.firstName,
      lastName: otpSessionData.lastName,
      picture: otpSessionData.picture,
      applicantId: otpSessionData.applicantId,
      loginMethod: otpSessionData.loginMethod,
      isLimitedAccess: otpSessionData.isLimitedAccess ?? false,
      isApplicantOnly: otpSessionData.isApplicantOnly ?? false,
      employmentStatus: otpSessionData.employmentStatus,
      status: otpSessionData.status,
      ...(otpSessionData.userType && { userType: otpSessionData.userType }),
    });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    // Return 204 on error (Auth0's default behavior)
    return new NextResponse(null, { status: 204 });
  }
}

