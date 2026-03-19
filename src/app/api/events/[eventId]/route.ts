import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

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
