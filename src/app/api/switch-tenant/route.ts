// app/api/switch-tenant/route.ts
import { TenantInfo } from '@/domains/tenant';
import { updateTenantLastLoginDate } from '@/domains/user/utils';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import redisService from '@/lib/cache/redis-client';
import { getTenantAwareConnection } from '@/lib/db';
import { NextResponse } from 'next/server';
import type { AuthenticatedRequest } from '@/domains/user/types';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

/**
 * Re-point an applicant-only OTP session at another of their tenants.
 *
 * The session payload in Redis is authoritative for OTP sessions (middleware
 * reads `tenant` straight off it), so it must be rewritten too — updating only
 * the tenant cache would leave every request still resolving the old tenant.
 */
async function switchApplicantTenant(
  request: AuthenticatedRequest,
  userEmail: string,
  selectedTenant: TenantInfo,
  tenantData: { tenant?: TenantInfo; availableTenants?: TenantInfo[] }
) {
  const otpSessionId = request.cookies.get('otp_session_id')?.value;
  if (!otpSessionId) {
    return NextResponse.json(
      { error: 'no-session', message: 'No applicant session to switch' },
      { status: 401 }
    );
  }

  const sessionKey = `otp_session:${otpSessionId}`;
  const sessionData =
    await redisService.get<Record<string, unknown>>(sessionKey);
  if (!sessionData) {
    return NextResponse.json(
      { error: 'session-expired', message: 'Session expired. Please sign in again.' },
      { status: 401 }
    );
  }

  // Read the applicant's record in the TARGET tenant — each tenant holds its own
  // document, with its own _id and its own onboarding state.
  const { findApplicantInTenantByDbName } = await import(
    '@/domains/user/utils/mongo-user-utils'
  );
  const target = selectedTenant.dbName
    ? await findApplicantInTenantByDbName(selectedTenant.dbName, userEmail)
    : null;

  if (!target) {
    console.error(
      `❌ Applicant ${userEmail} has no record in target tenant: ${selectedTenant.dbName}`
    );
    return NextResponse.json(
      {
        error: 'applicant-not-found-in-tenant',
        message: 'No application found with the selected employer',
      },
      { status: 404 }
    );
  }

  const info = target.applicantInfo;
  await redisService.set(
    sessionKey,
    {
      ...sessionData,
      userId: target.applicantId,
      applicantId: target.applicantId,
      firstName: info.firstName ?? sessionData.firstName,
      lastName: info.lastName ?? sessionData.lastName,
      status: info.status,
      employmentStatus: info.employmentStatus,
      applicantStatus: info.applicantStatus,
      acknowledgedDate: info.acknowledgedDate,
      tenant: selectedTenant,
    },
    24 * 60 * 60
  );

  await redisService.setTenantData(
    userEmail,
    {
      ...tenantData,
      tenant: selectedTenant,
      isApplicantOnly: true,
      lastSwitched: new Date().toISOString(),
    },
    60 * 60 * 24
  );

  console.log(
    `✅ Switched applicant ${userEmail} to tenant: ${selectedTenant.dbName}`
  );

  return NextResponse.json({
    success: true,
    message: 'Tenant switched successfully',
    data: selectedTenant,
  });
}

