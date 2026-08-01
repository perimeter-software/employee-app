import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };

async function verifyClientVenueAccess(
  request: AuthenticatedRequest,
  venueSlug: string
): Promise<{ allowed: boolean; db: Awaited<ReturnType<typeof getTenantAwareConnection>>['db'] }> {
  const { db } = await getTenantAwareConnection(request);
  const user = request.user;
  const userId = user.userId ?? user._id;
  let clientOrgSlugs: string[] = [];
  if (userId && ObjectId.isValid(String(userId))) {
    const clientDoc = await db
      .collection('users')
      .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
    const clientOrgs = (clientDoc as UserWithClientOrgs | null)?.clientOrgs ?? [];
    clientOrgSlugs = clientOrgs.map((org) => org.slug ?? '').filter(Boolean);
  }
  return { allowed: clientOrgSlugs.includes(venueSlug), db };
}

async function getVenueEmployeeHandler(
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

    const params = (await context?.params) as
      | { venueSlug: string; employeeId: string }
      | undefined;
    const { venueSlug, employeeId } = params ?? {};

    if (!venueSlug || !employeeId) {
      return NextResponse.json(
        { success: false, message: 'Venue slug and employee ID are required.' },
        { status: 400 }
      );
    }

    const { allowed } = await verifyClientVenueAccess(request, venueSlug);
    if (!allowed) {
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
    const { data } = await sp1.get(`/applicants/${employeeId}`);
    const attachments = data?.applicant?.attachments ?? data?.attachments ?? [];

    return NextResponse.json({ success: true, attachments });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching venue employee:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

async function patchVenueEmployeeHandler(
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

    const params = (await context?.params) as
      | { venueSlug: string; employeeId: string }
      | undefined;
    const { venueSlug, employeeId } = params ?? {};

    if (!venueSlug || !employeeId) {
      return NextResponse.json(
        { success: false, message: 'Venue slug and employee ID are required.' },
        { status: 400 }
      );
    }

    const { allowed: hasAccess } = await verifyClientVenueAccess(request, venueSlug);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, message: 'Access denied to this venue.' },
        { status: 403 }
      );
    }

    let body: { employmentStatus?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { employmentStatus } = body;
    const allowed = ['Active', 'Inactive', 'Terminated'];
    if (!employmentStatus || !allowed.includes(employmentStatus)) {
      return NextResponse.json(
        { success: false, message: 'Invalid employment status.' },
        { status: 400 }
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

    await sp1.put(`/applicants/${employeeId}`, { employmentStatus });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error updating venue employee:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenueEmployeeHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const PATCH = withEnhancedAuthAPI(patchVenueEmployeeHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
