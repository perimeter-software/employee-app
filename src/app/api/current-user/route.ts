import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
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
    const user = request.user;
    const userEmail = user.email!;

    // Connect to databases
    const { db, dbTenant, userDb } = await getTenantAwareConnection(request);

    // Get user info
    const userExists = await checkUserExistsByEmail(db, userEmail);
    if (!userExists) {
      return NextResponse.json(
        {
          success: false,
          error: 'user-not-found',
          message: 'User not found',
        },
        { status: 404 }
      );
    }

    // Check if user is from applicants (limited access) - no userType means from applicants
    const isLimitedAccess = !userExists.userType;
    
    let tenant = undefined;
    let availableTenants: EnhancedUser['availableTenants'] = [];

    // Only get tenant data for non-limited access users
    if (!isLimitedAccess) {
      const userMasterRecord = await checkUserMasterEmail(
        userDb,
        dbTenant,
        userEmail
      );
      
      if (userMasterRecord) {
        tenant = userMasterRecord.tenant;
        availableTenants = userMasterRecord.availableTenantObjects || [];
        
        // Store tenant data in Redis
        await redisService.setTenantData(
          userEmail.toLowerCase(),
          { tenant, availableTenants },
          60 * 60 * 24
        );
      }
    }

    // Return enhanced user data
    const enhancedUser: EnhancedUser = {
      _id: userExists._id,
      applicantId: userExists.applicantId,
      tenant,
      availableTenants,
      email: user.email,
      firstName: userExists.firstName,
      lastName: userExists.lastName,
      name: user.name,
      userType: userExists.userType,
      employeeType: userExists.employeeType,
      status: userExists.status,
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

// Export with enhanced auth wrapper (tenant optional for limited access users)
export const GET = withEnhancedAuthAPI(getUserDataHandler, {
  requireDatabaseUser: true,
  requireTenant: false,
});
