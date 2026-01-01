import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { ObjectId } from 'mongodb';

async function updatePaycheckStubViewStatusHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<{ id: string; stubId: string }> }
) {
  try {
    const { id, stubId } = await context.params;
    const { db } = await getTenantAwareConnection(request);
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

