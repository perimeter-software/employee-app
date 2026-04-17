import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { ObjectId } from 'mongodb';
import {
  EVENT_CALL_OFF_DOC_FILTER,
  EVENT_COVER_DOC_FILTER,
} from '@/domains/event/services/event-cover-constants';

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

    const converted = events.map((e) => convertToJSON(e)).filter(Boolean) as Record<
      string,
      unknown
    >[];

    const eventUrls = converted
      .map((e) => (e.eventUrl != null ? String(e.eventUrl).trim() : ''))
      .filter(Boolean);

    if (eventUrls.length > 0) {
      const [callOffRows, coverRows, incomingCoverRows] = await Promise.all([
        db
          .collection('swap-requests')
          .find({
            ...EVENT_CALL_OFF_DOC_FILTER,
            fromEmployeeId: applicantId,
            eventUrl: { $in: eventUrls },
          })
          .project({ _id: 1, eventUrl: 1 })
          .toArray(),
        db
          .collection('swap-requests')
          .find({
            ...EVENT_COVER_DOC_FILTER,
            fromEmployeeId: applicantId,
            eventUrl: { $in: eventUrls },
            status: { $in: ['pending_match', 'pending_approval'] },
          })
          .project({ _id: 1, eventUrl: 1, toEmployeeId: 1 })
          .toArray(),
        db
          .collection('swap-requests')
          .find({
            ...EVENT_COVER_DOC_FILTER,
            toEmployeeId: applicantId,
            eventUrl: { $in: eventUrls },
            status: 'pending_match',
          })
          .project({ _id: 1, eventUrl: 1 })
          .toArray(),
      ]);

      const callOffByUrl = new Map(
        callOffRows.map((p) => [String(p.eventUrl), String(p._id)])
      );
      const coverByUrl = new Map(
        coverRows.map((p) => [
          String(p.eventUrl),
          { id: String(p._id), toEmployeeId: String(p.toEmployeeId) },
        ])
      );
      const incomingCoverByUrl = new Map(
        incomingCoverRows.map((p) => [String(p.eventUrl), String(p._id)])
      );

      const peerIds = [
        ...new Set(coverRows.map((r) => String(r.toEmployeeId)).filter(Boolean)),
      ];
      const peerObjectIds = peerIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));
      const peers =
        peerObjectIds.length > 0
          ? await db
              .collection('applicants')
              .find(
                { _id: { $in: peerObjectIds } },
                { projection: { email: 1, emailAddress: 1 } }
              )
              .toArray()
          : [];
      const peerEmailById = new Map<string, string>();
      for (const p of peers) {
        const em = p.email ?? p.emailAddress;
        if (typeof em === 'string' && em.trim()) {
          peerEmailById.set(String(p._id), em.trim());
        }
      }

      for (const e of converted) {
        const url = e.eventUrl != null ? String(e.eventUrl).trim() : '';
        e.pendingCallOffRequestId = url ? callOffByUrl.get(url) ?? null : null;
        e.incomingCoverRequestId = url
          ? incomingCoverByUrl.get(url) ?? null
          : null;
        const cover = url ? coverByUrl.get(url) : undefined;
        if (cover) {
          e.pendingCoverRequestId = cover.id;
          e.pendingCoverPeerEmail =
            peerEmailById.get(cover.toEmployeeId) ?? null;
        } else {
          e.pendingCoverRequestId = null;
          e.pendingCoverPeerEmail = null;
        }
      }
    }

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
