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
import {
  findRosterEventIds,
  getRostersByEventIds,
  type EventRosterEntry,
} from '@/domains/event/utils/event-roster';
import { getRosterVenueAccess } from '@/domains/event/utils/roster-access';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Mirrors the external API's enrichEventsWithEventNumbers: computes roster counts from
// each event's roster entries so clients see accurate numbers even when the stored
// top-level counter fields are stale or absent. Roster entries now live in the
// `eventroster` collection (keyed by event _id), not an embedded array.
function enrichEventNumbers(
  events: Record<string, unknown>[],
  rostersByEventId: Map<string, EventRosterEntry[]>
): Record<string, unknown>[] {
  return events.map((event) => {
    const applicants = rostersByEventId.get(String(event._id)) ?? [];
    return {
      ...event,
      numberOnRoster: applicants.filter((a) => a.status === 'Roster').length,
      numberOnWaitlist: applicants.filter((a) => a.status === 'Waitlist').length,
      numberOnRequest: applicants.filter((a) => a.status === 'Request').length,
      numberOnPremise: applicants.filter((a) => a.timeIn && !a.timeOut).length,
    };
  });
}

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

/**
 * ANDs `cond` onto the query without clobbering an `$or` a previous step wrote
 * (search / roster visibility both use the top-level `$or`).
 */
