import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import {
  checkUserExistsByEmail,
  checkUserMasterEmail,
  findApplicantAndTenantsByEmail,
} from '@/domains/user/utils';
import redisService from '@/lib/cache/redis-client';
import type { EnhancedUser } from '@/domains/user/types';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function getUserDataHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const userEmail = user.email!;

    // Handle applicant-only sessions — use latest applicant data from DB
    if (user.isApplicantOnly) {
      const normalizedEmail = userEmail.toLowerCase();
      let applicantInfo: {
        firstName?: string;
        lastName?: string;
        status?: string;
        employmentStatus?: string;
      } | null = null;

      // Fast path: when tenant is already known (from cache), single-DB lookup via same pattern as other API routes
      if (user.tenant?.dbName) {
        try {
          const { db } = await getTenantAwareConnection(request);
          const applicant = await db.collection('applicants').findOne(
            { email: normalizedEmail },
            {
              projection: {
                firstName: 1,
                lastName: 1,
                status: 1,
                employmentStatus: 1,
              },
            }
          );
          if (applicant) {
            applicantInfo = {
              firstName: applicant.firstName,
              lastName: applicant.lastName,
              status: applicant.status,
              employmentStatus: applicant.employmentStatus,
            };
          }
        } catch {
          // Fall through to full lookup
        }
      }

      if (!applicantInfo) {
        const applicantData = await findApplicantAndTenantsByEmail(
          normalizedEmail
        );
        applicantInfo = applicantData?.applicantInfo ?? null;
      }

      // Store tenant data in Redis (consistent with user flow)
      if (user.tenant) {
        const tenantData = {
          tenant: user.tenant,
          availableTenants: user.availableTenants || [],
          isApplicantOnly: true,
        };

        await redisService.setTenantData(
          normalizedEmail,
          tenantData,
          60 * 60 * 24 // 24 hours
        );
      }

      const enhancedUser: EnhancedUser = {
        applicantId: user.applicantId || user.sub,
        tenant: user.tenant,
        availableTenants: user.availableTenants || [],
        email: user.email,
        firstName: applicantInfo?.firstName ?? user.firstName,
        lastName: applicantInfo?.lastName ?? user.lastName,
        name: user.name,
        status: applicantInfo?.status ?? user.status,
        employmentStatus: applicantInfo?.employmentStatus ?? user.employmentStatus,
        isApplicantOnly: true,
        isLimitedAccess: true,
      };

      return NextResponse.json({
        success: true,
        message: 'Applicant data retrieved successfully',
        data: enhancedUser,
      });
    }

    // EXISTING USER FLOW
    // Connect to databases (we know user exists because of withEnhancedAuth)
    const { db, dbTenant, userDb } = await getTenantAwareConnection(request);

    // Get user and tenant info (we know they exist)
    const userExists = await checkUserExistsByEmail(db, userEmail);
    const userMasterRecord = await checkUserMasterEmail(
      userDb,
      dbTenant,
      userEmail
    );

    // Store tenant data in Redis (consistent structure for both users and applicants)
    const tenantData = {
      tenant: userMasterRecord.tenant,
      availableTenants: userMasterRecord.availableTenantObjects || [],
      isApplicantOnly: false, // Explicitly mark as regular user
    };

    await redisService.setTenantData(
      userEmail.toLowerCase(),
      tenantData,
      60 * 60 * 24
    );

    // Derive from latest DB (not session) so UI updates when status changes
    const employmentStatus = userExists?.status ?? '';
    const isLimitedAccess =
      employmentStatus === 'Terminated' || employmentStatus === 'Inactive';

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
      employmentStatus,
      isLimitedAccess,
      isApplicantOnly: false,
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

// Export with applicant-aware auth wrapper (allows both users and applicants)
export const GET = withEnhancedAuthAPI(getUserDataHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
