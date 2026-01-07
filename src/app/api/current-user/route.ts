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
    // User is authenticated
    const user = request.user;
    const userEmail = user.email!;
    const isLimitedAccess = user.isLimitedAccess || false;

    // For limited-access users (applicants or Terminated/Inactive employees)
    if (isLimitedAccess) {
      const { db } = await getTenantAwareConnection(request);
      
      // Check if user is from applicants table (userId starts with "applicant_")
      let applicantId: string | undefined = undefined;
      if (user.sub?.startsWith('applicant_')) {
        // Extract applicantId from userId (format: "applicant_<id>")
        applicantId = user.sub.replace('applicant_', '');
      } else {
        // Try to find applicant by email
        const Applicants = db.collection('applicants');
        const applicant = await Applicants.findOne<{ _id: { toString(): string } | string }>(
          { 
            email: userEmail,
            status: 'Employee'
          },
          { 
            projection: { _id: 1 } 
          }
        );
        if (applicant && applicant._id) {
          applicantId = typeof applicant._id === 'string' 
            ? applicant._id 
            : (applicant._id as { toString(): string }).toString();
        }
      }

      const enhancedUser: EnhancedUser = {
        _id: user.sub,
        applicantId: applicantId, // For applicants, this is their _id in applicants table
        tenant: undefined,
        availableTenants: [],
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        userType: undefined,
        employeeType: undefined,
        status: (user.employmentStatus as string) || undefined,
      };

      return NextResponse.json({
        success: true,
        message: 'User data retrieved successfully',
        data: enhancedUser,
      });
    }

    // For full-access users (from users table)
    const { db, dbTenant, userDb } = await getTenantAwareConnection(request);

    // Get user and tenant info (we know they exist)
    const userExists = await checkUserExistsByEmail(db, userEmail);
    
    if (!userExists) {
      return NextResponse.json(
        {
          success: false,
          error: 'user-not-found',
          message: 'User not found in database',
        },
        { status: 404 }
      );
    }
    
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
      _id: userExists._id,
      applicantId: userExists.applicantId,
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
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

// Export with enhanced auth wrapper (allows limited-access users)
export const GET = withEnhancedAuthAPI(getUserDataHandler, {
  requireDatabaseUser: false, // Allow limited-access users (applicants)
  requireTenant: false, // Limited-access users don't need tenant
});
