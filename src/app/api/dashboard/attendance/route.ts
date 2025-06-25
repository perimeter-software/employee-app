import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { DashboardParams } from '@/domains/dashboard/types';
import { getAttendanceData } from '@/domains/dashboard/utils/mongo-dashboard-utils';

async function getAttendanceDataHandler(request: AuthenticatedRequest) {
  try {
    const body = (await request.json()) as Pick<
      DashboardParams,
      'userId' | 'view' | 'startDate' | 'endDate'
    >;
    const user = request.user;

    const { userId: requestUserId, view, startDate, endDate } = body;

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

    const { db } = await mongoConn();
    const attendanceData = await getAttendanceData(
      db,
      userId,
      view,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      data: attendanceData,
      message: 'Attendance data retrieved successfully',
    });
  } catch (error) {
    console.error('❌ Error getting attendance data:', error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to get attendance data',
        error: 'ATTENDANCE_DATA_ERROR',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(getAttendanceDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
