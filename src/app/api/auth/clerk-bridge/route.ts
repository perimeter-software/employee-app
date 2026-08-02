// app/api/auth/clerk-bridge/route.ts
//
// Bridges an OTP-authenticated session into a Clerk sign-in "ticket" so the
// user can open Clerk's account modal ("Manage account"), which requires a real
// Clerk session. OTP login only creates a custom Redis session (otp_session_*),
// not a Clerk session — so openUserProfile() silently no-ops for those users.
//
// The user must ALREADY exist in the (gignology) Clerk instance — we never
// create one here. That means no provisioning, no Clerk MAU churn from users
// who never open this, and no `user.created` webhook side effects. When there's
// no Clerk account for the email we return { hasClerkUser: false } so the UI can
// degrade gracefully instead of erroring.
import { NextRequest, NextResponse } from 'next/server';
import redisService from '@/lib/cache/redis-client';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via the existing OTP session cookie (server-side).
    const sessionId = request.cookies.get('otp_session_id')?.value;
    if (!sessionId) {
      return NextResponse.json({ error: 'no-otp-session' }, { status: 401 });
    }
    const session = await redisService.get<{ email?: string }>(
      `otp_session:${sessionId}`
    );
    const email = session?.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: 'no-session-email' }, { status: 401 });
    }

    // 2. Look up the Clerk user for this email in the app's Clerk instance.
    const { clerkClient } = await import('@clerk/nextjs/server');
    const clerk = await clerkClient();
    const { data: users } = await clerk.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    const user = users?.[0];
    if (!user) {
      // No Clerk account for this email — nothing to manage. Not an error.
      return NextResponse.json({ hasClerkUser: false });
    }

    // 3. Mint a short-lived, single-use sign-in ticket for that user. The
    //    frontend exchanges it for a Clerk session (signIn strategy: 'ticket').
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 300, // 5 min — the frontend uses it immediately
    });

    return NextResponse.json({ hasClerkUser: true, ticket: signInToken.token });
  } catch (error) {
    console.error('[clerk-bridge] failed to mint sign-in ticket:', error);
    return NextResponse.json({ error: 'bridge-failed' }, { status: 500 });
  }
}
