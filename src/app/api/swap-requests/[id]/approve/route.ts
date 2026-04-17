import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  approveSwapRequest,
  swapRequestErrorResponse,
} from '@/domains/swap';

export const dynamic = 'force-dynamic';

async function patchApproveHandler(
  _request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    if (!id) {
      return NextResponse.json(
        { error: 'missing-id', message: 'Swap request id is required.' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(_request);
    const data = await approveSwapRequest(db, _request.user, id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return swapRequestErrorResponse(error);
  }
}

export const PATCH = withEnhancedAuthAPI(patchApproveHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
