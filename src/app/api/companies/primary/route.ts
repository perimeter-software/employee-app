import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import { findPrimaryCompany } from '@/domains/company';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getPrimaryCompanyHandler() {
  try {
    // Connect to databases
    const { db } = await mongoConn();

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

    return NextResponse.json({
      success: true,
      message: 'Primary company found',
      data: primaryCompany,
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
