import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { getApplicantId } from '@/domains/venue/utils/mongo-venue-utils';

type ApplicantVenueEntry = {
  venueSlug: string;
  status: string;
  agent?: string;
  dateModified?: string;
};

type VenueDoc = {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  distanceInMiles?: number;
};

// Mirrors appendHiddenVenuesFilter — excludes venues with ShowVenueOnWebsite=No
// unless the applicant is already in the staffing pool for that venue.
function appendHiddenVenuesFilter(
  filter: Record<string, unknown>,
  staffingPoolSlugs: string[]
) {
  if (staffingPoolSlugs.length > 0) {
    const visibilityOr = [
      { 'settings.ShowVenueOnWebsite': { $ne: 'No' } },
      { slug: { $in: staffingPoolSlugs } },
    ];
    if (filter['$or']) {
      const currentAnd = (filter['$and'] as unknown[]) ?? [];
      filter['$and'] = [
        ...currentAnd,
        { $or: filter['$or'] },
        { $or: visibilityOr },
      ];
      delete filter['$or'];
    } else {
      filter['$or'] = visibilityOr;
    }
  } else {
    filter['settings.ShowVenueOnWebsite'] = { $ne: 'No' };
  }
}

// Mirrors overrideFiltersForClients — restricts venue list to the client's orgs.
async function appendClientFilter(
  db: Awaited<ReturnType<typeof getTenantAwareConnection>>['db'],
  user: AuthenticatedRequest['user'],
  filter: Record<string, unknown>
) {
  const userId = user.userId ?? user._id;
  let clientUser = null;
  if (userId && ObjectId.isValid(String(userId))) {
    clientUser = await db
      .collection('users')
      .findOne(
        { _id: new ObjectId(String(userId)) },
        { projection: { clientOrgs: 1 } }
      );
  }
  const clientOrgs = (
    (clientUser?.clientOrgs ?? (user as Record<string, unknown>).clientOrgs ?? []) as {
      slug?: string;
    }[]
  );
  const clientOrgSlugs = clientOrgs.map((org) => org.slug ?? '').filter(Boolean);

  const existing = filter.slug as
    | string
    | { $eq?: string; $in?: string[] }
    | undefined;

  if (existing) {
    if (typeof existing === 'string') {
      if (!clientOrgSlugs.includes(existing)) {
        filter.slug = { $in: [] };
      }
    } else if (existing.$eq) {
      if (!clientOrgSlugs.includes(existing.$eq)) {
        filter.slug = { $in: [] };
      }
    } else if (existing.$in) {
      filter.slug = { $in: existing.$in.filter((s) => clientOrgSlugs.includes(s)) };
    }
  } else {
    filter.slug = { $in: clientOrgSlugs };
  }
}

async function getVenuesHandler(request: AuthenticatedRequest) {
  try {
    const { db } = await getTenantAwareConnection(request);
    const user = request.user;

    const isEmployee = !user.userType || user.userType === 'User';
    const isClient = user.userType === 'Client';
    const isAdmin =
      user.userType === 'Admin' ||
      user.userType === 'SuperAdmin' ||
      (user as Record<string, unknown>).isAdmin === true;

    const url = new URL(request.url);
    const longitudeParam = url.searchParams.get('longitude');
    const latitudeParam = url.searchParams.get('latitude');

    // Fetch applicant data for employees
    let statusMap = new Map<string, string>();
    let staffingPoolSlugs: string[] = [];
    let employmentStatus: string | null = null;

    if (isEmployee) {
      const applicantId = getApplicantId(user);
      if (applicantId) {
        if (!ObjectId.isValid(applicantId)) {
          return NextResponse.json(
            { success: false, message: 'Invalid applicant id' },
            { status: 400 }
          );
        }

        const applicantDoc = await db
          .collection('applicants')
          .findOne(
            { _id: new ObjectId(applicantId) },
            { projection: { venues: 1, employmentStatus: 1 } }
          );

        const applicantVenues: ApplicantVenueEntry[] =
          applicantDoc?.venues ?? [];
        statusMap = new Map(
          applicantVenues.map((v) => [v.venueSlug, v.status])
        );
        employmentStatus = applicantDoc?.employmentStatus ?? null;
        staffingPoolSlugs = applicantVenues
          .filter((v) => v.status === 'StaffingPool')
          .map((v) => v.venueSlug);
      }
    }

    // If inactive/terminated on a Venue-type company, return empty list
    if (isEmployee && (employmentStatus === 'Inactive' || employmentStatus === 'Terminated')) {
      const companyDoc = await db
        .collection('company')
        .findOne({}, { projection: { type: 1 } });
      if (companyDoc?.type === 'Venue') {
        return NextResponse.json({ success: true, data: [] }, { status: 200 });
      }
    }

    // Build base filter
    const baseFilter: Record<string, unknown> = { status: 'Active' };

    // Exclude hidden venues for non-admin employees
    if (!isAdmin && !isClient && isEmployee) {
      appendHiddenVenuesFilter(baseFilter, staffingPoolSlugs);
    }

    // Restrict venue list to client's orgs
    if (isClient) {
      await appendClientFilter(db, user, baseFilter);
    }

    // Fetch venues — geo or all
    const useGeo =
      longitudeParam &&
      latitudeParam &&
      !isNaN(parseFloat(longitudeParam)) &&
      !isNaN(parseFloat(latitudeParam));

    let venues: VenueDoc[];

    if (useGeo) {
      const lng = parseFloat(longitudeParam!);
      const lat = parseFloat(latitudeParam!);

      const pipeline = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distanceInMeters',
            maxDistance: 160000,
            spherical: true,
            query: baseFilter,
          },
        },
        {
          $project: {
            _id: 1,
            slug: 1,
            name: 1,
            address: 1,
            city: 1,
            state: 1,
            zip: 1,
            logoUrl: 1,
            description: 1,
            distanceInMiles: {
              $round: [{ $divide: ['$distanceInMeters', 1609.34] }, 1],
            },
          },
        },
      ];

      const raw = await db.collection('venues').aggregate(pipeline).toArray();
      venues = raw.map((rawItem) => convertToJSON(rawItem)) as VenueDoc[];
    } else {
      const raw = await db
        .collection('venues')
        .find(baseFilter, {
          projection: {
            _id: 1,
            slug: 1,
            name: 1,
            address: 1,
            city: 1,
            state: 1,
            zip: 1,
            logoUrl: 1,
            description: 1,
          },
        })
        .toArray();
      venues = raw.map((rawItem) => convertToJSON(rawItem)) as VenueDoc[];
    }

    // Merge applicant venue status, filter out Locked for employees
    const data = venues.flatMap((venue) => {
      const userVenueStatus = statusMap.get(venue.slug) ?? '';
      if (isEmployee && userVenueStatus === 'Locked') return [];
      return [{ ...venue, userVenueStatus }];
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error('Error fetching venues:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenuesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
