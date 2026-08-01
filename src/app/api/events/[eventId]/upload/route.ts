import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function uploadEventImageHandler(
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
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 }
      );
    }

    // Look up the event to get venueSlug + eventUrl for the upload path
    const { db } = await getTenantAwareConnection(request);
    const eventDoc = await db
      .collection('events')
      .findOne(
        { _id: new ObjectId(eventId) },
        { projection: { venueSlug: 1, eventUrl: 1 } }
      );

    if (!eventDoc) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    // For Client users: verify access
    if (user.userType === 'Client') {
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
          (clientDoc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
        clientOrgSlugs = clientOrgs.map((org) => org.slug ?? '').filter(Boolean);
      }
      if (!clientOrgSlugs.includes(String(eventDoc.venueSlug ?? ''))) {
        return NextResponse.json(
          { success: false, message: 'Access denied to this event.' },
          { status: 403 }
        );
      }
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid form data.' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;
    if (!file || !file.name) {
      return NextResponse.json(
        { success: false, message: 'No file provided.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([buffer], { type: file.type }), file.name);

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url, false);

    const venueSlug = String(eventDoc.venueSlug ?? '');
    const eventUrl = String(eventDoc.eventUrl ?? '');
    await sp1.post(`/upload/${venueSlug}/events/${eventUrl}`, uploadForm);

    return NextResponse.json({ success: true, filename: file.name }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[Event Upload API] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(uploadEventImageHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
