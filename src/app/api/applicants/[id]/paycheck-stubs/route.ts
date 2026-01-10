import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';

async function getPaycheckStubsHandler(
  request: AuthenticatedRequest,
  context: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  try {
    const params = await context.params;
    const id = typeof params.id === 'string' ? params.id : params.id?.[0];
    const { db } = await getTenantAwareConnection(request);

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

    // Get paycheck stubs from MongoDB
    const PaycheckStubs = db.collection('paycheck-stubs');
    const paycheckStubs = await PaycheckStubs.find(
      { applicantId: id },
      { sort: { checkDate: -1 } } // Sort by checkDate descending (newest first)
    ).toArray();

    return NextResponse.json({
      success: true,
      message: 'Paycheck stubs fetched successfully',
      data: paycheckStubs,
    });
  } catch (error) {
    console.error('Error fetching paycheck stubs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch paycheck stubs',
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getPaycheckStubsHandler, {
  requireDatabaseUser: true,
  requireTenant: false,
});

