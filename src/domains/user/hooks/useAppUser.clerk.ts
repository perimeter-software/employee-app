'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import type { AppUserState } from './useAppUser';

// In V4 we resolve the app user the same way Auth0's useUser() does: by
// fetching /api/auth/me. The V4 branch of that route uses Clerk's auth() to
// identify the Clerk user and returns the Auth0SessionUser-shaped payload
// (same fields the rest of the app already consumes — applicantId, userType,
// employmentStatus, etc.).
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
    queryKey: ['app-user', 'clerk'],
    queryFn: fetchMe,
    enabled: isClerkLoaded && isSignedIn === true,
    staleTime: 60_000,
  });

  // If the user is signed into Clerk but has no matching MongoDB record,
  // /api/auth/me returns null. Sign them out and redirect to login with
  // an error, matching the gig-v4-backend "Access is not allowed" flow.
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
    user: isSignedIn ? query.data ?? undefined : null,
    isLoading: !isClerkLoaded || (isSignedIn === true && query.isLoading),
    error: query.error instanceof Error ? query.error : undefined,
  };
}
