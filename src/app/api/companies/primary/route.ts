import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { findPrimaryCompany } from '@/domains/company';

async function getPrimaryCompanyHandler(request: AuthenticatedRequest) {
  try {
    // Connect to databases (works for both users and applicants)
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
    console.log('request.user', request.user)

    // Get peoIntegration from tenant data (similar to sp1-api)
    // For applicants, tenant data might not be fully populated, so use default
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

// Export with applicant-aware auth wrapper (allows both users and applicants)
// This endpoint doesn't require a database user, just tenant access
export const GET = withEnhancedAuthAPI(getPrimaryCompanyHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
