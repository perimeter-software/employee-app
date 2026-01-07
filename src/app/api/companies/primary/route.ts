import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { findPrimaryCompany } from '@/domains/company';

async function getPrimaryCompanyHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const isLimitedAccess = user.isLimitedAccess || false;
    
    // For limited-access users, use default database connection
    let db;
    if (isLimitedAccess) {
      const { mongoConn } = await import('@/lib/db/mongodb');
      const connection = await mongoConn();
      db = connection.db;
    } else {
      // For full-access users, use tenant-aware connection
      const connection = await getTenantAwareConnection(request);
      db = connection.db;
    }

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
    // For limited-access users, default to 'Prism' since they only have paycheck stub access
    const peoIntegration = isLimitedAccess 
      ? 'Prism' 
      : (request.user?.tenant?.peoIntegration || 'Helm');

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

// Export with enhanced auth wrapper (allows limited-access users)
export const GET = withEnhancedAuthAPI(getPrimaryCompanyHandler, {
  requireDatabaseUser: false, // Allow limited-access users (applicants)
  requireTenant: false, // Limited-access users don't need tenant
});
