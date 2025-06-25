import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { getPerformanceMetrics } from '@/domains/dashboard/utils/mongo-dashboard-utils';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getPerformanceMetricsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'startDate' | 'endDate'
    >;
    const user = request.user;

    const { userId: requestUserId, startDate, endDate } = body;

    const userId = user._id || requestUserId;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required parameter: userId',
          error: 'MISSING_PARAMETERS',
        },
        { status: 400 }
      );
    }

    const { db } = await mongoConn();
    const performanceData = await getPerformanceMetrics(
      db,
      userId,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      data: performanceData,
      message: 'Performance metrics retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Error getting performance metrics:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to get performance metrics',
        error: 'PERFORMANCE_METRICS_ERROR',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(getPerformanceMetricsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
