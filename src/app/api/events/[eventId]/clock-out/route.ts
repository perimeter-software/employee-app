import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';
import { logActivity, createActivityLogData } from '@/lib/services/activity-logger';

/**
 * POST /api/events/[eventId]/clock-out
 *
 * Body: { applicantId, agent, createAgent, timeOut, platform?, coordinates? }
 *
 * Mirrors the behaviour of eventClockOut in the legacy API:
 *  - Validates venue StaffingPool membership
 *  - Confirms the roster record has clocked in and has not yet clocked out
 *  - Handles overnight shifts (timeOut < timeIn → add 1 day)
 *  - Updates the full roster record entry via arrayFilters
 */
async function clockOutHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;
    const body = await request.json();
    const { applicantId, agent, createAgent, timeOut, platform, coordinates } = body;

    if (!eventId || !applicantId) {
      return NextResponse.json(
        { error: 'missing-parameters', message: 'eventId and applicantId are required' },
        { status: 400 }
      );
    }

    if (!agent || !createAgent || !timeOut) {
      return NextResponse.json(
        { error: 'invalid-payload', message: 'agent, createAgent and timeOut are required' },
        { status: 400 }
      );
    }

    let eventObjectId: ObjectId;
    let applicantObjectId: ObjectId;
    try {
      eventObjectId = new ObjectId(eventId);
      applicantObjectId = new ObjectId(applicantId);
    } catch {
      return NextResponse.json(
        { error: 'invalid-parameters', message: 'Invalid eventId or applicantId format' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Fetch event
    const event = await db.collection('events').findOne({ _id: eventObjectId });
    if (!event) {
      return NextResponse.json(
        { error: 'not-found', message: 'Event not found' },
        { status: 400 }
      );
    }
    if (!event.applicants?.length) {
      return NextResponse.json(
        { error: 'no-applicants', message: 'Event has no applicants' },
        { status: 400 }
      );
    }

    // Fetch applicant
    const applicant = await db
      .collection('applicants')
      .findOne({ _id: applicantObjectId }, { projection: { status: 1, venues: 1, firstName: 1, lastName: 1 } });
    if (!applicant) {
      return NextResponse.json(
        { error: 'not-found', message: 'Applicant not found' },
        { status: 400 }
      );
    }

    // Validate venue StaffingPool membership
    type VenueEntry = { venueSlug?: string; status?: string };
    if (
      !(applicant.venues as VenueEntry[] | undefined)?.some(
        (v) => v.venueSlug === event.venueSlug && v.status === 'StaffingPool'
      )
    ) {
      return NextResponse.json(
        {
          error: 'not-in-staffing-pool',
          message: 'Applicant is not part of the StaffingPool for the specified venue',
        },
        { status: 400 }
      );
    }

    // Find roster record
    const rosterRecord = (event.applicants as Array<Record<string, unknown>>).find(
      (a) => a.id?.toString() === applicantId && a.status === 'Roster'
    );
    if (!rosterRecord) {
      return NextResponse.json(
        { error: 'not-on-roster', message: 'Applicant is not on Roster for this event' },
        { status: 400 }
      );
    }

    // Guard: must have clocked in first
    if (!rosterRecord.timeIn) {
      return NextResponse.json(
        {
          error: 'not-clocked-in',
          message: 'Employee has not clocked in and therefore cannot clock out',
        },
        { status: 400 }
      );
    }

    // Guard: already clocked out
    if (rosterRecord.timeOut) {
      return NextResponse.json(
        {
          error: 'already-clocked-out',
          message: `Employee has already clocked out at ${rosterRecord.timeOut}`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    let clockOutTime = now;

    // Overnight shift: if timeOut is before timeIn, assume next day
    const timeInDate = new Date(rosterRecord.timeIn as string);
    if (clockOutTime < timeInDate) {
      clockOutTime = new Date(clockOutTime.getTime() + 24 * 60 * 60 * 1000);
    }

    // Build the updated roster record (full replacement, matching legacy API)
    const updatedRecord = {
      ...rosterRecord,
      timeOut: clockOutTime.toISOString(),
      dateModified: now.toISOString(),
      ...(platform && { platform }),
      ...(coordinates && { clockOutCoordinates: coordinates }),
    };

    await db.collection('events').updateOne(
      { _id: eventObjectId },
      {
        $set: {
          'applicants.$[elem]': updatedRecord,
          modifiedDate: now,
        },
      },
      { arrayFilters: [{ 'elem.id': applicantId }] }
    );

    await logActivity(
      db,
      createActivityLogData(
        'Event Clock Out',
        `${applicant.firstName} ${applicant.lastName} clocked out at ${clockOutTime.toISOString()} for ${event.eventUrl ?? eventId}`,
        {
          applicantId,
          userId: createAgent,
          agent,
          eventId,
          details: { rosterRecord: updatedRecord },
        }
      )
    );

    return NextResponse.json(
      { success: true, message: 'Clocked out successfully', data: { rosterRecord: updatedRecord } },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Event Clock-Out API] Error:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(clockOutHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
