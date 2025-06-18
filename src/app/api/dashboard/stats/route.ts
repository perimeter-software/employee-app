import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { calculateDashboardStats } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getDashboardStatsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'view' | 'startDate' | 'endDate'
    >;
    const { userId, view, startDate, endDate } = body;

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

    const { db } = await mongoConn();
    const stats = await calculateDashboardStats(
      db,
      userId,
      view,
      startDate,
      endDate
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
