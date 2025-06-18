import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { getPerformanceMetrics } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getPerformanceMetricsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'startDate' | 'endDate'
    >;
    const { userId, startDate, endDate } = body;

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
