// app/api/auth/otp/session/route.ts
// Get OTP session user data (similar to Auth0's /api/auth/me)
import { NextRequest, NextResponse } from 'next/server';
import redisService from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('otp_session_id')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const sessionData = await redisService.get<{
      userId: string;
      email: string;
      name: string;
      firstName?: string;
      lastName?: string;
      picture?: string;
      loginMethod: string;
      createdAt: string;
    }>(`otp_session:${sessionId}`);

    if (!sessionData) {
      return NextResponse.json(
        { error: 'Session expired' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      sub: sessionData.userId,
      email: sessionData.email,
      name: sessionData.name,
      firstName: sessionData.firstName,
      lastName: sessionData.lastName,
      picture: sessionData.picture,
      loginMethod: sessionData.loginMethod,
    });
  } catch (error) {
    console.error('Error getting OTP session:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

