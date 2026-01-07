import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { ObjectId } from 'mongodb';

async function updatePaycheckStubViewStatusHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    const stubId = typeof params.stubId === 'string' ? params.stubId : params.stubId?.[0];
    
    // For limited-access users (applicants), use default database connection
    const user = request.user;
    const isLimitedAccess = user.isLimitedAccess || false;
    
    let db;
    if (isLimitedAccess) {
      // Use default database connection for applicants
      const { mongoConn } = await import('@/lib/db/mongodb');
      const connection = await mongoConn();
      db = connection.db;
    } else {
      // Use tenant-aware connection for regular users
      const connection = await getTenantAwareConnection(request);
      db = connection.db;
    }
    const body = await request.json();
    const { viewStatus } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Missing applicant id',
        },
        { status: 400 }
      );
    }

    if (!stubId) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Missing paycheck stub id',
        },
        { status: 400 }
      );
    }

    if (!viewStatus) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'Missing viewStatus',
        },
        { status: 400 }
      );
    }

    // Update paycheck stub view status
    const PaycheckStubs = db.collection('paycheck-stubs');
    const result = await PaycheckStubs.updateOne(
      { _id: new ObjectId(stubId), applicantId: id },
      { $set: { viewStatus } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Paycheck stub not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'View status updated successfully',
      data: { message: 'View status updated successfully' },
    });
  } catch (error) {
    console.error('Error updating paycheck stub view status:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to update view status',
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const PUT = withEnhancedAuthAPI(updatePaycheckStubViewStatusHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

