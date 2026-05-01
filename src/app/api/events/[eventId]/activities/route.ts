import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function getEventActivitiesHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;

    if (!eventId || !ObjectId.isValid(eventId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid event ID' },
        { status: 400 }
      );
    }

    const user = request.user;
    if (!user?.sub || !user?.email) {
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const page = url.searchParams.get('page') ?? '1';
    const limit = url.searchParams.get('limit') ?? '25';

    const { tenant } = user;
    const sp1 = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url
    );

    const res = await sp1.get('/activities', {
      params: {
        filter: `eventId:${eventId}`,
        sort: 'activityDate:desc',
        limit,
        page,
      },
    });

    return NextResponse.json(
      { success: true, data: res.data },
      { status: 200 }
    );
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    console.error('[Event Activities API] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEventActivitiesHandler, {
  requireDatabaseUser: false,
  requireTenant: true,
});
