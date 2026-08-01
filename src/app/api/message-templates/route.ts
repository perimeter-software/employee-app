import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function getMessageTemplatesHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (!user?.sub || !user?.email) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    const res = await sp1.get('/control/emailTemplates', {
      params: { fetchAll: true, sort: 'name:asc' },
    });

    const backendData = res.data as { data?: unknown[] };
    const data = backendData?.data ?? [];

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching message templates:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getMessageTemplatesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
