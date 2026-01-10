import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { findPrimaryCompany } from '@/domains/company';
import { checkUserMasterEmail } from '@/domains/user/utils';

async function getPrimaryCompanyHandler(request: AuthenticatedRequest) {
  try {
    // Check if user is limited access (no userType means from applicants collection)
    const isLimitedAccess = !request.user?.userType;
    
    if (isLimitedAccess) {
      // Return default for limited access users
      return NextResponse.json({
        success: true,
        message: 'Primary company (limited access)',
        data: {
          _id: '',
          name: '',
          peoIntegration: 'Helm',
        },
      });
    }

    // Connect to databases
    const { db, dbTenant, userDb } = await getTenantAwareConnection(request);
    const userEmail = request.user.email!;

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

    // Get peoIntegration from tenant data - fetch it if not in request.user.tenant
    let peoIntegration = request.user?.tenant?.peoIntegration;
    
    if (!peoIntegration) {
      // Fetch tenant data to get peoIntegration
      const userMasterRecord = await checkUserMasterEmail(
        userDb,
        dbTenant,
        userEmail
      );
      peoIntegration = userMasterRecord?.tenant?.peoIntegration || 'Helm';
    }

    return NextResponse.json({
      success: true,
      message: 'Primary company found',
      data: {
        ...primaryCompany,
        peoIntegration: peoIntegration || 'Helm',
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

// Export with enhanced auth wrapper (tenant optional for limited access users)
export const GET = withEnhancedAuthAPI(getPrimaryCompanyHandler, {
  requireDatabaseUser: true,
  requireTenant: false,
});
