import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  acceptEventCoverRequest,
  eventCoverErrorResponse,
} from '@/domains/event/services/event-cover-request-service';

export const dynamic = 'force-dynamic';

async function patchAcceptHandler(
  req: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    if (!id) {
      return NextResponse.json(
        { error: 'missing-id', message: 'Event cover request id is required.' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(req);
    const data = await acceptEventCoverRequest(db, req.user, id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return eventCoverErrorResponse(error);
  }
}

export const PATCH = withEnhancedAuthAPI(patchAcceptHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
