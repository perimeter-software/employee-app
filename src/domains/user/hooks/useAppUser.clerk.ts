'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import type { AppUserState } from './useAppUser';

// In V4 we resolve the app user by fetching /api/auth/me. That route
// transparently handles either auth source:
//   - Clerk session (set by Clerk SDK after Account Login)
//   - OTP session  (set by /api/auth/otp/verify after Email 1-Time Code)
// Whichever returns a user wins; if neither, /api/auth/me returns 204.
//
// Because OTP doesn't go through Clerk, we can't gate the query on
// Clerk's isSignedIn — we always run it once Clerk has finished loading.
async function fetchMe(): Promise<Auth0SessionUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Failed to load user (${res.status})`);
  return (await res.json()) as Auth0SessionUser;
}

export function useAppUserClerk(): AppUserState {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  const query = useQuery({
    queryKey: ['app-user', 'clerk-or-otp'],
    queryFn: fetchMe,
    // Run as soon as Clerk is loaded — the route serves both Clerk and OTP.
    enabled: isClerkLoaded,
    staleTime: 60_000,
  });

  // If the user is signed into Clerk but has no matching MongoDB record,
  // /api/auth/me returns null. Sign them out and redirect to login with
  // an error. (Doesn't run for OTP-only sessions — those just resolve as
  // 'no user' and get redirected by usePageAuth.)
  useEffect(() => {
    if (
      isClerkLoaded &&
      isSignedIn === true &&
      !query.isLoading &&
      query.data === null
    ) {
      void signOut({ redirectUrl: '/?error=user-not-found' });
    }
  }, [isClerkLoaded, isSignedIn, query.isLoading, query.data, signOut]);

  return {
    user: query.data ?? undefined,
    isLoading: !isClerkLoaded || query.isLoading,
    error: query.error instanceof Error ? query.error : undefined,
  };
}
