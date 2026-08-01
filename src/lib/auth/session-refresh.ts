// lib/auth/session-refresh.ts - Auth0 v3 compatible
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { IS_V4 } from '@/lib/config/auth-mode';

export function useSessionRefresh() {
  const { user, error, isLoading } = useAppUser();
  const router = useRouter();

  useEffect(() => {
    // If there's an auth error, clear everything and redirect to login
    if (error && !isLoading) {
      console.log('🧹 Auth error detected, clearing session...', error.message);

      // Clear any client-side auth state
      if (typeof window !== 'undefined') {
        // Clear localStorage/sessionStorage if you store auth data there
        localStorage.removeItem('auth0.is.authenticated');
        localStorage.removeItem('auth0');
        sessionStorage.clear();

        // Force a hard refresh to clear everything
        window.location.href = IS_V4 ? '/sign-in' : '/api/auth/login';
      }
    }
  }, [error, isLoading]);

  useEffect(() => {
    // Auto-refresh session every 30 minutes if user is active
    if (user && !error && !isLoading) {
      const interval = setInterval(
        () => {
          // Check if session is still valid by making a lightweight API call
          fetch('/api/auth/me')
            .then((response) => {
              if (!response.ok) {
                console.log('🔄 Session expired, refreshing...');
                router.push(IS_V4 ? '/sign-in' : '/api/auth/login');
              }
            })
            .catch(() => {
              console.log('🔄 Session check failed, refreshing...');
              router.push(IS_V4 ? '/sign-in' : '/api/auth/login');
            });
        },
        30 * 60 * 1000
      ); // 30 minutes

      return () => clearInterval(interval);
    }
  }, [user, error, isLoading, router]);

  return { user, error, isLoading };
}
