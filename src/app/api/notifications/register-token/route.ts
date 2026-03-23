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
  const userId = user._id ? String(user._id) : '';
  if (!userId) {
    return NextResponse.json(
      { success: false, message: 'No user ID in session' },
      { status: 401 }
    );
  }

  const { sub: userSub, email } = user;
  const sp1 = getSp1Client(userSub, email || '');

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
