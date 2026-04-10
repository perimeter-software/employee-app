import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  eventCoverErrorResponse,
  listEventCoverRequests,
} from '@/domains/event/services/event-cover-request-service';

export const dynamic = 'force-dynamic';

async function getHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get('limit');
    const limit =
      limitRaw != null && limitRaw !== ''
        ? Number.parseInt(limitRaw, 10)
        : undefined;
    const status = searchParams.get('status');
    const scopeRaw = searchParams.get('scope')?.trim();
    const scope = scopeRaw === 'incoming' ? 'incoming' : undefined;

    const { db } = await getTenantAwareConnection(request);
    const data = await listEventCoverRequests(db, request.user, {
      limit: Number.isFinite(limit) ? limit : undefined,
      status: status?.trim() || null,
      ...(scope ? { scope } : {}),
    });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return eventCoverErrorResponse(error);
  }
}

export const GET = withEnhancedAuthAPI(getHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