function addCondition(
  options: Record<string, unknown>,
  cond: Record<string, unknown>
) {
  const and = (options.$and as unknown[]) ?? [];
  if (options.$or) {
    and.push({ $or: options.$or });
    delete options.$or;
  }
  and.push(cond);
  options.$and = and;
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
    // My Events: also return events at the venues an Event Admin manages, not just
    // the ones the caller is rostered on.
    const includeManagedVenues =
      searchParams.get('includeManagedVenues') === 'true';

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

    const isEmployee = !user.userType || user.userType === 'User';
    const isClient = user.userType === 'Client';
    const requestApplicantId =
      applicantId || (user.applicantId ? String(user.applicantId) : '');

    // ── Managed venues (Event Admin clientOrgs) ───────────────────────────────
    // Event Admins manage the venues in their clientOrgs; those count as the
    // user's own venues, so their events are in scope exactly like the venues the
    // user is in the staffing pool for.
    const managedSlugs = isEmployee
      ? [...(await getRosterVenueAccess(db, user)).slugs]
      : [];

    // ── applicants.id + applicants.status → event _id set ────────────────────
    // Roster entries live in the `eventroster` collection, so these dotted keys can no
    // longer resolve against the events collection. Resolve them to the set of event
    // ids whose roster matches, then constrain events by _id (mirrors the backend's
    // resolveApplicantsOptions). With `includeManagedVenues` the roster constraint is
    // widened to "on my roster OR at a venue I manage".
    const applicantIdFilter = options['applicants.id'] as string | undefined;
    const applicantStatusFilter = options['applicants.status'] as
      | string
      | undefined;
    if (applicantIdFilter || applicantStatusFilter) {
      const rosterFilter: Record<string, unknown> = {};
      if (applicantIdFilter) rosterFilter.id = applicantIdFilter;
      if (applicantStatusFilter) rosterFilter.status = applicantStatusFilter;
      const matchedEventIds = await findRosterEventIds(db, rosterFilter);
      if (includeManagedVenues && managedSlugs.length > 0) {
        addCondition(options, {
          $or: [
            { _id: { $in: matchedEventIds } },
            { venueSlug: { $in: managedSlugs } },
          ],
        });
      } else {
        options._id = { $in: matchedEventIds };
      }
      delete options['applicants.id'];
      delete options['applicants.status'];
    } else if (includeManagedVenues && managedSlugs.length > 0) {
      // No roster filter to widen (an Event Admin without an applicant record):
      // managed venues are the whole result set.
      addCondition(options, { venueSlug: { $in: managedSlugs } });
    }

    // ── Employee venue scoping ───────────────────────────────────────────────
    // Employees only see events at their own venues: the ones they are in the
    // staffing pool for plus the ones they manage as an Event Admin.
    if (
      isEmployee &&
      (requestApplicantId || managedSlugs.length > 0) &&
      !options.venueSlug
    ) {
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

      const ownVenueSlugs = [
        ...new Set([...staffingPoolSlugs, ...managedSlugs]),
      ];

      if (ownVenueSlugs.length === 0) {
        return NextResponse.json(
          { success: true, data: { data: [], pagination: {} } },
          { status: 200 }
        );
      }

      options.venueSlug = { $in: ownVenueSlugs };
    }

    // ── Client venue scoping ──────────────────────────────────────────────────
    // Mirrors external API's overrideFiltersForClients: clients can only see
    // events for venues where seeEvents === 'Yes', regardless of what the
    // caller sends in the venueSlug filter.
    if (isClient) {
      type ClientOrg = { slug?: string; seeEvents?: string };
      const userId = user.userId ?? user._id;
      let allowedSlugs: string[] = [];
      if (userId && ObjectId.isValid(String(userId))) {
        const clientDoc = await db
          .collection('users')
          .findOne(
            { _id: new ObjectId(String(userId)) },
            { projection: { clientOrgs: 1 } }
          );
        const clientOrgs =
          ((clientDoc as { clientOrgs?: ClientOrg[] } | null)?.clientOrgs ?? []);
        allowedSlugs = clientOrgs
          .filter((org) => org.seeEvents === 'Yes')
          .map((org) => org.slug ?? '')
          .filter(Boolean);
      }

      if (allowedSlugs.length === 0) {
        return NextResponse.json(
          { success: true, data: { data: [], pagination: { total: 0 } } },
          { status: 200 }
        );
      }

      const existing = options.venueSlug;
      if (existing) {
        if (typeof existing === 'string') {
          options.venueSlug = allowedSlugs.includes(existing)
            ? existing
            : { $in: [] };
        } else if ((existing as Record<string, unknown>).$in) {
          const requested = ((existing as Record<string, unknown>).$in as string[]);
          options.venueSlug = { $in: requested.filter((s) => allowedSlugs.includes(s)) };
        } else {
          options.venueSlug = { $in: allowedSlugs };
        }
      } else {
        options.venueSlug = { $in: allowedSlugs };
      }
    }

    if (isEmployee && requestApplicantId) {
      // Private events are visible only when the requester is on their Roster/Waitlist.
      // That roster membership now lives in `eventroster`, so resolve it to an event
      // _id set rather than an embedded $elemMatch.
      const privateVisibleIds = await findRosterEventIds(db, {
        id: requestApplicantId,
        status: { $in: ['Roster', 'Waitlist'] },
      });
      const visibilityOr: Record<string, unknown>[] = [
        { makePublicAndSendNotification: { $ne: 'No' } },
        {
          makePublicAndSendNotification: { $eq: 'No' },
          _id: { $in: privateVisibleIds },
        },
      ];
      // Event Admins see every event at a venue they manage, private or not.
      if (managedSlugs.length > 0) {
        visibilityOr.push({ venueSlug: { $in: managedSlugs } });
      }

      addCondition(options, { $or: visibilityOr });
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
      numberOnWaitlist: 1,
      numberOnRequest: 1,
      numberOnPremise: 1,
      makePublicAndSendNotification: 1,
      allowEarlyClockin: 1,
      timeZone: 1,
      jobSlug: 1,
      eventUrl: 1,
    };

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

    // ── Load roster entries for this page's events (single query) ────────────
    // Drives both the per-user rosterStatus and the roster number badges. Entries
    // live in the `eventroster` collection, so this replaces the old embedded array.
    const pageEventIds = events
      .map((e) => String(e._id))
      .filter((id) => ObjectId.isValid(id));
    const rostersByEventId = await getRostersByEventIds(db, pageEventIds);

    // ── Enrich with rosterStatus if applicantId provided ─────────────────────
    if (requestApplicantId) {
      events = events.map((event) => {
        const applicants = rostersByEventId.get(String(event._id)) ?? [];
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

    // Compute roster numbers from each event's roster entries.
    // Mirrors enrichEventsWithEventNumbers in the external API.
    events = enrichEventNumbers(events, rostersByEventId);

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
          pagination: {
            total,
            ...(hasNextPage ? { next: { page: page + 1 } } : {}),
          },
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

// ─── POST (create event) ──────────────────────────────────────────────────────

async function createEventHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    if (!user?.sub || !user?.email) {
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 }
      );
    }
    const body = await request.json();
    const { tenant } = user;
    const sp1 = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url
    );
    const res = await sp1.post('/events', body);
    return NextResponse.json({ success: true, data: res.data }, { status: 201 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[Events Create API] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(createEventHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
