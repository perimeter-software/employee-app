import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };

async function getVenuePartnersHandler(
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

    // Verify client has access to this venue via their clientOrgs
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
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 }
      );
    }

    const { tenant } = user;
    const sp1 = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url
    );

    const res = await sp1.get('/partners', {
      params: {
        filter: `status:Active,venues.venueSlug:${venueSlug}`,
        fetchAll: true,
        useElemMatch: true,
        sort: 'name:asc',
      },
    });

    const backendData = res.data as { data?: unknown[] };
    const data = backendData?.data ?? [];

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching venue partners:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenuePartnersHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
