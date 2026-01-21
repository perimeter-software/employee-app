import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { getPerformanceMetrics } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getPerformanceMetricsHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'startDate' | 'endDate' | 'weekStartsOn' | 'selectedEmployeeId'
    >;
    const user = request.user;

    const { userId: requestUserId, startDate, endDate, weekStartsOn = 0, selectedEmployeeId } = body;

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
    const performanceData = await getPerformanceMetrics(
      db,
      userId,
      startDate,
      endDate,
      weekStartsOn,
      selectedEmployeeId
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
