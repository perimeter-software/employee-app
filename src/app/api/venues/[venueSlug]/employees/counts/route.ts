import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };


async function getVenueEmployeeCountsHandler(
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
        { success: false, message: 'Venue slug is required' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const userId = user.userId ?? user._id;
    let clientOrgSlugs: string[] = [];
    if (userId && ObjectId.isValid(String(userId))) {
      const clientDoc = await db
        .collection('users')
        .findOne(
          { _id: new ObjectId(String(userId)) },
          { projection: { clientOrgs: 1 } }
        );
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

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    const base = `status:Employee;Partner;Leader,venues.venueSlug:${venueSlug}`;
    const empExtra = {
      countOnly: true,
      fetchAll: true,
      useElemMatch: true,
      extraFilter: 'status:Employee;Partner',
      includeVerified: true,
      tagOper: 'in',
    };

    // Order: all, active, loggedIn, noLogin, inactive, terminated, dnu, partner
    const empFilters = [
      `${base},employmentStatus:Active;Inactive;Terminated,venues.status:StaffingPool;Pending;Locked`,
      `${base},employmentStatus:Active,venues.status:StaffingPool`,
      `${base},loginVerified:Yes,venues.status:StaffingPool`,
      `${base},loginVerified:No,venues.status:StaffingPool`,
      `${base},employmentStatus:Inactive,venues.status:StaffingPool`,
      `${base},employmentStatus:Terminated,venues.status:StaffingPool`,
      `${base},isDnu:Yes,venues.status:StaffingPool`,
    ];

    const results = await Promise.all([
      ...empFilters.map((filter) =>
        sp1.get('/applicants', { params: { filter, ...empExtra } })
      ),
      sp1.get('/partners', {
        params: { filter: `venues.venueSlug:${venueSlug}`, countOnly: true, fetchAll: true, useElemMatch: true },
      }),
    ]);
    const [all, active, loggedIn, noLogin, inactive, terminated, dnu, partner] =
      results.map((r) => (r.data?.count as number) ?? 0);

    return NextResponse.json({
      success: true,
      data: { all, active, loggedIn, noLogin, inactive, terminated, dnu, partner },
    });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching venue employee counts:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenueEmployeeCountsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
