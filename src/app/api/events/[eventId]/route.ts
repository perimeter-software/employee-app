import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
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
          eventName: 1,
          eventDate: 1,
          eventEndTime: 1,
          reportTimeTBD: 1,
          eventType: 1,
          eventUrl: 1,
          venueSlug: 1,
          venueName: 1,
          venueCity: 1,
          venueState: 1,
          address: 1,
          zip: 1,
          logoUrl: 1,
          timeZone: 1,
          description: 1,
          positions: 1,
          attachments: 1,
          positionsRequested: 1,
          numberOnRoster: 1,
          numberOnPremise: 1,
          makePublicAndSendNotification: 1,
          allowEarlyClockin: 1,
          waitListPercentage: 1,
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
