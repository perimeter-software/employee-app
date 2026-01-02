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
  requireTenant: true,
});

