import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';
import { logActivity, createActivityLogData } from '@/lib/services/activity-logger';
import { processClockCoordinates } from '@/domains/event/utils/event-clock-geo';
import type { ApplicantNote } from '@/domains/user/types/applicant.types';

/**
 * POST /api/events/[eventId]/clock-out
 *
 * Body: { applicantId, agent, createAgent, timeOut, platform?, coordinates? }
 *
 * Mirrors the behaviour of eventClockOut in the legacy API:
 *  - Validates venue StaffingPool membership
 *  - Confirms the roster record has clocked in and has not yet clocked out
 *  - Geofence check: flags the record and adds a note when outside — never blocks clock-out
 *  - Adds a note when clocking out after the estimated event end time
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
    const applicantNotes: ApplicantNote[] = [];
    const [agentFirstName, ...agentLastParts] = (agent as string).split(' ');
    const agentLastName = agentLastParts.join(' ');

    // Geofence check — never blocks clock-out, only flags
    if (coordinates) {
      await processClockCoordinates({
        db,
        coordinates,
        direction: 'out',
        event: event as Record<string, unknown>,
        rosterRecord,
        agentFirstName,
        agentLastName,
        createAgent: createAgent as string,
        agent: agent as string,
        applicantNotes,
      });
    }

    // Late clock-out note: flag when clocking out after the estimated event end time
    const eventEndTime = event.eventEndTime ? new Date(event.eventEndTime as string) : null;
    if (eventEndTime && eventEndTime < now) {
      applicantNotes.push({
        type: 'Clock-out after event end time',
        text: `<p>Event: ${(event.eventUrl as string) ?? eventId}
          <blockquote><div>Applicant clocked out at ${now.toISOString()}, after estimated event end time of ${eventEndTime.toISOString()}</div></blockquote></p>`,
        firstName: agentFirstName,
        lastName: agentLastName,
        userId: createAgent as string,
        date: new Date(),
      });
      // Only set flag if not already flagged by geofence check (geofence flag takes precedence)
      if (!rosterRecord.flag) {
        rosterRecord.flag = 'Yes';
        rosterRecord.flagColor = 'warning';
        rosterRecord.flagTooltip = 'Clock-out after est end time';
      }
    }

    // Push any notes to the applicant record
    if (applicantNotes.length) {
      await db.collection('applicants').updateOne(
        { _id: applicantObjectId },
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $push: { notes: { $each: applicantNotes } } as any,
          $set: {
            modifiedDate: now,
            modifiedAgent: createAgent,
            modifiedAgentName: agent,
          },
        }
      );
    }

    // Compute clock-out time; handle overnight shift
    let clockOutTime = now;
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
