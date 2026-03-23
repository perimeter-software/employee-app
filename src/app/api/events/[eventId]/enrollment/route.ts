import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getSp1Client } from '@/lib/sp1Client';

// ─── GET — check enrollment status ───────────────────────────────────────────

async function getEnrollmentHandler(
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

    const sessionId = request.cookies.get('session_id')?.value;
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated' },
        { status: 401 }
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

    // Resolve the eventUrl needed for the sp1-api URL pattern
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

    const { sub: userSub, email } = request.user || {};

    const eventUrl = event.eventUrl as string;
    const sp1 = getSp1Client(userSub, email || '');
    const { data } = await sp1.get(
      `/events/url/${eventUrl}/enroll/${applicantId}`
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Enrollment GET] Error:', error);
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

// ─── PUT — perform enrollment action ─────────────────────────────────────────

async function putEnrollmentHandler(
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

    const body = await request.json();

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

    const { sub: userSub, email } = user;
    const eventUrl = event.eventUrl as string;
    const sp1 = getSp1Client(userSub, email || '');
    const { data } = await sp1.put(
      `/events/url/${eventUrl}/enroll/${applicantId}`,
      body
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Enrollment PUT] Error:', error);
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

export const GET = withEnhancedAuthAPI(getEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

export const PUT = withEnhancedAuthAPI(putEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
