import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function registerTokenHandler(request: AuthenticatedRequest) {
  const { token } = await request.json();

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  const user = request.user;
  let userId = user._id ? String(user._id) : '';

  // For applicant-only OTP sessions, withEnhancedAuthAPI does not populate
  // user._id. Attempt to find the user record by email — an applicant may
  // also have a user account and should still receive push notifications.
  if (!userId && user.email) {
    try {
      const { getTenantAwareConnection } = await import('@/lib/db');
      const { checkUserExistsByEmail } = await import('@/domains/user/utils');
      const { db } = await getTenantAwareConnection(request);
      const dbUser = await checkUserExistsByEmail(db, user.email);
      if (dbUser?._id) {
        userId = String(dbUser._id);
      }
    } catch {
      // DB lookup failed — fall through to no-op below
    }
  }

  // Pure applicant (no user record): push notifications are user-only.
  // Return gracefully so the client doesn't treat this as an error.
  if (!userId) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const { sub: userSub, email, tenant } = user;
  const sp1 = getSp1Client(userSub, email || '', tenant?.clientDomain || tenant?.url);

  try {
    const { data } = await sp1.put(`/users/id/${userId}`, {
      platform: 'web',
      userDeviceToken: token,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[register-token] Error:', error);
    const axiosError = error as {
      response?: { status?: number; data?: unknown };
    };
    const status = axiosError.response?.status ?? 500;
    return NextResponse.json(
      axiosError.response?.data ?? {
        success: false,
        message: 'Internal server error',
      },
      { status }
    );
  }
}

export const POST = withEnhancedAuthAPI(registerTokenHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
