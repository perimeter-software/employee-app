import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };

type ApplicantDoc = Record<string, unknown>;

type BackendApplicantsResponse = {
  data?: ApplicantDoc[];
  [key: string]: unknown;
};

const EMP_PROJECTED_FIELDS = '_id,firstName,lastName,email,phone,employmentStatus,profileImg,userId';
const EMP_EXTRA_PARAMS = {
  extraFilter: 'status:Employee;Partner',
  includeVerified: true,
  tagOper: 'in',
};

// Maps a filterMode query param to the backend /applicants filter string and projected fields.
function buildBackendParams(venueSlug: string, filterMode: string | null) {
  const base = `status:Employee;Partner;Leader,venues.venueSlug:${venueSlug}`;

  switch (filterMode) {
    case 'active':
      return {
        filter: `${base},employmentStatus:Active,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    case 'inactive':
      return {
        filter: `${base},employmentStatus:Inactive,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    case 'terminated':
      return {
        filter: `${base},employmentStatus:Terminated,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    case 'partner':
      return {
        filter: `venues.venueSlug:${venueSlug}`,
        projectedFields: '_id,firstName,lastName,partnerSlug,employeeID,profileImg',
        isPartner: true,
      };
    case 'loggedIn':
      return {
        filter: `${base},loginVerified:Yes,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    case 'noLogin':
      return {
        filter: `${base},loginVerified:No,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    case 'dnu':
      return {
        filter: `${base},isDnu:Yes,venues.status:StaffingPool`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
    default: // 'all'
      return {
        filter: `${base},employmentStatus:Active;Inactive;Terminated,venues.status:StaffingPool;Pending;Locked`,
        projectedFields: EMP_PROJECTED_FIELDS,
        isPartner: false,
        ...EMP_EXTRA_PARAMS,
      };
  }
}

async function getVenueEmployeesHandler(
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
      const clientOrgs =
        (clientDoc as UserWithClientOrgs | null)?.clientOrgs ?? [];
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

    const url = new URL(request.url);
    const filterMode = url.searchParams.get('filterMode');
    const { filter, projectedFields, isPartner, ...extraParams } = buildBackendParams(
      venueSlug,
      filterMode
    );

    const endpoint = isPartner ? '/partners' : '/applicants';
    const res = await sp1.get(endpoint, {
      params: {
        filter,
        fetchAll: true,
        useElemMatch: true,
        sort: 'lastName:asc',
        projectedFields,
        ...extraParams,
      },
    });

    const backendData = res.data as BackendApplicantsResponse;
    const raw: ApplicantDoc[] = backendData?.data ?? [];

    const hideDetails = !!user.hideEmployeesDetails;
    const data = raw.map((emp) => {
      if (!isPartner && hideDetails) {
        return { ...emp, email: '', phone: '' };
      }
      return emp;
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    console.error('Error fetching venue employees:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenueEmployeesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
