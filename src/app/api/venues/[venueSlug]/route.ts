import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { getApplicantId } from '@/domains/venue/utils/mongo-venue-utils';

async function getVenueDetailHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { venueSlug: string } | undefined;
    const venueSlug = params?.venueSlug;

    if (!venueSlug) {
      return NextResponse.json(
        { success: false, message: 'Venue slug is required' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const user = request.user;
    const isEmployee = !user.userType || user.userType === 'User';

    // Fetch venue with all detail fields
    const raw = await db.collection('venues').findOne(
      { slug: venueSlug },
      {
        projection: {
          _id: 1,
          slug: 1,
          name: 1,
          address: 1,
          city: 1,
          state: 1,
          zip: 1,
          logoUrl: 1,
          bannerUrl: 1,
          description: 1,
          venueContact1: 1,
          location: 1,
          otherUrls: 1,
          videoUrls: 1,
        },
      }
    );

    if (!raw) {
      return NextResponse.json(
        { success: false, message: 'Venue not found' },
        { status: 404 }
      );
    }

    const venue = convertToJSON(raw) as Record<string, unknown>;

    // Resolve applicant's venue status
    let userVenueStatus = '';
    if (isEmployee) {
      const applicantId = getApplicantId(user);
      if (applicantId && ObjectId.isValid(applicantId)) {
        const applicantDoc = await db
          .collection('applicants')
          .findOne(
            { _id: new ObjectId(applicantId) },
            { projection: { venues: 1 } }
          );

        const match = (applicantDoc?.venues ?? []).find(
          (v: { venueSlug: string; status: string }) =>
            v.venueSlug === venueSlug
        );
        userVenueStatus = match?.status ?? '';
      }
    }

    return NextResponse.json(
      { success: true, data: { ...venue, userVenueStatus } },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching venue detail:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getVenueDetailHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
