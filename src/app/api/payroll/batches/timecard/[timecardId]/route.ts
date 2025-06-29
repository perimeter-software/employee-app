import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { checkTimecardInProcessedBatch } from '@/domains/payroll/utils';
import type { AuthenticatedRequest } from '@/domains/user/types';

// GET Handler for checking if a timecard is in a processed payroll batch
async function checkTimecardPayrollStatusHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as
      | { timecardId: string }
      | undefined;
    const timecardId = params?.timecardId;

    if (!timecardId) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing-parameters',
          message: 'Missing timecard ID parameter',
        },
        { status: 400 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Use the utility function to check timecard status
    const result = await checkTimecardInProcessedBatch(db, timecardId);

    return NextResponse.json(
      {
        success: true,
        message: 'Timecard payroll status checked successfully',
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Error checking timecard payroll status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(checkTimecardPayrollStatusHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
