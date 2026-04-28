import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

// Resolves display names for activity reference IDs (userId, applicantId, eventId, venueId, companyId).
// Returns only the fields that were requested and successfully resolved.
async function resolveActivityRefsHandler(request: AuthenticatedRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const applicantId = url.searchParams.get('applicantId');
    const eventId = url.searchParams.get('eventId');
    const venueId = url.searchParams.get('venueId');
    const companyId = url.searchParams.get('companyId');
    const jobId = url.searchParams.get('jobId');

    const isValidId = (id: string | null): id is string =>
      !!id && ObjectId.isValid(id);

    const { db } = await getTenantAwareConnection(request);

    const result: Record<string, unknown> = {};

    const lookups: Promise<void>[] = [];

    // User — check users collection, then applicants as fallback
    if (isValidId(userId)) {
      lookups.push(
        db
          .collection('users')
          .findOne(
            { _id: new ObjectId(userId) },
            { projection: { firstName: 1, lastName: 1, email: 1 } }
          )
          .then(async (doc) => {
            if (doc) {
              result.user = convertToJSON(doc);
            } else {
              const appDoc = await db.collection('applicants').findOne(
                { _id: new ObjectId(userId) },
                { projection: { firstName: 1, lastName: 1, email: 1 } }
              );
              if (appDoc) result.user = convertToJSON(appDoc);
            }
          })
      );
    }

    // Applicant
    if (isValidId(applicantId) && applicantId !== userId) {
      lookups.push(
        db
          .collection('applicants')
          .findOne(
            { _id: new ObjectId(applicantId) },
            { projection: { firstName: 1, lastName: 1, email: 1 } }
          )
          .then((doc) => {
            if (doc) result.applicant = convertToJSON(doc);
          })
      );
    }

    // Event
    if (isValidId(eventId)) {
      lookups.push(
        db
          .collection('events')
          .findOne(
            { _id: new ObjectId(eventId) },
            { projection: { eventName: 1, eventDate: 1, venueSlug: 1 } }
          )
          .then((doc) => {
            if (doc) result.event = convertToJSON(doc);
          })
      );
    }

    // Venue (by _id, separate from venueSlug lookups)
    if (isValidId(venueId)) {
      lookups.push(
        db
          .collection('venues')
          .findOne(
            { _id: new ObjectId(venueId) },
            { projection: { name: 1, slug: 1 } }
          )
          .then((doc) => {
            if (doc) result.venue = convertToJSON(doc);
          })
      );
    }

    // Company
    if (isValidId(companyId)) {
      lookups.push(
        db
          .collection('companies')
          .findOne(
            { _id: new ObjectId(companyId) },
            { projection: { name: 1 } }
          )
          .then((doc) => {
            if (doc) result.company = convertToJSON(doc);
          })
      );
    }

    // Job
    if (isValidId(jobId)) {
      lookups.push(
        db
          .collection('jobs')
          .findOne(
            { _id: new ObjectId(jobId) },
            { projection: { title: 1, jobSlug: 1 } }
          )
          .then((doc) => {
            if (doc) result.job = convertToJSON(doc);
          })
      );
    }

    await Promise.all(lookups);

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    console.error('[Activities Resolve API] Error:', (error as Error).message);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(resolveActivityRefsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
