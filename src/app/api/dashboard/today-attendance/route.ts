import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getTodayAttendanceData } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getTodayAttendanceHandler(request: AuthenticatedRequest) {
  try {
    const { db } = await getTenantAwareConnection(request);
    const todayAttendance = await getTodayAttendanceData(db);

    return NextResponse.json({
      success: true,
      data: todayAttendance,
      message: "Today's attendance data retrieved successfully",
    });
  } catch (error) {
    console.error("❌ Error getting today's attendance data:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get today's attendance data",
        error: 'TODAY_ATTENDANCE_ERROR',
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getTodayAttendanceHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
