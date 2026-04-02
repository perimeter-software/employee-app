import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  listPickupInterestSeekers,
  swapRequestErrorResponse,
} from '@/domains/swap/services/swap-request-service';

export const dynamic = 'force-dynamic';

async function getPickupSeekersHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobSlug = searchParams.get('jobSlug') || '';
    const shiftSlug = searchParams.get('shiftSlug') || '';
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');

    const { db } = await getTenantAwareConnection(request);
    const data = await listPickupInterestSeekers(db, request.user, {
      jobSlug,
      shiftSlug,
      ...(page ? { page: parseInt(page, 10) || 1 } : {}),
      ...(limit ? { limit: parseInt(limit, 10) || 8 } : {}),
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return swapRequestErrorResponse(error);
  }
}

export const GET = withEnhancedAuthAPI(getPickupSeekersHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
