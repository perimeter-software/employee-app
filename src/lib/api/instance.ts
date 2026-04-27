import { ApiClient } from './client';
import { IS_V4 } from '@/lib/config/auth-mode';

// Create singleton instance with configuration
// Timeout 60s: employee punches API can take ~30s (auth + tenant + aggregation); client must wait longer than server duration to avoid Request timeout
// X-App-Source identifies this client to the v4 backend so Clerk user IDs are
// stored under clerk.employeeapp.{env} on the user record (vs clerk.gignology.{env}).
export const baseInstance = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || '',
  timeout: 60000,
  headers: {
    'X-App-Source': 'employeeapp',
  },
});

// Add 401 redirect interceptor
baseInstance.responseInterceptor.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log('Authentication expired, redirecting to login...');

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.href = IS_V4 ? '/sign-in' : '/api/auth/login';
        }, 0);
      }
    }

    return Promise.reject(error);
  }
);
