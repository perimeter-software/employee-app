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
        const { db } = await mongoConn();
        const agentName = session.user.name || session.user.email || 'User';
        
        await logActivity(
          db,
          createActivityLogData(
            'User Login',
            `${agentName} logged in using Auth0`,
            {
              userId: session.user.sub,
              applicantId: session.user.sub, // May need to fetch from DB later
              agent: agentName,
              email: session.user.email || '',
              details: {
                loginMethod: 'Auth0',
                email: session.user.email,
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
