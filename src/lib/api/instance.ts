import { ApiClient } from './client';
import { forceSessionLogout } from '@/lib/auth/force-logout';
import type { ApiErrorWithDetails } from './types';

// Create singleton instance with configuration
// Timeout 60s: employee punches API can take ~30s (auth + tenant + aggregation); client must wait longer than server duration to avoid Request timeout
export const baseInstance = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || '',
  timeout: 60000,
});

// Add 401 logout interceptor.
// The status is read off `error.status` (set by the client's error
// interceptor) and off `error.response` for anything that bypassed it.
baseInstance.responseInterceptor.use(
  (response) => response,
  (error) => {
    const status =
      (error as ApiErrorWithDetails)?.status ??
      (error as { response?: { status?: number } })?.response?.status;

    if (status === 401) {
      console.log('Authentication expired, signing out...');
      // Deep-linked routes would otherwise sit on a spinner re-requesting
      // data that can never succeed — end the session and go to login.
      forceSessionLogout();
    }

    return Promise.reject(error);
  }
);
