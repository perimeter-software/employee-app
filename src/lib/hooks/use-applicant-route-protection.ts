// lib/hooks/use-applicant-route-protection.ts
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

/**
 * Hook to protect routes from applicant-only sessions
 * Redirects applicants away from non-paycheck-stub routes
 * Returns loading state for use in UI
 */
export function useApplicantRouteProtection() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const { isLoading: isLoadingCompany } = usePrimaryCompany();
  
  const isLoading = isLoadingUser || isLoadingCompany;

  useEffect(() => {
    // Don't redirect while loading user or company data
    if (isLoadingUser || isLoadingCompany) return;

    // Check if user is applicant-only
    const isApplicantOnly = currentUser?.isApplicantOnly || false;

    if (!isApplicantOnly) {
      // Not an applicant-only session, allow access
      return;
    }

    // Allow access to paycheck stubs routes
    const isPaycheckStubsRoute = 
      pathname === '/paycheck-stubs' || 
      pathname.startsWith('/paycheck-stubs/');

    // Allow access to login/logout routes
    const isAuthRoute = 
      pathname === '/' || 
      pathname.startsWith('/api/auth/');

    // Allow access to public routes (if any)
    const isPublicRoute = false; // Add public routes if needed

    if (isPaycheckStubsRoute || isAuthRoute || isPublicRoute) {
      // Allow access
      return;
    }

    // Redirect applicant to paycheck stubs
    console.log(`🚫 Applicant-only session: Redirecting from ${pathname} to /paycheck-stubs`);
    router.replace('/paycheck-stubs');
  }, [currentUser, isLoadingUser, isLoadingCompany, pathname, router]);
  
  return { isLoading };
}
