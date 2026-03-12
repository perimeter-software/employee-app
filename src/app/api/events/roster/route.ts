import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { ObjectId } from 'mongodb';

/**
 * GET /api/events/roster?applicantId=<id>[&startDate=<iso>&endDate=<iso>]
 *
 * Returns events of type "Event" where:
 *  - The applicant is in a StaffingPool venue that matches the event's venueSlug
 *  - The applicant appears in the event's `applicants` array with status "Roster"
 *  - Optionally filtered to a date window
 */
async function getRosterEventsHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const applicantId = searchParams.get('applicantId');

    if (!applicantId) {
      return NextResponse.json(
        { error: 'missing-parameters', message: 'applicantId is required' },
        { status: 400 }
      );
    }

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const { db } = await getTenantAwareConnection(request);

    // Step 1: look up the applicant to get their StaffingPool venue slugs
    let applicantObjectId: ObjectId;
    try {
      applicantObjectId = new ObjectId(applicantId);
    } catch {
      return NextResponse.json(
        { error: 'invalid-parameters', message: 'Invalid applicantId format' },
        { status: 400 }
      );
    }

    const applicant = await db
      .collection('applicants')
      .findOne(
        { _id: applicantObjectId },
        { projection: { venues: 1 } }
      );

    if (!applicant) {
      return NextResponse.json(
        { success: true, message: 'Roster events retrieved successfully', count: 0, data: [] },
        { status: 200 }
      );
    }

    type VenueEntry = { venueSlug?: string; status?: string };
    const staffingPoolSlugs: string[] = (
      (applicant.venues as VenueEntry[] | undefined) ?? []
    )
      .filter((v) => v.status === 'StaffingPool' && v.venueSlug)
      .map((v) => v.venueSlug as string);

    // If the applicant has no StaffingPool venues there can be no matching events
    if (staffingPoolSlugs.length === 0) {
      return NextResponse.json(
        { success: true, message: 'Roster events retrieved successfully', count: 0, data: [] },
        { status: 200 }
      );
    }

    // Step 2: query events with all constraints
    const matchQuery: Record<string, unknown> = {
      eventType: 'Event',
      venueSlug: { $in: staffingPoolSlugs },
      applicants: {
        $elemMatch: {
          id: applicantId,
          status: 'Roster',
        },
      },
    };

    if (startDateParam || endDateParam) {
      const dateFilter: Record<string, Date> = {};
      if (startDateParam) dateFilter.$gte = new Date(startDateParam);
      if (endDateParam) dateFilter.$lte = new Date(endDateParam);
      matchQuery.eventDate = dateFilter;
    }

    const events = await db
      .collection('events')
      .find(matchQuery)
      .project({
        _id: 1,
        eventId: 1,
        eventName: 1,
        eventDate: 1,
        eventEndTime: 1,
        reportTimeTBD: 1,
        venueName: 1,
        venueSlug: 1,
        venueCity: 1,
        venueState: 1,
        address: 1,
        zip: 1,
        logoUrl: 1,
        eventType: 1,
        eventUrl: 1,
        status: 1,
        timeZone: 1,
        allowEarlyClockin: 1,
        // Only return the applicant entry for this user
        applicants: {
          $filter: {
            input: '$applicants',
            as: 'a',
            cond: {
              $and: [
                { $eq: ['$$a.id', applicantId] },
                { $eq: ['$$a.status', 'Roster'] },
              ],
            },
          },
        },
      })
      .sort({ eventDate: 1 })
      .toArray();

    const converted = events.map((e) => convertToJSON(e)).filter(Boolean);

    return NextResponse.json(
      {
        success: true,
        message: 'Roster events retrieved successfully',
        count: converted.length,
        data: converted,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Events Roster API] Error:', error);
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

export const GET = withEnhancedAuthAPI(getRosterEventsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
