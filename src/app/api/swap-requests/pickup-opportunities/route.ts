import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  listPickupOpportunities,
  swapRequestErrorResponse,
} from '@/domains/swap/services/swap-request-service';

export const dynamic = 'force-dynamic';

async function getPickupOpportunitiesHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobSlug = searchParams.get('jobSlug') || '';
    const shiftSlug = searchParams.get('shiftSlug') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const { db } = await getTenantAwareConnection(request);
    const data = await listPickupOpportunities(db, request.user, {
      jobSlug,
      shiftSlug,
      startDate,
      endDate,
    });

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    return swapRequestErrorResponse(error);
  }
}

export const GET = withEnhancedAuthAPI(getPickupOpportunitiesHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
