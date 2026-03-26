import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

type SwapRequestDocument = {
  _id?: ObjectId;
  fromEmployeeId: string;
  status: 'pending_match' | 'pending_approval' | 'approved' | 'rejected' | 'withdrawn';
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: {
    reason?: string;
    notes?: string;
  };
};

const ADMIN_USER_TYPES = new Set(['Admin', 'Master']);

function getUserId(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

async function deleteSwapRequestHandler(
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

    const currentUserId = getUserId(request.user);
    if (!currentUserId) {
      return NextResponse.json(
        {
          error: 'missing-identifiers',
          message: 'Missing user identifier.',
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

    const isAdmin = ADMIN_USER_TYPES.has(String(request.user.userType));
    const isOwner = existing.fromEmployeeId === currentUserId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'You can only withdraw your own swap requests.',
        },
        { status: 403 }
      );
    }

    if (existing.status !== 'pending_match' && existing.status !== 'pending_approval') {
      return NextResponse.json(
        {
          error: 'invalid-status',
          message: 'Only pending requests can be withdrawn.',
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
          status: 'withdrawn',
          resolvedAt: new Date(),
          resolvedBy: currentUserId,
          resolution: {
            reason: 'withdrawn',
            notes: 'Request withdrawn by user',
          },
        },
      },
      { returnDocument: 'after' }
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Swap request withdrawn successfully.',
        data: convertToJSON(result),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Swap Requests API] DELETE error:', error);
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

export const DELETE = withEnhancedAuthAPI(deleteSwapRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
