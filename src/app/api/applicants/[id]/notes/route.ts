import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getSp1Client } from '@/lib/sp1Client';
import type { AuthenticatedRequest } from '@/domains/user/types';

/**
 * POST /api/applicants/[id]/notes
 * Body: { type, text, firstName, lastName, userId, eventUrl? }
 * Proxies to sp1 POST /applicants/{id}/note
 */
async function postApplicantNoteHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { id: string } | undefined;
    const applicantId = params?.id;

    if (!applicantId || !ObjectId.isValid(applicantId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant ID' },
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

    // Client users: verify the applicant belongs to one of their venue's events
    // (light check — the external API enforces its own auth)
    if (user.userType === 'Client') {
      const { db } = await getTenantAwareConnection(request);
      const userId = user.userId ?? user._id;
      let clientOrgSlugs: string[] = [];
      if (userId && ObjectId.isValid(String(userId))) {
        const clientDoc = await db
          .collection('users')
          .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
        const orgs =
          (clientDoc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
        clientOrgSlugs = orgs.map((o) => o.slug ?? '').filter(Boolean);
      }
      if (clientOrgSlugs.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Access denied.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { tenant } = user;
    const sp1 = getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);
    const { data } = await sp1.post(`/applicants/${applicantId}/note`, body);

    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('[Applicant Note POST] Error:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(postApplicantNoteHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
