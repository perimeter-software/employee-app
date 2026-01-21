import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams, DashboardData } from '@/domains/dashboard/types';
import {
  calculateDashboardStats,
  getAttendanceData,
  getPerformanceMetrics,
  generateInsights,
  getTodayAttendanceData,
} from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getDashboardDataHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as DashboardParams;

    const user = request.user;

    const {
      view,
      startDate,
      endDate,
      userId: requestUserId,
      weekStartsOn = 0,
      selectedEmployeeId,
    } = body;

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

    // Get all dashboard data in parallel
    const [stats, attendanceData, performanceData, insights, todayAttendance] =
      await Promise.all([
        calculateDashboardStats(
          db,
          userId,
          view,
          startDate,
          endDate,
          weekStartsOn,
          selectedEmployeeId
        ),
        getAttendanceData(db, userId, view, startDate, endDate, weekStartsOn, selectedEmployeeId),
        getPerformanceMetrics(db, userId, startDate, endDate, weekStartsOn, selectedEmployeeId),
        generateInsights(db, userId, view),
        getTodayAttendanceData(db),
      ]);

    const dashboardData: DashboardData = {
      stats,
      monthlyAttendance: attendanceData.monthlyAttendance,
      weeklyTrends: attendanceData.weeklyTrends,
      performanceMetrics: performanceData.performanceMetrics,
      shiftDetails: performanceData.shiftDetails,
      todayAttendance,
      insights,
    };

    return NextResponse.json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Error getting dashboard data:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to get dashboard data',
        error: 'DASHBOARD_DATA_ERROR',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(getDashboardDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
