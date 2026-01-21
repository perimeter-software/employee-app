import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { generateInsights } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getInsightsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'view' | 'selectedEmployeeId'
    >;
    const user = request.user;

    const { userId: requestUserId, view, selectedEmployeeId } = body;

    const userId = user._id || requestUserId;

    if (!userId || !view) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required parameters: userId and view',
          error: 'MISSING_PARAMETERS',
        },
        { status: 400 }
      );
    }

    // Only allow Client users to use employee filter
    if (selectedEmployeeId && user.userType !== 'Client') {
      return NextResponse.json(
        {
          success: false,
          message: 'Employee filter is only available for Client users',
          error: 'UNAUTHORIZED',
        },
        { status: 403 }
      );
    }

    // For Client users with selectedEmployeeId, use that instead of userId
    const targetUserId = selectedEmployeeId && user.userType === 'Client' 
      ? selectedEmployeeId 
      : userId;

    const { db } = await getTenantAwareConnection(request);
    const insights = await generateInsights(db, targetUserId, view);

    return NextResponse.json({
      success: true,
      data: insights,
      message: 'Insights retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Error getting insights:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : 'Failed to get insights',
        error: 'INSIGHTS_ERROR',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(getInsightsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
