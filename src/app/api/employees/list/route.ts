import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { ObjectId } from 'mongodb';

// selectedEmployeeId from the Client dashboard is an applicant _id; dashboard utils use it directly as applicantId

// Type definition for clientOrgs structure (matches jobs/with-shifts)
type ClientOrg = {
  slug?: string;
  userType?: string;
  status?: string;
  primary?: string;
  modifiedDate?: string;
};

type UserWithClientOrgs = {
  clientOrgs?: ClientOrg[];
};

function extractClientOrgSlugs(clientOrgs: ClientOrg[] | undefined): string[] {
  if (!clientOrgs || !Array.isArray(clientOrgs)) {
    return [];
  }
  return clientOrgs
    .map((org) => org.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.trim() !== '');
}

// GET Handler for Getting List of Active Employees for Client (from applicants collection)
async function getEmployeesListHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (user.userType !== 'Client') {
      return NextResponse.json(
        {
          success: false,
          error: 'unauthorized',
          message: 'Access denied. Client role required.',
        },
        { status: 403 }
      );
    }

    if (!user._id) {
      return NextResponse.json(
        { success: false, error: 'bad-request', message: 'User ID is required.' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Get client's venue slugs (clientOrgs) so we only show employees in their venues
    let clientOrgSlugs: string[] = [];
    try {
      const userObjectId = new ObjectId(user._id.toString());
      const clientUser = await db.collection('users').findOne({ _id: userObjectId });
      if (!clientUser) {
        return NextResponse.json(
          { success: false, error: 'not-found', message: 'User not found.' },
          { status: 404 }
        );
      }
      const clientOrgs = (clientUser as UserWithClientOrgs)?.clientOrgs;
      clientOrgSlugs = extractClientOrgSlugs(clientOrgs);
    } catch (err) {
      console.error('[Employees List API] Error fetching client orgs:', err);
      return NextResponse.json(
        {
          success: false,
          error: 'internal-error',
          message: 'Failed to load client configuration.',
          details: (err as Error).message,
        },
        { status: 500 }
      );
    }

    if (clientOrgSlugs.length === 0) {
      return NextResponse.json(
        { success: true, message: 'Employees list retrieved successfully', count: 0, data: [] },
        { status: 200 }
      );
    }

    // Get Active Employees directly from applicants
    const applicants = await db
      .collection('applicants')
      .find({
        employmentStatus: 'Active',
        status: 'Employee',
        'venues.venueSlug': { $in: clientOrgSlugs },
      })
      .project({ _id: 1, firstName: 1, lastName: 1, email: 1 })
      .sort({ firstName: 1, lastName: 1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        message: 'Employees list retrieved successfully',
        count: applicants.length,
        data: applicants,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching employees list:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error.',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEmployeesListHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
