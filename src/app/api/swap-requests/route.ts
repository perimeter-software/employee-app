import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type {
  SwapRequestStatus,
  SwapRequestType,
} from '@/domains/swap/types';

type CreateSwapRequestBody = {
  type: SwapRequestType;
  fromShiftDayId?: string;
  toEmployeeId?: string;
  toShiftDayId?: string;
  acceptAny?: boolean;
  taggedOnly?: boolean;
  notes?: string;
};

type SwapRequestDocument = {
  _id?: ObjectId;
  tenantId: string;
  type: SwapRequestType;
  status: SwapRequestStatus;
  fromEmployeeId: string;
  fromShiftDayId?: string;
  toEmployeeId?: string;
  toShiftDayId?: string;
  acceptAny?: boolean;
  taggedOnly?: boolean;
  notes?: string;
  submittedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: {
    reason?: string;
    notes?: string;
  };
};

const ADMIN_USER_TYPES = new Set(['Admin', 'Master']);

function getEmployeeIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

function getTenantIdFromUser(user: AuthenticatedRequest['user']): string {
  const tenantDbName = user.tenant?.dbName;
  const tenantUrl = user.tenant?.url;
  return String(tenantDbName || tenantUrl || 'unknown-tenant');
}

function normalizeStatusParam(raw: string | null): SwapRequestStatus | null {
  if (!raw) return null;
  const value = raw.trim() as SwapRequestStatus;
  const valid: SwapRequestStatus[] = [
    'draft',
    'pending_match',
    'pending_approval',
    'approved',
    'rejected',
    'expired',
    'withdrawn',
  ];
  return valid.includes(value) ? value : null;
}

async function createSwapRequestHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    if (user.userType === 'Client') {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Access denied. Employee account required.',
        },
        { status: 403 }
      );
    }

    const fromEmployeeId = getEmployeeIdFromUser(user);
    if (!fromEmployeeId) {
      return NextResponse.json(
        {
          error: 'missing-identifiers',
          message: 'Missing employee identifier for swap request.',
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CreateSwapRequestBody;
    const {
      type,
      fromShiftDayId,
      toEmployeeId,
      toShiftDayId,
      acceptAny,
      taggedOnly,
      notes,
    } = body;

    if (!type || !['swap', 'giveaway', 'pickup'].includes(type)) {
      return NextResponse.json(
        {
          error: 'invalid-type',
          message: 'type must be one of: swap, giveaway, pickup.',
        },
        { status: 400 }
      );
    }

    if (!fromShiftDayId && type !== 'pickup') {
      return NextResponse.json(
        {
          error: 'missing-from-shift-day',
          message: 'fromShiftDayId is required for swap and giveaway requests.',
        },
        { status: 400 }
      );
    }

    if (type === 'swap' && !toEmployeeId) {
      return NextResponse.json(
        {
          error: 'missing-target-employee',
          message: 'toEmployeeId is required for swap requests.',
        },
        { status: 400 }
      );
    }

    const tenantId = getTenantIdFromUser(user);
    const status: SwapRequestStatus =
      type === 'pickup' && acceptAny ? 'pending_approval' : 'pending_match';

    const doc: SwapRequestDocument = {
      tenantId,
      type,
      status,
      fromEmployeeId,
      fromShiftDayId,
      toEmployeeId,
      toShiftDayId,
      acceptAny: Boolean(acceptAny),
      taggedOnly: Boolean(taggedOnly),
      notes: typeof notes === 'string' ? notes.trim() : undefined,
      submittedAt: new Date(),
    };

    const { db } = await getTenantAwareConnection(request);
    const result = await db.collection<SwapRequestDocument>('swap_requests').insertOne(doc);

    const created = await db
      .collection<SwapRequestDocument>('swap_requests')
      .findOne({ _id: result.insertedId });

    return NextResponse.json(
      {
        success: true,
        message: 'Swap request created successfully.',
        data: convertToJSON(created),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Swap Requests API] POST error:', error);
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

async function getSwapRequestsHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();
    const tenantId = request.nextUrl.searchParams.get('tenantId')?.trim();
    const status = normalizeStatusParam(
      request.nextUrl.searchParams.get('status')
    );

    const canViewAll = ADMIN_USER_TYPES.has(String(user.userType));

    if ((tenantId || status) && !canViewAll) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Only administrators can query tenant-level swap requests.',
        },
        { status: 403 }
      );
    }

    const selfEmployeeId = getEmployeeIdFromUser(user);
    const effectiveEmployeeId =
      employeeId && canViewAll ? employeeId : selfEmployeeId;

    const query: Partial<SwapRequestDocument> = {};
    if (tenantId && canViewAll) {
      query.tenantId = tenantId;
    } else if (!canViewAll) {
      query.tenantId = getTenantIdFromUser(user);
    }

    if (status) query.status = status;
    if (effectiveEmployeeId) query.fromEmployeeId = effectiveEmployeeId;

    const { db } = await getTenantAwareConnection(request);
    const requests = await db
      .collection<SwapRequestDocument>('swap_requests')
      .find(query)
      .sort({ submittedAt: -1 })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        message: 'Swap requests retrieved successfully.',
        count: requests.length,
        data: requests.map((r) => convertToJSON(r)),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Swap Requests API] GET error:', error);
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

export const POST = withEnhancedAuthAPI(createSwapRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const GET = withEnhancedAuthAPI(getSwapRequestsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
