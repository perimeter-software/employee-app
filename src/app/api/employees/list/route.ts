import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

// GET Handler for Getting List of Employees (for Client role)
async function getEmployeesListHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    // Only allow Client role to access this endpoint
    if (user.userType !== 'Client') {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Access denied. Client role required.',
        },
        { status: 403 }
      );
    }

    // Connect to tenant-specific database
    const { db } = await getTenantAwareConnection(request);

    // Fetch all users with applicantId (employees)
    const users = await db
      .collection('users')
      .find({
        applicantId: { $exists: true, $ne: null },
        userType: { $ne: 'Client' }, // Exclude Client users
      })
      .project({
        _id: 1,
        firstName: 1,
        lastName: 1,
        emailAddress: 1,
        applicantId: 1,
      })
      .sort({ firstName: 1, lastName: 1 })
      .toArray();

    // Convert and format employee list
    const employees = users
      .map((user) => {
        const converted = convertToJSON(user) as {
          _id?: string;
          firstName?: string;
          lastName?: string;
          emailAddress?: string;
          applicantId?: string;
        };

        if (!converted || !converted._id) return null;

        return {
          _id: converted._id.toString(),
          firstName: converted.firstName || '',
          lastName: converted.lastName || '',
          email: converted.emailAddress || '',
          fullName: `${converted.firstName || ''} ${converted.lastName || ''}`.trim() || converted.emailAddress || 'Unknown',
        };
      })
      .filter((emp): emp is NonNullable<typeof emp> => emp !== null);

    return NextResponse.json(
      {
        success: true,
        message: 'Employees list retrieved successfully',
        count: employees.length,
        data: employees,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching employees list:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(getEmployeesListHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
