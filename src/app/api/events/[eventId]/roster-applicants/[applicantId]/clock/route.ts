import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { canManageRoster } from '@/domains/event/utils/roster-access';
import { getEventRosterEntries } from '@/domains/event/utils/event-roster';

/**
 * PUT /api/events/[eventId]/roster-applicants/[applicantId]/clock
 * Body: { field: 'timeIn' | 'timeOut'; clear?: boolean }
 *
 * Roster-manager clock in/out of another applicant. Proxies the SAME sp1 endpoint the
 * legacy stadium-people app used (`updateEventRoster` → PUT /events/id/{id}/roster) with
 * the full updated roster record, so the outbound request to sp1 is identical. The record
 * is rebuilt server-side from the event doc (never trusted from the client).
 *
 * Distinct from the employee self-clock routes (/clock-in, /clock-out), which write Mongo
 * directly. This one intentionally proxies sp1, matching the legacy admin roster behavior.
 */
async function clockRosterApplicantHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as
      | { eventId: string; applicantId: string }
      | undefined;
    const eventId = params?.eventId;
    const applicantId = params?.applicantId;

    if (!eventId || !ObjectId.isValid(eventId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid event ID' },
        { status: 400 }
      );
    }
    if (!applicantId || !ObjectId.isValid(applicantId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant ID' },
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

    const body = (await request.json()) as {
      field?: 'timeIn' | 'timeOut';
      clear?: boolean;
    };
    const field = body.field;
    if (field !== 'timeIn' && field !== 'timeOut') {
      return NextResponse.json(
        { success: false, message: "field must be 'timeIn' or 'timeOut'" },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const eventDoc = await db
      .collection('events')
      .findOne({ _id: new ObjectId(eventId) }, { projection: { venueSlug: 1 } });

    if (!eventDoc) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    // Only roster managers may clock others in/out.
    if (!(await canManageRoster(db, user, String(eventDoc.venueSlug ?? '')))) {
      return NextResponse.json(
        { success: false, message: 'Access denied.' },
        { status: 403 }
      );
    }

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    // Roster entries live in `eventroster`, not embedded on the event doc. Entries are
    // returned already stripped of `_id`/`eventId`, so the object we send back to
    // PUT /events/id/{id}/roster matches the legacy embedded-array shape exactly.
    const rosterRecords = await getEventRosterEntries(db, eventId);
    const record = rosterRecords.find((a) => String(a.id) === applicantId);

    if (!record) {
      return NextResponse.json(
        { success: false, message: 'Applicant is not on this roster' },
        { status: 404 }
      );
    }

    // Build the full updated roster record — matches legacy clockInOut, which sent the
    // whole roster object to PUT /events/id/{id}/roster with the toggled timestamp.
    const newRoster = {
      ...record,
      [field]: body.clear ? null : new Date().toISOString(),
    };

    const { data } = await sp1.put(`/events/id/${eventId}/roster`, newRoster);

    return NextResponse.json(data ?? { success: true }, { status: 200 });
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    console.error('[Roster Clock] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const PUT = withEnhancedAuthAPI(clockRosterApplicantHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
