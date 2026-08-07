import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';

// ─── PUT — send a call-off note to the event manager ─────────────────────────
//
// Ported from the v3 employee app (gig-react-cli2 `sendMessageUnder48Hrs`).
// When the enrollment check refuses self-removal because the event is < 48h
// away, this is the path that lets the employee leave a call-off note: the BE
// flags the roster entry ("Tried to call-off < 48 hours") and files an
// "Event Call Off" note on the applicant record.
//
// Proxies to: PUT /events/url/:eventUrl/enroll/:applicantId/message

type Body = { message?: string; agent?: string; createAgent?: string };

async function putEnrollMessageHandler(
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
    const applicantId = user.applicantId ? String(user.applicantId) : '';
    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    const { message, agent, createAgent } = (await request.json()) as Body;
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed) {
      return NextResponse.json(
        { success: false, message: 'A message is required.' },
        { status: 400 }
      );
    }

    // Resolve eventUrl from DB (needed for the sp1-api URL pattern)
    const { db } = await getTenantAwareConnection(request);
    const event = await db
      .collection('events')
      .findOne({ _id: new ObjectId(eventId) }, { projection: { eventUrl: 1 } });

    if (!event) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    // `createAgent` is required by the BE and drives the note's userId; fall
    // back to the session user so a thin client payload still works.
    const resolvedCreateAgent =
      createAgent ||
      (user._id ? String(user._id) : '') ||
      (user.userId ? String(user.userId) : '') ||
      applicantId;
    const resolvedAgent =
      agent ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      '';

    const { sub: userSub, email, tenant } = user;
    const eventUrl = event.eventUrl as string;
    const sp1 = getSp1Client(
      userSub,
      email || '',
      tenant?.clientDomain || tenant?.url
    );
    const { data } = await sp1.put(
      `/events/url/${eventUrl}/enroll/${applicantId}/message`,
      {
        message: trimmed.slice(0, 5000),
        agent: resolvedAgent,
        createAgent: resolvedCreateAgent,
      }
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Enroll message PUT] Error:', error);
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

export const PUT = withEnhancedAuthAPI(putEnrollMessageHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
