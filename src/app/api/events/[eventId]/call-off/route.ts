import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { createEventCallOffRequest } from '@/domains/event/services/event-call-off-service';
import { eventCoverErrorResponse } from '@/domains/event/services/event-cover-request-service';

export const dynamic = 'force-dynamic';

type Body = { notes?: string };

async function postHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const raw = params.eventId;
    const eventId =
      typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
    if (!eventId?.trim()) {
      return NextResponse.json(
        { error: 'missing-id', message: 'Event id is required.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    const { db } = await getTenantAwareConnection(request);
    const data = await createEventCallOffRequest(
      db,
      request.user,
      eventId.trim(),
      notes
    );
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return eventCoverErrorResponse(error);
  }
}

export const POST = withEnhancedAuthAPI(postHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
