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

// ─── Filter parser ────────────────────────────────────────────────────────────
// Parses "timeFrame:Current,eventType:Event,venueSlug:a;b,applicants.id:xxx"
// into a MongoDB filter object.

function parseFilter(filterStr: string): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (!filterStr) return options;

  const pairs = filterStr.split(',');
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();

    if (key === 'venueSlug' && value.includes(';')) {
      options[key] = { $in: value.split(';').filter(Boolean) };
    } else {
      options[key] = value;
    }
  }

  return options;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function getEventsHandler(request: AuthenticatedRequest) {
  try {
    const { db } = await getTenantAwareConnection(request);
    const user = request.user;

    const { searchParams } = request.nextUrl;
    const filterStr = searchParams.get('filter') ?? '';
    const applicantId = searchParams.get('applicantId') ?? '';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10))
    );
    const sortParam = searchParams.get('sort') ?? 'eventDate:asc';

    // Parse filter string into mongo query
    const options = parseFilter(filterStr);

    // ── Text search on eventName / venueName ─────────────────────────────────
    if (search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      const searchOr = [{ eventName: regex }, { venueName: regex }];
      if (options.$and) {
        (options.$and as unknown[]).push({ $or: searchOr });
      } else if (options.$or) {
        options.$and = [{ $or: options.$or }, { $or: searchOr }];
        delete options.$or;
      } else {
        options.$or = searchOr;
      }
    }

    // ── timeFrame → eventDate range ──────────────────────────────────────────
    // eventDate is stored as BSON Date in MongoDB — compare with Date objects only.
    const timeFrame = options.timeFrame as string | undefined;
    if (timeFrame) {
      delete options.timeFrame;
      // Mirror original backend: subtract 12 h, then take midnight UTC of that day
      const cutoff = new Date();
      cutoff.setUTCHours(cutoff.getUTCHours() - 12, 0, 0, 0);
      const cutoffMidnight = new Date(
        Date.UTC(
          cutoff.getUTCFullYear(),
          cutoff.getUTCMonth(),
          cutoff.getUTCDate()
        )
      );
      options.eventDate =
        timeFrame === 'Current'
          ? { $gte: cutoffMidnight }
          : { $lt: cutoffMidnight };
    }

    // ── applicants.id + applicants.status → $elemMatch ───────────────────────
    const applicantIdFilter = options['applicants.id'] as string | undefined;
    const applicantStatusFilter = options['applicants.status'] as
      | string
      | undefined;
    if (applicantIdFilter && applicantStatusFilter) {
      options.applicants = {
        $elemMatch: { id: applicantIdFilter, status: applicantStatusFilter },
      };
      delete options['applicants.id'];
      delete options['applicants.status'];
    } else if (applicantIdFilter) {
      options['applicants.id'] = applicantIdFilter;
    }

    // ── Employee venue scoping ────────────────────────────────────────────────
    // Mirrors mobile: employees only see events from their StaffingPool venues.
    // The client no longer pre-fetches venues; we resolve them here server-side.
    const isEmployee = !user.userType || user.userType === 'User';
    const requestApplicantId =
      applicantId || (user.applicantId ? String(user.applicantId) : '');

    if (isEmployee && requestApplicantId && !options.venueSlug) {
      let staffingPoolSlugs: string[] = [];

      if (ObjectId.isValid(requestApplicantId)) {
        const applicantDoc = await db
          .collection('applicants')
          .findOne(
            { _id: new ObjectId(requestApplicantId) },
            { projection: { venues: 1 } }
          );

        type VenueEntry = { venueSlug?: string; status?: string };
        staffingPoolSlugs = ((applicantDoc?.venues ?? []) as VenueEntry[])
          .filter((v) => v.status === 'StaffingPool' && v.venueSlug)
          .map((v) => v.venueSlug as string);
      }

      if (staffingPoolSlugs.length === 0) {
        return NextResponse.json(
          { success: true, data: { data: [], pagination: {} } },
          { status: 200 }
        );
      }

      options.venueSlug = { $in: staffingPoolSlugs };
    }

    if (isEmployee && requestApplicantId) {
      const visibilityOr = [
        { makePublicAndSendNotification: { $ne: 'No' } },
        {
          makePublicAndSendNotification: { $eq: 'No' },
          applicants: {
            $elemMatch: {
              id: requestApplicantId,
              status: { $in: ['Roster', 'Waitlist'] },
            },
          },
        },
      ];

      if (options.$or) {
        options.$and = [{ $or: options.$or }, { $or: visibilityOr }];
        delete options.$or;
      } else {
        options.$or = visibilityOr;
      }
    }

    // ── Sort ─────────────────────────────────────────────────────────────────
    const sortObj: Record<string, 1 | -1> = {};
    for (const part of sortParam.split(';')) {
      const [field, dir] = part.split(':');
      if (field) sortObj[field] = dir === 'desc' ? -1 : 1;
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    const skip = (page - 1) * limit;
    const total = await db.collection('events').countDocuments(options);

    // ── Query ─────────────────────────────────────────────────────────────────
    const projection = {
      _id: 1,
      eventName: 1,
      eventDate: 1,
      eventType: 1,
      venueSlug: 1,
      venueName: 1,
      venueCity: 1,
      venueState: 1,
      logoUrl: 1,
      eventEndTime: 1,
      reportTimeTBD: 1,
      positionsRequested: 1,
      numberOnRoster: 1,
      numberOnPremise: 1,
      makePublicAndSendNotification: 1,
      allowEarlyClockin: 1,
      applicants: 1,
      timeZone: 1,
      jobSlug: 1,
      eventUrl: 1,
    };

    console.log('options', JSON.stringify(options));

    const rawEvents = await db
      .collection('events')
      .find(options)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .project(projection)
      .toArray();

    let events = rawEvents
      .map((e) => convertToJSON(e))
      .filter(Boolean) as Record<string, unknown>[];

    // ── Enrich with rosterStatus if applicantId provided ─────────────────────
    if (requestApplicantId) {
      events = events.map((event) => {
        const applicants =
          (event.applicants as { id: string; status: string }[]) ?? [];
        const found = applicants.find((a) => a.id === requestApplicantId);
        return { ...event, rosterStatus: found ? found.status : 'Not Roster' };
      });
    }

    // Pending call-off / “cover for me” rows (swap-requests keyed by eventUrl)
    if (requestApplicantId && events.length > 0) {
      const eventUrls = [
        ...new Set(
          events
            .map((e) => (e.eventUrl != null ? String(e.eventUrl).trim() : ''))
            .filter(Boolean)
        ),
      ];

      if (eventUrls.length > 0) {
        const applicantId = requestApplicantId;
        const [callOffRows, coverRows] = await Promise.all([
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

        const peerIds = [
          ...new Set(
            coverRows.map((r) => String(r.toEmployeeId)).filter(Boolean)
          ),
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

        events = events.map((ev) => {
          const url = ev.eventUrl != null ? String(ev.eventUrl).trim() : '';
          const cover = url ? coverByUrl.get(url) : undefined;
          return {
            ...ev,
            pendingCallOffRequestId: url
              ? (callOffByUrl.get(url) ?? null)
              : null,
            pendingCoverRequestId: cover ? cover.id : null,
            pendingCoverPeerEmail: cover
              ? (peerEmailById.get(cover.toEmployeeId) ?? null)
              : null,
          };
        });
      }
    }

    // Strip applicants array from response (not needed on the listing page)
    events = events.map((ev) => {
      const rest = { ...ev };
      delete rest.applicants;
      return rest;
    });

    // ── Pagination meta ──────────────────────────────────────────────────────
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;

    // Nest the payload under `data` so ApiResponse<EventListPage>.data resolves correctly.
    // baseInstance.get<T>() returns ApiResponse<T> where .data = response body's "data" field.
    return NextResponse.json(
      {
        success: true,
        data: {
          data: events,
          pagination: hasNextPage ? { next: { page: page + 1 } } : {},
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Events API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEventsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
