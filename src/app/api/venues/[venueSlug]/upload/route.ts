import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };

async function uploadVenueAttachmentHandler(
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

    // Verify client has access to this venue
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

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid form data.' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    if (!file || !file.name) {
      return NextResponse.json({ success: false, message: 'No file provided.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([buffer], { type: file.type }), file.name);

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url, false);

    await sp1.post(`/upload/${venueSlug}/venues/other`, uploadForm);

    return NextResponse.json({ success: true, filename: file.name }, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error uploading venue attachment:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(uploadVenueAttachmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
