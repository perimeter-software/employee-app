import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  createSwapRequest,
  listSwapRequests,
  swapRequestErrorResponse,
  type CreateSwapRequestInput,
} from '@/domains/swap';

export const dynamic = 'force-dynamic';

async function getSwapRequestsHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');

    const { db } = await getTenantAwareConnection(request);
    const data = await listSwapRequests(db, request.user, {
      employeeId,
      status,
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return swapRequestErrorResponse(error);
  }
}

async function postSwapRequestHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as CreateSwapRequestInput;
    const { db } = await getTenantAwareConnection(request);
    const data = await createSwapRequest(db, request.user, body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return swapRequestErrorResponse(error);
  }
}

export const GET = withEnhancedAuthAPI(getSwapRequestsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const POST = withEnhancedAuthAPI(postSwapRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
