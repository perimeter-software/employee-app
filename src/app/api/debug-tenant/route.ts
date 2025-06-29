// app/api/debug-tenant/route.ts
import { withEnhancedAuthAPI } from '@/lib/middleware';
import redisService from '@/lib/cache/redis-client';
import { NextResponse } from 'next/server';
import type { AuthenticatedRequest } from '@/domains/user/types';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

async function debugTenantHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const userEmail = user.email!.toLowerCase();

    console.log(`🔍 Debug tenant data for user: ${userEmail}`);

    // Fetch current tenant data from Redis
    const tenantData = await redisService.getTenantData(userEmail);

    console.log(`📊 Full tenant data:`, JSON.stringify(tenantData, null, 2));

    return NextResponse.json({
      success: true,
      userEmail,
      tenantData: tenantData || null,
      currentTenant: tenantData?.tenant || null,
      availableTenants: tenantData?.availableTenants || [],
    });
  } catch (error) {
    console.error('❌ Debug tenant error:', error);
    return NextResponse.json(
      { error: 'internal-error', message: 'Failed to debug tenant data' },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const GET = withEnhancedAuthAPI(debugTenantHandler, {
  requireDatabaseUser: true,
  requireTenant: false, // Allow even if no tenant is set
});
