import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { mongoConn } from '@/lib/db';
import {
  checkUserExistsByEmail,
  checkUserMasterEmail,
} from '@/domains/user/utils';
import redisService from '@/lib/cache/redis-client';
import type { AuthenticatedRequest, EnhancedUser } from '@/domains/user/types';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getUserDataHandler(request: AuthenticatedRequest) {
  try {
    // User is authenticated AND exists in database AND has tenant access
    const user = request.user;
    const userEmail = user.email!;

    // Connect to databases (we know user exists because of withEnhancedAuth)
    const { db, dbTenant, userDb } = await mongoConn();

    // Get user and tenant info (we know they exist)
    const userExists = await checkUserExistsByEmail(db, userEmail);
    const userMasterRecord = await checkUserMasterEmail(
      userDb,
      dbTenant,
      userEmail
    );

    // Store tenant data in Redis
    const tenantData = {
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
    };

    await redisService.setTenantData(
      userEmail.toLowerCase(),
      tenantData,
      60 * 60 * 24
    );

    // Return enhanced user data
    const enhancedUser: EnhancedUser = {
      _id: userExists?._id,
      applicantId: userExists?.applicantId,
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
      email: user.email,
      firstName: userExists?.firstName,
      lastName: userExists?.lastName,
      name: user.name,
      userType: userExists?.userType,
      employeeType: userExists?.employeeType,
      status: userExists?.status,
    };

    return NextResponse.json({
      success: true,
      message: 'User data retrieved successfully',
      data: enhancedUser,
    });
  } catch (error) {
    console.error('User data API error:', error);
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
export const GET = withEnhancedAuthAPI(getUserDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
