import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';
import {
  logActivity,
  createActivityLogData,
} from '@/lib/services/activity-logger';

/**
 * POST /api/events/[eventId]/clock-in
 *
 * Body: { applicantId, agent, createAgent, timeIn, platform?, coordinates? }
 *
 * Mirrors the behaviour of processEventClockIn in the legacy API:
 *  - Validates venue StaffingPool membership (skipped for Member applicants)
 *  - Confirms the roster record exists and has not yet clocked in
 *  - Clock-in time = now  if now is between reportTime and eventEndTime,
 *                  else reportTime (scheduled time)
 *  - Updates the full roster record entry via arrayFilters
 */
async function clockInHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;
    const body = await request.json();
    const { applicantId, agent, createAgent, timeIn, platform, coordinates } =
      body;

    if (!eventId || !applicantId) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'eventId and applicantId are required',
        },
        { status: 400 }
      );
    }

    if (!agent || !createAgent || !timeIn) {
      return NextResponse.json(
        {
          error: 'invalid-payload',
          message: 'agent, createAgent and timeIn are required',
        },
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
        {
          error: 'invalid-parameters',
          message: 'Invalid eventId or applicantId format',
        },
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
      .findOne(
        { _id: applicantObjectId },
        { projection: { status: 1, venues: 1, firstName: 1, lastName: 1 } }
      );
    if (!applicant) {
      return NextResponse.json(
        { error: 'not-found', message: 'Applicant not found' },
        { status: 400 }
      );
    }

    // Validate venue StaffingPool membership — skipped for Members
    type VenueEntry = { venueSlug?: string; status?: string };
    const isMember = applicant.status === 'Member';
    if (
      !isMember &&
      !(applicant.venues as VenueEntry[] | undefined)?.some(
        (v) => v.venueSlug === event.venueSlug && v.status === 'StaffingPool'
      )
    ) {
      return NextResponse.json(
        {
          error: 'not-in-staffing-pool',
          message:
            'Applicant is not part of the StaffingPool for the specified venue',
        },
        { status: 400 }
      );
    }

    // Find roster record
    const rosterRecord = (
      event.applicants as Array<Record<string, unknown>>
    ).find((a) => a.id?.toString() === applicantId && a.status === 'Roster');
    if (!rosterRecord) {
      return NextResponse.json(
        {
          error: 'not-on-roster',
          message: 'Applicant is not on Roster for this event',
        },
        { status: 400 }
      );
    }

    // Guard: already clocked in
    if (rosterRecord.timeIn) {
      return NextResponse.json(
        {
          error: 'already-clocked-in',
          message: `Employee has already clocked in at ${rosterRecord.timeIn}`,
        },
        { status: 400 }
      );
    }

    // Compute actual clock-in time:
    //   now  if current time is between reportTime and eventEndTime
    //   else reportTime (use the scheduled start)
    const reportTime = rosterRecord.reportTime
      ? new Date(rosterRecord.reportTime as string)
      : new Date(event.eventDate as string);
    const now = new Date();

    const clockInTime = now > reportTime ? now : reportTime;

    // Build the updated roster record (full replacement, matching legacy API)
    const updatedRecord = {
      ...rosterRecord,
      timeIn: clockInTime.toISOString(),
      dateModified: now.toISOString(),
      ...(platform && { platform }),
      ...(coordinates && { clockInCoordinates: coordinates }),
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
        'Event Clock In',
        `${applicant.firstName} ${applicant.lastName} clocked in at ${clockInTime.toISOString()} for ${event.eventUrl ?? eventId}`,
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
      {
        success: true,
        message: 'Clocked in successfully',
        data: { rosterRecord: updatedRecord },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Event Clock-In API] Error:', error);
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

export const POST = withEnhancedAuthAPI(clockInHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
