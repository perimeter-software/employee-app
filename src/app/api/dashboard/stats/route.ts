import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { calculateDashboardStats } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getDashboardStatsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'view' | 'startDate' | 'endDate' | 'weekStartsOn' | 'selectedEmployeeId'
    >;
    const user = request.user;

    const { userId: requestUserId, view, startDate, endDate, weekStartsOn = 0, selectedEmployeeId } = body;

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

    const { db } = await getTenantAwareConnection(request);
    const stats = await calculateDashboardStats(
      db,
      userId,
      view,
      startDate,
      endDate,
      weekStartsOn,
      selectedEmployeeId
    );

    return NextResponse.json({
      success: true,
      data: stats,
      message: 'Dashboard stats retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Error getting dashboard stats:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to get dashboard stats',
        error: 'DASHBOARD_STATS_ERROR',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(getDashboardStatsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
