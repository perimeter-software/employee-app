import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
import type { Session } from '@auth0/nextjs-auth0';
import type { NextRequest } from 'next/server';

// Force dynamic rendering for Auth0 routes
export const dynamic = 'force-dynamic';

// Custom callback handler to properly handle returnTo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const afterCallback = async (req: NextRequest, session: Session): Promise<Session> => {
    // Extract returnTo from state parameter if present
    const url = new URL(req.url || '');
    const state = url.searchParams.get('state');
    
    // Try to decode returnTo from state if it's a JSON string
    let returnTo: string | null = null;
    if (state) {
      try {
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        const stateObj = JSON.parse(decodedState);
        returnTo = stateObj.returnTo || null;
      } catch {
        // If state is not JSON, try to get returnTo from query params
        returnTo = url.searchParams.get('returnTo');
      }
    } else {
      returnTo = url.searchParams.get('returnTo');
    }

    // Store returnTo in session for redirect after callback
    if (returnTo) {
      (session as Session & { returnTo?: string }).returnTo = returnTo;
    }

    // Log Auth0 login activity
    if (session?.user) {
      try {
        const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
        const { mongoConn } = await import('@/lib/db/mongodb');
        const activityEmail = session.user.email?.toLowerCase().trim();
        const { default: redisService } = await import('@/lib/cache/redis-client');
        const tenantData = activityEmail
          ? await redisService.getTenantData(activityEmail)
          : null;
        const tenantDbName = tenantData?.tenant?.dbName;

        if (!tenantDbName) {
          console.warn(
            `Skipping Auth0 login activity log: tenant dbName unavailable for ${activityEmail || 'unknown email'}`
          );
          return session;
        }

        const { db } = await mongoConn(tenantDbName);
        const agentName = session.user.name || session.user.email || 'User';
        const { resolveActivityIdentityByEmail } = await import('@/lib/services/activity-identity');
        const { userId, applicantId } = activityEmail
          ? await resolveActivityIdentityByEmail(db, activityEmail)
          : {};

        if (!userId || !applicantId) {
          console.warn(
            `Skipping Auth0 login activity log: unresolved DB IDs for ${activityEmail || 'unknown email'}`
          );
          return session;
        }

        // Deduplicate noisy callback/login loops.
        if (activityEmail) {
          const recentThreshold = new Date(Date.now() - 2 * 60 * 1000);
          const existingRecent = await db.collection('activities').findOne({
            action: 'User Login',
            userId,
            email: activityEmail,
            integration: 'Employee App',
            activityDate: { $gte: recentThreshold },
          });
          if (existingRecent) {
            return session;
          }
        }
        
        await logActivity(
          db,
          createActivityLogData(
            'User Login',
            `${agentName} logged in using Auth0`,
            {
              userId,
              applicantId,
              agent: agentName,
              email: activityEmail || '',
              details: {
                loginMethod: 'Auth0',
                email: activityEmail,
              },
            }
          )
        );
      } catch (error) {
        // Don't fail login if logging fails
        console.error('Error logging Auth0 login activity:', error);
      }
    }

  return session;
};

const customCallback = handleCallback({
  afterCallback,
});

export const GET = handleAuth({
  callback: customCallback,
});
