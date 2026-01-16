// lib/db/tenant-db.ts
import { mongoConn } from './mongodb';
import redisService from '@/lib/cache/redis-client';
import type { AuthenticatedRequest } from '@/domains/user/types';

/**
 * Gets the current user's tenant database name from Redis cache or database lookup
 */
export async function getCurrentTenantDbName(
  userEmail: string
): Promise<string> {
  try {
    const tenantData = await redisService.getTenantData(
      userEmail.toLowerCase()
    );

    if (!tenantData?.tenant) {
      console.warn(
        `⚠️  No tenant data found in Redis for user: ${userEmail}, looking up in database...`
      );

      // FALLBACK: Look up tenant data from database for single-tenant users
      try {
        const { mongoConn } = await import('./mongodb');
        const { checkUserMasterEmail } = await import('@/domains/user/utils');

        // Connect to databases
        const { dbTenant, userDb } = await mongoConn();

        // Get tenant data from database
        const userMasterRecord = await checkUserMasterEmail(
          userDb,
          dbTenant,
          userEmail
        );

        if (userMasterRecord?.success && userMasterRecord?.tenant) {
          console.log(
            `🎯 Found tenant data in database for user: ${userEmail}`,
            {
              url: userMasterRecord.tenant.url,
              dbName: userMasterRecord.tenant.dbName,
              clientName: userMasterRecord.tenant.clientName,
            }
          );

          // Use dbName from database lookup if available
          if (userMasterRecord.tenant.dbName) {
            console.log(
              `🎯 Using database "${userMasterRecord.tenant.dbName}" from database lookup for tenant: ${userMasterRecord.tenant.url} (user: ${userEmail})`
            );
            return userMasterRecord.tenant.dbName;
          }

          // Fallback to URL-based database name
          const tenantUrl = userMasterRecord.tenant.url;
          let dbName = 'stadiumpeople'; // Default fallback

          if (tenantUrl) {
            // Special case: if the domain is jobs.stadiumpeople.com, use stadiumpeople
            if (tenantUrl === 'jobs.stadiumpeople.com') {
              dbName = 'stadiumpeople';
            } else {
              // Otherwise use the first part of the URL
              dbName = tenantUrl.split('.')[0] || 'stadiumpeople';
            }
          }

          console.log(
            `🎯 Using database "${dbName}" (URL fallback) for tenant: ${tenantUrl} (user: ${userEmail})`
          );
          return dbName;
        } else {
          console.error(
            `❌ No tenant data found in database for user: ${userEmail}`
          );
          return 'stadiumpeople'; // Default fallback
        }
      } catch (dbError) {
        console.error(
          `❌ Database lookup failed for user ${userEmail}:`,
          dbError
        );
        return 'stadiumpeople'; // Default fallback
      }
    }

    // Use the dbName from the tenant data if available
    if (tenantData.tenant.dbName) {
      console.log(
        `🎯 Using database "${tenantData.tenant.dbName}" from tenant data for tenant: ${tenantData.tenant.url} (user: ${userEmail})`
      );
      console.log(`📊 Tenant data:`, {
        url: tenantData.tenant.url,
        dbName: tenantData.tenant.dbName,
        clientName: tenantData.tenant.clientName,
        type: tenantData.tenant.type,
      });
      return tenantData.tenant.dbName;
    }

    // Fallback logic for when dbName is not available
    const tenantUrl = tenantData.tenant.url;
    let dbName = 'stadiumpeople'; // Default fallback

    if (tenantUrl) {
      // Special case: if the domain is jobs.stadiumpeople.com, use stadiumpeople
      if (tenantUrl === 'jobs.stadiumpeople.com') {
        dbName = 'stadiumpeople';
      } else {
        // Otherwise use the first part of the URL
        dbName = tenantUrl.split('.')[0] || 'stadiumpeople';
      }
    }

    console.log(
      `🎯 Using database "${dbName}" (fallback logic) for tenant: ${tenantUrl} (user: ${userEmail})`
    );
    console.log(`📊 Tenant data:`, {
      url: tenantData.tenant.url,
      dbName: tenantData.tenant.dbName,
      clientName: tenantData.tenant.clientName,
      type: tenantData.tenant.type,
      fallbackUsed: true,
    });
    return dbName;
  } catch (error) {
    console.error(`❌ Error getting tenant database for ${userEmail}:`, error);
    return 'stadiumpeople'; // Default fallback
  }
}

/**
 * Tenant-aware MongoDB connection that automatically uses the correct database
 */
export async function getTenantAwareConnection(request: AuthenticatedRequest) {
  const userEmail = request.user.email!;
  // PRIORITY 1: Use tenant from request.user.tenant if available (works for both users and applicants)
  // The middleware sets request.user.tenant when processing the request
  const userTenant = request.user.tenant;
  let dbName: string;

  if (userTenant?.dbName) {
    dbName = userTenant.dbName;
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      const userType = request.user.isApplicantOnly ? 'applicant' : 'user';
      console.log(
        `🎯 Using database "${dbName}" from request.user.tenant for tenant: ${userTenant.url} (${userType}: ${userEmail})`
      );
      console.log(`📊 Tenant data from request:`, {
        url: userTenant.url,
        dbName: userTenant.dbName,
        clientName: userTenant.clientName,
        type: userTenant.type,
      });
    }
  } else {
    // PRIORITY 2: Fall back to Redis cache lookup
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `⚠️ No tenant in request.user, falling back to Redis cache for: ${userEmail}`
      );
    }
    dbName = await getCurrentTenantDbName(userEmail);
  }

  // Only log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `🔗 Opening tenant-aware connection to database: ${dbName} for user: ${userEmail}`
    );
  }
  return mongoConn(dbName);
}
