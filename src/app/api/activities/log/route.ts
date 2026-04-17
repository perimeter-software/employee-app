// app/api/activities/log/route.ts
// Server-side API route for logging activities from client-side components
import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { getTenantAwareConnection } from '@/lib/db';
import { logActivity, createActivityLogData } from '@/lib/services/activity-logger';

export const dynamic = 'force-dynamic';

async function logActivityHandler(
  request: AuthenticatedRequest
) {
  console.log('🔔 /api/activities/log route called');
  try {
    const body = await request.json();
    const { action, description, applicantId, userId, agent, email, details, jobId, eventId } = body;

    console.log('📝 Activity log request received:', {
      action,
      description,
      applicantId,
      userId,
      agent,
      hasDetails: !!details,
    });

    if (!action || !description) {
      console.error('❌ Missing required fields:', { action, description });
      return NextResponse.json(
        { error: 'Action and description are required' },
        { status: 400 }
      );
    }

    // Get tenant-aware database connection
    console.log('🔍 Getting tenant-aware connection...');
    console.log('🔍 Request user tenant:', {
      hasTenant: !!request.user.tenant,
      tenantDbName: request.user.tenant?.dbName,
      tenantUrl: request.user.tenant?.url,
      userEmail: request.user.email,
    });
    
    const { db } = await getTenantAwareConnection(request);
    console.log('✅ Database connection obtained, database name:', db.databaseName);
    
    // Verify we're using the correct database
    if (db.databaseName !== 'sterling' && request.user.tenant?.dbName === 'sterling') {
      console.error('❌ MISMATCH: Expected "sterling" but got:', db.databaseName);
    }

    // Use authenticated user data as fallback
    const user = request.user;
    const finalApplicantId = applicantId || user.applicantId || user.sub;
    const finalUserId = userId || user._id || user.sub;
    const finalAgent = agent || user.name || user.email || 'Employee';
    const finalEmail = email || user.email || '';

    console.log('📊 Activity data to be logged:', {
      action,
      description,
      finalApplicantId,
      finalUserId,
      finalAgent,
      finalEmail,
      jobId,
      eventId,
    });

    await logActivity(
      db,
      createActivityLogData(
        action,
        description,
        {
          applicantId: finalApplicantId ? String(finalApplicantId) : undefined,
          userId: finalUserId ? String(finalUserId) : undefined,
          agent: finalAgent,
          email: finalEmail,
          jobId: jobId ? String(jobId) : undefined,
          eventId: eventId ? String(eventId) : undefined,
          details: details || {},
        }
      )
    );

    console.log('✅ Activity logged to database:', db.databaseName);

    return NextResponse.json({
      success: true,
      message: 'Activity logged successfully',
    });
  } catch (error) {
    console.error('❌ Error in activity logging API:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to log activity',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(logActivityHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

