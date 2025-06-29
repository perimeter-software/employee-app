// lib/db/tenant-db.ts
import { mongoConn } from './mongodb';
import redisService from '@/lib/cache/redis-client';
import type { AuthenticatedRequest } from '@/domains/user/types';

/**
 * Gets the current user's tenant database name from Redis cache
 */
export async function getCurrentTenantDbName(userEmail: string): Promise<string> {
  try {
    const tenantData = await redisService.getTenantData(userEmail.toLowerCase());
    
    if (!tenantData?.tenant) {
      console.warn(`⚠️  No tenant data found for user: ${userEmail}, using default database`);
      return 'stadiumpeople'; // Default fallback
    }
    
    // Use the dbName from the tenant data if available
    const dbName = tenantData.tenant.dbName || tenantData.tenant.url?.split('.')[0] || 'stadiumpeople';
    
    console.log(`🎯 Using database "${dbName}" for tenant: ${tenantData.tenant.url} (user: ${userEmail})`);
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
  
  console.log(`🔗 Opening tenant-aware connection to database: ${dbName} for user: ${userEmail}`);
  return mongoConn(dbName);
}
