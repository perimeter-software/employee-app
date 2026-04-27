import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };
type UserDoc = { firstName?: string; lastName?: string; _id?: unknown };

function buildExportFilter(venueSlug: string, filterMode: string | null): string {
  const base = `status:Employee;Partner;Leader,venues.venueSlug:${venueSlug}`;
  switch (filterMode) {
    case 'active':     return `${base},employmentStatus:Active,venues.status:StaffingPool`;
    case 'inactive':   return `${base},employmentStatus:Inactive,venues.status:StaffingPool`;
    case 'terminated': return `${base},employmentStatus:Terminated,venues.status:StaffingPool`;
    case 'loggedIn':   return `${base},loginVerified:Yes,venues.status:StaffingPool`;
    case 'noLogin':    return `${base},loginVerified:No,venues.status:StaffingPool`;
    case 'dnu':        return `${base},isDnu:Yes,venues.status:StaffingPool`;
    default:           return `${base},employmentStatus:Active;Inactive;Terminated,venues.status:StaffingPool;Pending;Locked`;
  }
}

async function exportVenueStaffingPoolHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const user = request.user;

    if (user.userType !== 'Client') {
      return NextResponse.json(
        { success: false, message: 'Access denied. Client role required.' },
        { status: 403 }
      );
    }

    const params = (await context?.params) as { venueSlug: string } | undefined;
    const venueSlug = params?.venueSlug;

    if (!venueSlug) {
      return NextResponse.json(
        { success: false, message: 'Venue slug is required.' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const userId = user.userId ?? user._id;
    let clientOrgSlugs: string[] = [];
    if (userId && ObjectId.isValid(String(userId))) {
      const clientDoc = await db
        .collection('users')
        .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
      const clientOrgs = (clientDoc as UserWithClientOrgs | null)?.clientOrgs ?? [];
      clientOrgSlugs = clientOrgs.map((org) => org.slug ?? '').filter(Boolean);
    }

    if (!clientOrgSlugs.includes(venueSlug)) {
      return NextResponse.json(
        { success: false, message: 'Access denied to this venue.' },
        { status: 403 }
      );
    }

    if (!user?.sub || !user?.email) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }

    let body: { filterMode?: string; fields?: Record<string, boolean> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
    }

    // Resolve agent name from DB
    let agentName = user.email;
    let agentId = String(userId ?? '');
    if (userId && ObjectId.isValid(String(userId))) {
      const userDoc = await db
        .collection('users')
        .findOne(
          { _id: new ObjectId(String(userId)) },
          { projection: { firstName: 1, lastName: 1 } }
        );
      const u = userDoc as UserDoc | null;
      if (u?.firstName || u?.lastName) {
        agentName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
      }
      if (u?._id) agentId = String(u._id);
    }

    const filter = buildExportFilter(venueSlug, body.filterMode ?? null);
    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    const res = await sp1.post(`/venues/${venueSlug}/staffingpool/export`, {
      agent: agentName,
      createAgent: agentId,
      fields: body.fields ?? {},
      useOr: false,
      tagOper: true,
      filter,
    });

    return NextResponse.json({ success: true, data: res.data }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error exporting staffing pool:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(exportVenueStaffingPoolHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
