import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

const DEFAULT_LIMIT = 25;

/**
 * GET /api/events/[eventId]/roster-applicants
 *   ?filter=all|roster|request|waitlist|notRoster
 *   &page=1&limit=25&sort=lastName&sortDir=asc
 *
 * Server-side filtering strategy:
 *   all        → paginate full staffing pool for the venue
 *   roster     → fetch only applicants whose ID is in event.applicants with status "Roster"
 *   request    → same, status "Request"
 *   waitlist   → same, status "Waitlist"
 *   notRoster  → staffing pool for venue, excluding all event roster IDs
 *
 * Counts are derived from the event.applicants array (always fully loaded, small)
 * plus one countDocuments for the total pool size.
 */
async function getRosterApplicantsHandler(
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

    const { searchParams } = new URL(request.url);
    const filterParam = searchParams.get('filter') ?? 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10))
    );
    const sortField = searchParams.get('sort') ?? 'lastName';
    const sortDir = searchParams.get('sortDir') === 'desc' ? -1 : 1;
    const search = searchParams.get('search')?.trim() ?? '';

    const ALLOWED_SORT = new Set(['lastName', 'firstName', 'phone', 'loginVerified']);
    const resolvedSort = ALLOWED_SORT.has(sortField) ? sortField : 'lastName';

    const user = request.user;
    const { db } = await getTenantAwareConnection(request);

    // Always fetch the full event applicants array — it's small and drives everything
    const eventDoc = await db.collection('events').findOne(
      { _id: new ObjectId(eventId) },
      { projection: { venueSlug: 1, applicants: 1 } }
    );

    if (!eventDoc) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    // Client users: verify venue access
    if (user.userType === 'Client') {
      const userId = user.userId ?? user._id;
      let clientOrgSlugs: string[] = [];
      if (userId && ObjectId.isValid(String(userId))) {
        const clientDoc = await db
          .collection('users')
          .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
        const orgs =
          (clientDoc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
        clientOrgSlugs = orgs.map((o) => o.slug ?? '').filter(Boolean);
      }
      if (!clientOrgSlugs.includes(String(eventDoc.venueSlug ?? ''))) {
        return NextResponse.json(
          { success: false, message: 'Access denied to this event.' },
          { status: 403 }
        );
      }
    }

    const venueSlug = String(eventDoc.venueSlug ?? '');

    type EventApplicant = {
      id: string;
      status?: string;
      dateModified?: string;
      agent?: string;
      position?: string;
      partnerSlug?: string;
    };

    // Exclude partners (they have partnerSlug)
    const eventApplicants: EventApplicant[] = (
      Array.isArray(eventDoc.applicants) ? (eventDoc.applicants as EventApplicant[]) : []
    ).filter((a) => !a.partnerSlug);

    // Build lookup maps
    const rosterMap = new Map<string, EventApplicant>();
    for (const a of eventApplicants) {
      if (a.id) rosterMap.set(a.id, a);
    }

    const idsByStatus: Record<string, string[]> = {
      Roster: [],
      Request: [],
      Waitlist: [],
    };
    for (const a of eventApplicants) {
      if (a.status && a.status in idsByStatus) {
        idsByStatus[a.status].push(a.id);
      }
    }
    const allRosterIds = eventApplicants.map((a) => a.id);

    // ── Build the MongoDB query based on filter ──────────────────────────────

    const poolBase = {
      venues: { $elemMatch: { venueSlug, status: 'StaffingPool' } },
    };

    let query: Record<string, unknown>;

    if (filterParam === 'roster' || filterParam === 'request' || filterParam === 'waitlist') {
      const statusLabel =
        filterParam === 'roster'
          ? 'Roster'
          : filterParam === 'request'
            ? 'Request'
            : 'Waitlist';
      const ids = idsByStatus[statusLabel];
      if (ids.length === 0) {
        // Short-circuit: no applicants with this status
        const rosterCount = idsByStatus['Roster'].length;
        const requestCount = idsByStatus['Request'].length;
        const waitlistCount = idsByStatus['Waitlist'].length;
        const totalPool = await db.collection('applicants').countDocuments(poolBase);
        return NextResponse.json({
          success: true,
          data: [],
          counts: {
            all: totalPool,
            roster: rosterCount,
            request: requestCount,
            waitlist: waitlistCount,
            notRoster: totalPool - rosterCount - requestCount - waitlistCount,
          },
          pagination: { page: 1, limit, total: 0, hasMore: false },
        });
      }
      // Fetch only the specific IDs (no venue filter needed — they're in the event)
      query = { _id: { $in: ids.map((id) => new ObjectId(id)) } };
    } else if (filterParam === 'notRoster') {
      // Staffing pool members NOT in the event roster at all
      query = {
        ...poolBase,
        ...(allRosterIds.length > 0
          ? { _id: { $nin: allRosterIds.map((id) => new ObjectId(id)) } }
          : {}),
      };
    } else {
      // 'all' — full staffing pool
      query = poolBase;
    }

    // ── Apply search filter ───────────────────────────────────────────────────

    const searchRegex = search
      ? { $regex: search, $options: 'i' }
      : null;

    // dataQuery adds search on top of the status-filtered query
    const dataQuery: Record<string, unknown> = searchRegex
      ? { $and: [query, { $or: [{ firstName: searchRegex }, { lastName: searchRegex }, { email: searchRegex }] }] }
      : query;

    // ── Counts (tab counts are unaffected by search — standard UX) ───────────

    const [total, poolTotal] = await Promise.all([
      // total = count matching current filter + search (drives pagination hasMore)
      db.collection('applicants').countDocuments(dataQuery),
      // poolTotal = full unfiltered pool count (drives tab counts, always needed)
      db.collection('applicants').countDocuments(poolBase),
    ]);

    const allTotal = poolTotal;
    const rosterCount = idsByStatus['Roster'].length;
    const requestCount = idsByStatus['Request'].length;
    const waitlistCount = idsByStatus['Waitlist'].length;
    const counts = {
      all: allTotal,
      roster: rosterCount,
      request: requestCount,
      waitlist: waitlistCount,
      notRoster: allTotal - rosterCount - requestCount - waitlistCount,
    };

    // ── Paginated fetch ───────────────────────────────────────────────────────

    const poolDocs = await db
      .collection('applicants')
      .find(dataQuery, {
        projection: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          emailAddress: 1,
          phone: 1,
          status: 1,
          profileImg: 1,
        },
      })
      .sort({ [resolvedSort]: sortDir, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Enrich with user-record data (profileImg, loginVerified, platform, userRecordId
    // all live in the users collection, keyed by applicantId)
    const applicantIds = poolDocs.map((d) => String(d._id));
    const userDocs = await db
      .collection('users')
      .find(
        { applicantId: { $in: applicantIds } },
        { projection: { _id: 1, applicantId: 1, loginVerified: 1, platform: 1, profileImg: 1 } }
      )
      .toArray();

    const userByApplicantId = new Map<string, Record<string, unknown>>();
    for (const u of userDocs) {
      userByApplicantId.set(String(u.applicantId), convertToJSON(u) as Record<string, unknown>);
    }

    const data = poolDocs.map((doc) => {
      const base = convertToJSON(doc) as Record<string, unknown>;
      const id = String(base._id);
      const roster = rosterMap.get(id);
      const userData = userByApplicantId.get(id);
      return {
        ...base,
        // User-record fields override applicant-level fields
        profileImg: (userData?.profileImg as string | undefined) ?? (base.profileImg as string | undefined),
        loginVerified: (userData?.loginVerified as string | undefined) ?? 'No',
        platform: (userData?.platform as string | undefined) ?? '',
        userRecordId: userData ? String(userData._id) : null,
        rosterStatus: roster?.status ?? 'Not Roster',
        signupDate: roster?.dateModified ?? null,
        agent: roster?.agent ?? null,
        position: roster?.position ?? null,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data,
        counts,
        pagination: { page, limit, total, hasMore: page * limit < total },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Event Roster Applicants API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getRosterApplicantsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

// ─── PUT — update a single applicant's roster status ─────────────────────────

/**
 * PUT /api/events/[eventId]/roster-applicants
 * Body: { applicantId: string; requestType: string }
 * Proxies to sp1 PUT /events/url/{eventUrl}/enroll/{applicantId}
 */
async function updateRosterStatusHandler(
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
    if (!user?.sub || !user?.email) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }

    const body = await request.json() as { applicantId?: string; requestType?: string };
    const { applicantId, requestType } = body;

    if (!applicantId || !ObjectId.isValid(applicantId)) {
      return NextResponse.json({ success: false, message: 'Invalid applicant ID' }, { status: 400 });
    }
    if (!requestType) {
      return NextResponse.json({ success: false, message: 'Missing requestType' }, { status: 400 });
    }

    const { db } = await getTenantAwareConnection(request);
    const eventDoc = await db
      .collection('events')
      .findOne({ _id: new ObjectId(eventId) }, { projection: { eventUrl: 1, venueSlug: 1 } });

    if (!eventDoc) {
      return NextResponse.json({ success: false, message: 'Event not found' }, { status: 404 });
    }

    // Client users: verify venue access
    if (user.userType === 'Client') {
      const userId = user.userId ?? user._id;
      let clientOrgSlugs: string[] = [];
      if (userId && ObjectId.isValid(String(userId))) {
        const clientDoc = await db
          .collection('users')
          .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
        const orgs =
          (clientDoc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
        clientOrgSlugs = orgs.map((o) => o.slug ?? '').filter(Boolean);
      }
      if (!clientOrgSlugs.includes(String(eventDoc.venueSlug ?? ''))) {
        return NextResponse.json({ success: false, message: 'Access denied.' }, { status: 403 });
      }
    }

    const eventUrl = String(eventDoc.eventUrl ?? '');
    const userId = user.userId ?? user._id;
    const agentName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);
    const { data } = await sp1.put(`/events/url/${eventUrl}/enroll/${applicantId}`, {
      requestType,
      agent: agentName,
      createAgent: userId ? String(userId) : undefined,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[Roster Status Update] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const PUT = withEnhancedAuthAPI(updateRosterStatusHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
