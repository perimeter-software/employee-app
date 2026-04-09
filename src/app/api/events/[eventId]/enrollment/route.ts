import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  applyEnrollmentChange,
  getEnrollmentForApplicant,
} from '@/domains/event/services/event-enrollment-service';

async function getEnrollmentHandler(
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

    const applicantId = request.user.applicantId
      ? String(request.user.applicantId)
      : '';
    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const data = await getEnrollmentForApplicant(db, eventId, applicantId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('[Enrollment GET] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

async function putEnrollmentHandler(
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

    const applicantId = request.user.applicantId
      ? String(request.user.applicantId)
      : '';
    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      requestType?: string;
      positionName?: string;
    };

    const { db } = await getTenantAwareConnection(request);
    const data = await applyEnrollmentChange(db, eventId, applicantId, {
      requestType: String(body.requestType || ''),
      positionName: body.positionName,
    });
    if (data.status === 'Error') {
      return NextResponse.json(
        {
          success: false,
          message: data.message || 'Enrollment could not be completed.',
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('[Enrollment PUT] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

export const PUT = withEnhancedAuthAPI(putEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
