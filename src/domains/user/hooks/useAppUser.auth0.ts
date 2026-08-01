'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import type { AppUserState } from './useAppUser';

// Thin pass-through around Auth0's useUser. The returned user already matches
// Auth0SessionUser because that's the shape /api/auth/me emits today.
export function useAppUserAuth0(): AppUserState {
  const { user, isLoading, error } = useUser();
  return {
    user: user as Auth0SessionUser | null | undefined,
    isLoading,
    error,
  };
}
