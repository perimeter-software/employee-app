import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { findPrimaryCompany } from '@/domains/company';

async function getPrimaryCompanyHandler(request: AuthenticatedRequest) {
  try {
    // Connect to databases
    const { db } = await getTenantAwareConnection(request);

    // Get primary company
    const primaryCompany = await findPrimaryCompany(db);

    if (!primaryCompany) {
      return NextResponse.json(
        {
          success: false,
          error: 'not-found',
          message: 'Primary company not found',
        },
        { status: 404 }
      );
    }

    // Get peoIntegration from tenant data (similar to sp1-api)
    // The tenant data is available in request.user.tenant from the middleware
    const peoIntegration = request.user?.tenant?.peoIntegration || 'Helm';

    return NextResponse.json({
      success: true,
      message: 'Primary company found',
      data: {
        ...primaryCompany,
        peoIntegration,
      },
    });
  } catch (error) {
    console.error('Primary company API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper (validates database user AND tenant)
export const GET = withEnhancedAuthAPI(getPrimaryCompanyHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
