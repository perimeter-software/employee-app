import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import { getEmployeePayrollHistory } from '@/domains/payroll/utils';
import type { AuthenticatedRequest } from '@/domains/user/types';

async function getEmployeePayrollHistoryHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const applicantId = user.applicantId;

    if (!applicantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'bad-request',
          message: 'No applicant ID found for this user',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Look up the applicant's PRISM employeeID for billing voucher cross-reference.
    // applicantId may be stored as an ObjectId or as a plain string — try both.
    let employeeID: string | undefined;
    let directDeposit: Record<string, unknown> | undefined;
    try {
      const { ObjectId } = await import('mongodb');
      const applicantDoc = await db
        .collection('applicants')
        .findOne(
          { _id: new ObjectId(applicantId) },
          { projection: { employeeID: 1, directDeposit: 1 } }
        );
      employeeID = applicantDoc?.employeeID;
      directDeposit = applicantDoc?.directDeposit;
    } catch {
      // Not a valid ObjectId — try matching as a plain string _id
      try {
        const applicantDoc = await db
          .collection('applicants')
          .findOne(
            { _id: applicantId as any },
            { projection: { employeeID: 1, directDeposit: 1 } }
          );
        employeeID = applicantDoc?.employeeID;
        directDeposit = applicantDoc?.directDeposit;
      } catch {
        // Proceed without employeeID; billing vouchers won't be fetched
      }
    }

    const payrollBatches = await getEmployeePayrollHistory(
      db,
      applicantId,
      employeeID
    );

    return NextResponse.json({
      success: true,
      message: 'Employee payroll history fetched successfully',
      data: {
        payrollBatches,
        count: payrollBatches.length,
        directDeposit,
      },
    });
  } catch (error) {
    console.error('Error fetching employee payroll history:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'internal-error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch employee payroll history',
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEmployeePayrollHistoryHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
