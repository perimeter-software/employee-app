import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

type SwapRequestDocument = {
  _id?: ObjectId;
  toEmployeeId?: string;
  status: 'pending_match' | 'pending_approval' | 'approved' | 'rejected';
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: {
    reason?: string;
    notes?: string;
  };
};

function getEmployeeIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

async function acceptSwapRequestHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          error: 'invalid-id',
          message: 'Invalid swap request id.',
        },
        { status: 400 }
      );
    }

    const employeeId = getEmployeeIdFromUser(request.user);
    if (!employeeId) {
      return NextResponse.json(
        {
          error: 'missing-identifiers',
          message: 'Missing employee identifier.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const collection = db.collection<SwapRequestDocument>('swap_requests');
    const existing = await collection.findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return NextResponse.json(
        {
          error: 'not-found',
          message: 'Swap request not found.',
        },
        { status: 404 }
      );
    }

    if (existing.status !== 'pending_match') {
      return NextResponse.json(
        {
          error: 'invalid-status',
          message: 'Only pending_match requests can be accepted.',
        },
        { status: 400 }
      );
    }

    if (existing.toEmployeeId && existing.toEmployeeId !== employeeId) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Only the targeted employee can accept this request.',
        },
        { status: 403 }
      );
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id), status: 'pending_match' },
      {
        $set: {
          toEmployeeId: employeeId,
          status: 'pending_approval',
        },
        $unset: {
          resolvedAt: '',
          resolvedBy: '',
          resolution: '',
        },
      },
      { returnDocument: 'after' }
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Swap request accepted and moved to pending approval.',
        data: convertToJSON(result),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Swap Requests API] ACCEPT error:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const PATCH = withEnhancedAuthAPI(acceptSwapRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
