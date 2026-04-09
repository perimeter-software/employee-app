import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  declineEventCoverRequest,
  eventCoverErrorResponse,
} from '@/domains/event/services/event-cover-request-service';

export const dynamic = 'force-dynamic';

async function patchDeclineHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const raw = params.id;
    const id =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
    if (!id?.trim()) {
      return NextResponse.json(
        { error: 'missing-id', message: 'Event cover request id is required.' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const data = await declineEventCoverRequest(db, request.user, id.trim());
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return eventCoverErrorResponse(error);
  }
}

export const PATCH = withEnhancedAuthAPI(patchDeclineHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
