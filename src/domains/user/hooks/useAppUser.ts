'use client';

// Single entry point for client-side user access. Returns the same shape
// regardless of whether the app is running on Auth0 (legacy) or Clerk (V4),
// so call sites do not need to know which auth provider is active.
//
// When Auth0 is eventually removed, delete the Auth0 branch + this file's
// conditional export; consumers remain unchanged.
import { IS_V4 } from '@/lib/config/auth-mode';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import { useAppUserAuth0 } from './useAppUser.auth0';
import { useAppUserClerk } from './useAppUser.clerk';

export type AppUserState = {
  user: Auth0SessionUser | null | undefined;
  isLoading: boolean;
  error: Error | undefined;
};

// Module-level pick — IS_V4 is a build-time constant, so hook identity is
// stable across renders and React's rules-of-hooks are respected.
export const useAppUser: () => AppUserState = IS_V4
  ? useAppUserClerk
  : useAppUserAuth0;
