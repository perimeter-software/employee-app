import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

type RejectBody = {
  reason?: string;
  notes?: string;
};

type SwapRequestDocument = {
  _id?: ObjectId;
  status: 'pending_match' | 'pending_approval' | 'approved' | 'rejected';
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: {
    reason?: string;
    notes?: string;
  };
};

const ADMIN_USER_TYPES = new Set(['Admin', 'Master']);

function getResolverIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user._id) return String(user._id);
  if (user.userId) return String(user.userId);
  if (user.applicantId) return String(user.applicantId);
  return 'unknown-admin';
}

async function rejectSwapRequestHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    if (!ADMIN_USER_TYPES.has(String(request.user.userType))) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Only admins can reject swap requests.',
        },
        { status: 403 }
      );
    }

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

    const body = (await request.json().catch(() => ({}))) as RejectBody;

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

    if (
      existing.status !== 'pending_approval' &&
      existing.status !== 'pending_match'
    ) {
      return NextResponse.json(
        {
          error: 'invalid-status',
          message: 'Only pending requests can be rejected.',
        },
        { status: 400 }
      );
    }

    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        status: { $in: ['pending_match', 'pending_approval'] },
      },
      {
        $set: {
          status: 'rejected',
          resolvedAt: new Date(),
          resolvedBy: getResolverIdFromUser(request.user),
          resolution: {
            reason: typeof body.reason === 'string' ? body.reason.trim() : '',
            notes: typeof body.notes === 'string' ? body.notes.trim() : '',
          },
        },
      },
      { returnDocument: 'after' }
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Swap request rejected successfully.',
        data: convertToJSON(result),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Swap Requests API] REJECT error:', error);
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

export const PATCH = withEnhancedAuthAPI(rejectSwapRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
