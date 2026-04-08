import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  rejectEventCoverRequest,
  eventCoverErrorResponse,
} from '@/domains/event/services/event-cover-request-service';

export const dynamic = 'force-dynamic';

type RejectBody = {
  reason?: string;
};

async function patchRejectHandler(
  request: AuthenticatedRequest,
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

    const body = (await request.json().catch(() => ({}))) as RejectBody;
    const reason =
      typeof body.reason === 'string' ? body.reason : undefined;

    const { db } = await getTenantAwareConnection(request);
    const data = await rejectEventCoverRequest(db, request.user, id, reason);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return eventCoverErrorResponse(error);
  }
}

export const PATCH = withEnhancedAuthAPI(patchRejectHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
