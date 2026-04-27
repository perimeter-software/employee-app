import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import {
  EVENT_CALL_OFF_DOC_FILTER,
  EVENT_COVER_DOC_FILTER,
} from '@/domains/event/services/event-cover-constants';

async function getEventDetailHandler(
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

    const { db } = await getTenantAwareConnection(request);
    const user = request.user;

    const raw = await db.collection('events').findOne(
      { _id: new ObjectId(eventId) },
      {
        projection: {
          _id: 1,
          eventId: 1,
          eventName: 1,
          eventDate: 1,
          eventEndTime: 1,
          reportTimeTBD: 1,
          eventType: 1,
          status: 1,
          eventUrl: 1,
          venueSlug: 1,
          venueName: 1,
          venueCity: 1,
          venueState: 1,
          address: 1,
          zip: 1,
          logoUrl: 1,
          eventImage: 1,
          timeZone: 1,
          description: 1,
          tags: 1,
          positions: 1,
          attachments: 1,
          notes: 1,
          positionsRequested: 1,
          billRate: 1,
          payRate: 1,
          eventManager: 1,
          payrollPurchaseOrder: 1,
          makePublicAndSendNotification: 1,
          sendConfirmationToSignUps: 1,
          allowEarlyClockin: 1,
          allowPartners: 1,
          waitListPercentage: 1,
          notifyCallOff: 1,
          reminder24Hour: 1,
          reminder48Hour: 1,
          enableClockInReminders: 1,
          geoFence: 1,
          googleMap: 1,
          interviewLink: 1,
          secondaryLocation: 1,
          numberOnRoster: 1,
          numberOnPremise: 1,
          applicants: 1,
          jobSlug: 1,
        },
      }
    );

    if (!raw) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    const event = convertToJSON(raw) as Record<string, unknown>;

    // Enrich with rosterStatus for the requesting user
    const applicantId = user.applicantId ? String(user.applicantId) : '';
    if (applicantId) {
      const applicants = (event.applicants as { id: string; status: string }[]) ?? [];
      const found = applicants.find((a) => a.id === applicantId);
      event.rosterStatus = found ? found.status : 'Not Roster';

      const eventUrlStr = String(event.eventUrl || '').trim();
      if (eventUrlStr) {
        const [pendingCallOff, pendingCover, incomingCover] =
          await Promise.all([
            db.collection('swap-requests').findOne(
              {
                ...EVENT_CALL_OFF_DOC_FILTER,
                eventUrl: eventUrlStr,
                fromEmployeeId: applicantId,
              },
              { projection: { _id: 1 } }
            ),
            db.collection('swap-requests').findOne(
              {
                ...EVENT_COVER_DOC_FILTER,
                eventUrl: eventUrlStr,
                fromEmployeeId: applicantId,
                status: { $in: ['pending_match', 'pending_approval'] },
              },
              { projection: { _id: 1, toEmployeeId: 1 } }
            ),
            db.collection('swap-requests').findOne(
              {
                ...EVENT_COVER_DOC_FILTER,
                eventUrl: eventUrlStr,
                toEmployeeId: applicantId,
                status: 'pending_match',
              },
              { projection: { _id: 1 } }
            ),
          ]);
        event.pendingCallOffRequestId = pendingCallOff
          ? String(pendingCallOff._id)
          : null;
        event.incomingCoverRequestId = incomingCover
          ? String(incomingCover._id)
          : null;
        if (pendingCover?.toEmployeeId) {
          event.pendingCoverRequestId = String(pendingCover._id);
          const toId = String(pendingCover.toEmployeeId);
          const peerDoc = ObjectId.isValid(toId)
            ? await db.collection('applicants').findOne(
                { _id: new ObjectId(toId) },
                { projection: { email: 1, emailAddress: 1 } }
              )
            : null;
          const pem = peerDoc?.email ?? peerDoc?.emailAddress;
          event.pendingCoverPeerEmail =
            typeof pem === 'string' && pem.trim() ? pem.trim() : null;
        } else {
          event.pendingCoverRequestId = null;
          event.pendingCoverPeerEmail = null;
        }
      } else {
        event.pendingCallOffRequestId = null;
        event.pendingCoverRequestId = null;
        event.pendingCoverPeerEmail = null;
        event.incomingCoverRequestId = null;
      }
    }

    // Strip full applicants array from response (sensitive data)
    delete event.applicants;

    return NextResponse.json({ success: true, data: event }, { status: 200 });
  } catch (error) {
    console.error('[Event Detail API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEventDetailHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

// ─── PUT (update event) ───────────────────────────────────────────────────────

async function updateEventHandler(
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
    const { db } = await getTenantAwareConnection(request);

    // For Client users: verify they have access to this event's venue
    if (user.userType === 'Client') {
      const eventDoc = await db
        .collection('events')
        .findOne({ _id: new ObjectId(eventId) }, { projection: { venueSlug: 1 } });

      if (!eventDoc) {
        return NextResponse.json(
          { success: false, message: 'Event not found' },
          { status: 404 }
        );
      }

      const userId = user.userId ?? user._id;
      let clientOrgSlugs: string[] = [];
      if (userId && ObjectId.isValid(String(userId))) {
        const clientDoc = await db
          .collection('users')
          .findOne(
            { _id: new ObjectId(String(userId)) },
            { projection: { clientOrgs: 1 } }
          );
        const clientOrgs =
          (clientDoc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
        clientOrgSlugs = clientOrgs.map((org) => org.slug ?? '').filter(Boolean);
      }

      if (!clientOrgSlugs.includes(String(eventDoc.venueSlug ?? ''))) {
        return NextResponse.json(
          { success: false, message: 'Access denied to this event.' },
          { status: 403 }
        );
      }
    }

    if (!user?.sub || !user?.email) {
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    const res = await sp1.put(`/events/${eventId}`, body);
    return NextResponse.json({ success: true, data: res.data }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[Event Update API] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const PUT = withEnhancedAuthAPI(updateEventHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