async function switchTenantHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const userEmail = user.email!.toLowerCase();

    const { tenantUrl } = await request.json();

    if (!tenantUrl) {
      return NextResponse.json(
        { error: 'missing-tenant-url', message: 'Tenant URL is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Switching tenant for user ${userEmail} to: ${tenantUrl}`);

    // Fetch current tenant data from Redis
    const tenantData = await redisService.getTenantData(userEmail);

    if (!tenantData || !tenantData.availableTenants) {
      console.error(`❌ No tenant data found for user: ${userEmail}`);
      return NextResponse.json(
        { error: 'no-tenant-data', message: 'No tenant data found' },
        { status: 404 }
      );
    }

    // Check if user is trying to switch to the same tenant
    if (tenantData.tenant?.url === tenantUrl) {
      console.log(`ℹ️ User ${userEmail} is already on tenant: ${tenantUrl}`);
      return NextResponse.json({
        success: true,
        message: 'Already on selected tenant',
        data: tenantData.tenant,
      });
    }

    // Find the selected tenant
    const selectedTenant = tenantData.availableTenants.find(
      (tenant: TenantInfo) => tenant.url === tenantUrl
    );

    if (!selectedTenant) {
      console.error(
        `❌ Tenant ${tenantUrl} not found in available tenants for user: ${userEmail}`
      );
      return NextResponse.json(
        {
          error: 'tenant-not-found',
          message: 'Tenant not found in available tenants',
        },
        { status: 404 }
      );
    }

    // ── Applicant-only sessions ───────────────────────────────────────────────
    // Applicants have no `users` record and no usermaster entry, so the employee
    // path below (user lookup + tenants.$.lastLoginDate) doesn't apply. Their
    // tenant lives inside the OTP session payload, so switching means re-minting
    // that payload against the target tenant's own applicant document.
    if (user.isApplicantOnly) {
      return switchApplicantTenant(request, userEmail, selectedTenant, tenantData);
    }

    // Connect to databases
    const { userDb } = await getTenantAwareConnection(request);

    // Clear any existing cached user data for this user before switching
    console.log(`🧹 Clearing cached data for user: ${userEmail}`);
    const userCacheKeys = [
      `user:enhanced:${userEmail}`,
      `user:jobs:${userEmail}`,
      `user:punches:${userEmail}`,
      `user:dashboard:${userEmail}`,
      `user:notifications:${userEmail}`,
    ];

    // Clear user-specific cache entries
    await Promise.allSettled(userCacheKeys.map((key) => redisService.del(key)));

    // IMPORTANT: Look up user identity in the NEW tenant's database
    console.log(`🔍 Looking up user identity in new tenant: ${selectedTenant.dbName}`);
    const { mongoConn } = await import('@/lib/db');
    const { checkUserExistsByEmail } = await import('@/domains/user/utils');
    
    // Connect to the NEW tenant's database
    const { db: newTenantDb } = await mongoConn(selectedTenant.dbName);
    
    // Look up user in the new tenant's database
    const userInNewTenant = await checkUserExistsByEmail(newTenantDb, userEmail);
    
    if (!userInNewTenant) {
      console.error(`❌ User ${userEmail} not found in new tenant database: ${selectedTenant.dbName}`);
      return NextResponse.json(
        {
          error: 'user-not-found-in-tenant',
          message: 'User not found in selected tenant database',
        },
        { status: 404 }
      );
    }

    console.log(`✅ Found user in new tenant:`, {
      _id: userInNewTenant._id,
      applicantId: userInNewTenant.applicantId,
      tenant: selectedTenant.dbName
    });

    // Update tenantData in Redis with the new selected tenant AND user identity
    const updatedTenantData = {
      ...tenantData,
      tenant: selectedTenant,
      lastSwitched: new Date().toISOString(),
      // Store the user identity for the new tenant
      userIdentity: {
        _id: userInNewTenant._id,
        applicantId: userInNewTenant.applicantId,
        firstName: userInNewTenant.firstName,
        lastName: userInNewTenant.lastName,
        userType: userInNewTenant.userType,
        employeeType: userInNewTenant.employeeType,
        status: userInNewTenant.status,
        hideEmployeesDetails: !!userInNewTenant.hideEmployeesDetails,
      }
    };

    await redisService.setTenantData(
      userEmail,
      updatedTenantData,
      60 * 60 * 24 // 1 day expiry
    );

    // Update lastLoginDate for the selected tenant in MongoDB
    await updateTenantLastLoginDate(userDb, userEmail, selectedTenant.url);

    console.log(
      `✅ Successfully switched tenant for user ${userEmail} to: ${tenantUrl}`
    );

    return NextResponse.json({
      success: true,
      message: 'Tenant switched successfully',
      data: selectedTenant,
    });
  } catch (error) {
    console.error('❌ Tenant switch error:', error);
    return NextResponse.json(
      { error: 'internal-error', message: 'Failed to switch tenant' },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper (validates database user AND tenant).
// `allowApplicants` lets applicant-only sessions through to the applicant branch;
// the wrapper skips the requireDatabaseUser/requireTenant checks for them.
export const POST = withEnhancedAuthAPI(switchTenantHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
