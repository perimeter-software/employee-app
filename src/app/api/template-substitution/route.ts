import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type RequestBody = {
  selectedTemplate?: string;
  applicantId?: string;
  venueSlug?: string;
};

type UserDoc = {
  _id: ObjectId;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  email?: string;
  userType?: string;
  userId?: string;
  [key: string]: unknown;
};

async function templateSubstitutionHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (!user?.sub || !user?.email) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }

    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
    }

    const { selectedTemplate, applicantId, venueSlug } = body;

    if (!selectedTemplate) {
      return NextResponse.json({ success: false, message: 'selectedTemplate is required.' }, { status: 400 });
    }

    const { db } = await getTenantAwareConnection(request);

    // Look up full user doc for emailAddress and other fields the backend needs
    const userId = user.userId ?? user._id;
    let userDoc: UserDoc | null = null;
    if (userId && ObjectId.isValid(String(userId))) {
      userDoc = await db
        .collection('users')
        .findOne({ _id: new ObjectId(String(userId)) }) as UserDoc | null;
    }

    // Look up venueId from venueSlug
    let venueId: string | null = null;
    if (venueSlug) {
      const venueDoc = await db
        .collection('venues')
        .findOne({ slug: venueSlug }, { projection: { _id: 1 } });
      if (venueDoc?._id) {
        venueId = venueDoc._id.toString();
      }
    }

    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);

    const userPayload = {
      _id: userDoc?._id?.toString() ?? String(userId ?? ''),
      firstName: userDoc?.firstName ?? user.firstName ?? '',
      lastName: userDoc?.lastName ?? user.lastName ?? '',
      userType: userDoc?.userType ?? user.userType ?? '',
      emailAddress: userDoc?.emailAddress ?? userDoc?.email ?? user.email ?? '',
      userId: userDoc?.userId ?? user.email ?? '',
    };

    const payload = {
      selectedTemplate,
      applicantId: applicantId ?? null,
      user: userPayload,
      venueId: venueId ?? null,
      companyId: null,
      partnerId: null,
      createAgent: userPayload._id,
    };

    const res = await sp1.post('/sendmessage/substitution', payload);
    return NextResponse.json(res.data, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching template substitution:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(templateSubstitutionHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
