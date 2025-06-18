import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
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
    const { view, startDate, endDate, userId } = body;

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

    // Get all dashboard data in parallel
    const [stats, attendanceData, performanceData, insights, todayAttendance] =
      await Promise.all([
        calculateDashboardStats(db, userId, view, startDate, endDate),
        getAttendanceData(db, userId, view, startDate, endDate),
        getPerformanceMetrics(db, userId, startDate, endDate),
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
