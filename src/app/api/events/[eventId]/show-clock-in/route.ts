import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';

/**
 * POST /api/events/[eventId]/show-clock-in
 *
 * Body: { agent, createAgent, platform?, coordinates? }
 *
 * Proxies to the external sp1 API: POST /events/id/:eventId/applicant/:applicantId/showclockin
 *
 * Returns: { showClockIn, showClockOut, clockInButtonDisabled, clockOutButtonDisabled, showEarlyClockInWarning }
 */
async function showClockInHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;

    if (!eventId) {
      return NextResponse.json(
        { success: false, message: 'Invalid event ID' },
        { status: 400 }
      );
    }

    const user = request.user;
    const applicantId = user.applicantId ? String(user.applicantId) : '';
    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sub: userSub, email, tenant } = user;
    const sp1 = getSp1Client(userSub, email || '', tenant?.clientDomain || tenant?.url);

    const { data } = await sp1.post(
      `/events/id/${eventId}/applicant/${applicantId}/showclockin`,
      body
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Show Clock-In] Error:', error);
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

export const POST = withEnhancedAuthAPI(showClockInHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
