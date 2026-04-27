import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

type ClientOrg = { slug?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };
type UserDoc = {
  _id?: unknown;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailAddress?: string;
  userId?: string;
};
type VenueDoc = { _id?: unknown };

type BulkMessageBody = {
  applicantIdList?: string[];
  sendEmail?: boolean;
  sendText?: boolean;
  sendSystem?: boolean;
  subject?: string;
  messageBody?: string;
  selectedTemplate?: string;
  attachments?: unknown[];
  copySender?: boolean;
  ccList?: string[];
  bccList?: string[];
  suppressFooter?: boolean;
  addAsCC?: boolean;
};

async function bulkMessageHandler(
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

    const { db } = await getTenantAwareConnection(request);
    const userId = user.userId ?? user._id;

    // Verify client venue access
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

    let body: BulkMessageBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid request body.' },
        { status: 400 }
      );
    }

    if (!body.applicantIdList?.length) {
      return NextResponse.json(
        { success: false, message: 'No recipients selected.' },
        { status: 400 }
      );
    }

    // Resolve user details and venueId from DB in parallel
    let userDoc: UserDoc | null = null;
    let venueDoc: VenueDoc | null = null;

    await Promise.all([
      (async () => {
        if (userId && ObjectId.isValid(String(userId))) {
          userDoc = (await db
            .collection('users')
            .findOne(
              { _id: new ObjectId(String(userId)) },
              {
                projection: {
                  firstName: 1,
                  lastName: 1,
                  email: 1,
                  emailAddress: 1,
                  userId: 1,
                },
              }
            )) as UserDoc | null;
        }
      })(),
      (async () => {
        venueDoc = (await db
          .collection('venues')
          .findOne(
            { slug: venueSlug },
            { projection: { _id: 1 } }
          )) as VenueDoc | null;
      })(),
    ]);

    const firstName = userDoc?.firstName ?? '';
    const lastName = userDoc?.lastName ?? '';
    const fromEmail = userDoc?.emailAddress ?? userDoc?.email ?? user.email;
    const agentId = userDoc?._id ? String(userDoc._id) : String(userId ?? '');
    const venueId = venueDoc?._id ? String(venueDoc._id) : undefined;

    const sender = { userId: agentId, fromEmail, firstName, lastName };
    const userPayload = {
      _id: agentId,
      firstName,
      lastName,
      userType: user.userType,
      emailAddress: fromEmail,
      userId: agentId,
    };

    const basePayload = {
      sender,
      user: userPayload,
      venueId,
      applicantIdList: body.applicantIdList,
      selectedTemplate: body.selectedTemplate ?? 'Custom Message',
      subject: body.subject ?? '',
      messageBody: body.messageBody ?? '',
      attachments: body.attachments ?? [],
      suppressFooter: body.suppressFooter ?? false,
      addAsCC: body.addAsCC ?? false,
    };

    const { tenant } = user;
    const sp1 = getSp1Client(
      user.sub,
      user.email,
      tenant?.clientDomain || tenant?.url
    );

    const sends: Promise<unknown>[] = [];

    if (body.sendEmail) {
      sends.push(
        sp1.post('/sendmessage/type/email/bulk', {
          ...basePayload,
          copySender: body.copySender ?? false,
          ...(body.ccList?.length ? { ccList: body.ccList } : {}),
          ...(body.bccList?.length ? { bccList: body.bccList } : {}),
        })
      );
    }
    if (body.sendText) {
      sends.push(sp1.post('/sendmessage/type/text/bulk', basePayload));
    }
    if (body.sendSystem) {
      sends.push(sp1.post('/sendmessage/type/system/bulk', basePayload));
    }

    if (!sends.length) {
      return NextResponse.json(
        { success: false, message: 'No message channel selected.' },
        { status: 400 }
      );
    }

    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === 'rejected');

    if (failed.length === results.length) {
      const e = (failed[0] as PromiseRejectedResult).reason as {
        response?: { data?: unknown };
        message?: string;
      };
      return NextResponse.json(
        e.response?.data ?? {
          success: false,
          message: 'Failed to send bulk message.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    console.error('Error sending bulk message:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(bulkMessageHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
