import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import { getTodayAttendanceData } from '@/domains/dashboard/utils/mongo-dashboard-utils';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getTodayAttendanceHandler() {
  try {
    const { db } = await mongoConn();
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
