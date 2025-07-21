// lib/db/tenant-db.ts
import { mongoConn } from './mongodb';
import redisService from '@/lib/cache/redis-client';
import type { AuthenticatedRequest } from '@/domains/user/types';

/**
 * Gets the current user's tenant database name from Redis cache
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
        `⚠️  No tenant data found for user: ${userEmail}, using default database`
      );
      return 'stadiumpeople'; // Default fallback
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
  const dbName = await getCurrentTenantDbName(userEmail);

  console.log(
    `🔗 Opening tenant-aware connection to database: ${dbName} for user: ${userEmail}`
  );
  return mongoConn(dbName);
}
