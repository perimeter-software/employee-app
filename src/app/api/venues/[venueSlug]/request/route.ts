import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getApplicantId } from '@/domains/venue/utils/mongo-venue-utils';
import { getSp1Client } from '@/lib/sp1Client';

// POST — request to join a venue
async function requestVenueHandler(
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

    const user = request.user;
    const applicantId = getApplicantId(user);

    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant session' },
        { status: 400 }
      );
    }

    const agentName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name ||
      user.email ||
      'Employee';
    const userId = (user._id as string) ?? applicantId;

    const { sub: userSub, email, tenant } = user;
    const sp1 = getSp1Client(userSub, email || '', tenant?.clientDomain || tenant?.url);

    const { data } = await sp1.put(`/applicants/${applicantId}/venue`, {
      venue: {
        status: 'Pending',
        venueSlug,
        agent: agentName,
        dateModified: new Date().toISOString(),
      },
      createAgent: userId,
      userId,
      agent: agentName,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Venue Request] Error:', error);
    const axiosError = error as {
      response?: { status?: number; data?: unknown };
    };
    const status = axiosError.response?.status ?? 500;
    return NextResponse.json(
      axiosError.response?.data ?? {
        success: false,
        message: 'Internal server error',
      },
      { status }
    );
  }
}

// DELETE — cancel a pending request OR leave a StaffingPool venue
async function cancelVenueRequestHandler(
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

    const user = request.user;
    const applicantId = getApplicantId(user);

    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant session' },
        { status: 400 }
      );
    }

    const agentName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name ||
      user.email ||
      'Employee';
    const userId = (user._id as string) ?? applicantId;

    const { sub: userSub, email, tenant } = user;
    const sp1 = getSp1Client(userSub, email || '', tenant?.clientDomain || tenant?.url);

    const { data } = await sp1.put(`/applicants/${applicantId}/venue`, {
      venue: {
        status: 'Delete',
        venueSlug,
        agent: agentName,
        dateModified: new Date().toISOString(),
      },
      createAgent: userId,
      userId,
      agent: agentName,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Venue Cancel] Error:', error);
    const axiosError = error as {
      response?: { status?: number; data?: unknown };
    };
    const status = axiosError.response?.status ?? 500;
    return NextResponse.json(
      axiosError.response?.data ?? {
        success: false,
        message: 'Internal server error',
      },
      { status }
    );
  }
}

export const POST = withEnhancedAuthAPI(requestVenueHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

export const DELETE = withEnhancedAuthAPI(cancelVenueRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
