// lib/hooks/use-applicant-route-protection.ts
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useMinStageToOnboarding } from '@/domains/applicant-onboarding/hooks/use-min-stage-to-onboarding';
import type { ApplicantSubType } from '@/domains/user/types';

// Routes that are always accessible to any authenticated session
const AUTH_ROUTES = ['/', '/api/auth'];

// Routes accessible to applicant-only sessions with status="Employee"
const EMPLOYEE_APPLICANT_ROUTES = ['/payroll', '/paycheck-stubs', '/applicant'];

// The applicant route (step-based multi-form wizard)
const ONBOARDING_ROUTE = '/applicant';

function isAllowedRoute(pathname: string, allowedPrefixes: string[]): boolean {
  return allowedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );
}

/**
 * Determines which applicant sub-type the current user belongs to based on
 * their applicantStatus, the company's minStageToOnboarding setting, and
 * whether they have already completed onboarding (acknowledged.date).
 *
 * Returns null when the user is not an "Applicant"-status applicant.
 */
export function useApplicantSubType(): ApplicantSubType | null {
  const { data: currentUser } = useCurrentUser();
  const { allowedStages } = useMinStageToOnboarding();

  return useMemo(() => {
    if (!currentUser?.isApplicantOnly) return null;
    // Only compute sub-type for applicant.status === "Applicant"
    if (currentUser.status !== 'Applicant') return null;

    const { applicantStatus, acknowledgedDate } = currentUser;

    if (!applicantStatus) return null;

    if (allowedStages.includes(applicantStatus)) {
      // Stage is at or above the onboarding threshold
      return acknowledgedDate ? 'post-onboarding' : 'onboarding';
    }

    // Stage is below the threshold (e.g. "New", "ATC")
    return 'pre-onboarding';
  }, [
    currentUser?.isApplicantOnly,
    currentUser?.status,
    currentUser?.applicantStatus,
    currentUser?.acknowledgedDate,
    allowedStages,
  ]);
}

/**
 * Hook to protect routes based on the current applicant session type.
 *
 * - Regular (non-applicant) users: no restrictions applied here.
 * - Applicant sessions with status="Employee": only /payroll and /paycheck-stubs.
 * - Applicant sessions with status="Applicant":
 *     pre-onboarding  → all applicant screens except /applicant
 *     onboarding      → only /applicant
 *     post-onboarding → all applicant screens (onboarding limited to certain steps
 *                       inside the component itself)
 */
export function useApplicantRouteProtection() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const { isLoading: isLoadingCompany } = usePrimaryCompany();
  const applicantSubType = useApplicantSubType();

  const isLoading = isLoadingUser || isLoadingCompany;

  useEffect(() => {
    if (isLoadingUser || isLoadingCompany) return;

    const isApplicantOnly = currentUser?.isApplicantOnly ?? false;
    if (!isApplicantOnly) return;

    // Always allow auth routes
    if (isAllowedRoute(pathname, AUTH_ROUTES)) return;

    const applicantRecordStatus = currentUser?.status; // "Employee" | "Applicant"

    // ── "Employee"-status applicants (existing payroll-only flow) ─────────────
    if (applicantRecordStatus === 'Employee') {
      if (isAllowedRoute(pathname, EMPLOYEE_APPLICANT_ROUTES)) return;
      console.log(
        `[ApplicantRouteProtection] Employee-applicant: redirecting ${pathname} → /payroll`
      );
      router.replace('/payroll');
      return;
    }

    // ── "Applicant"-status applicants: all sub-types land on /applicant ────────
    if (applicantRecordStatus === 'Applicant') {
      if (applicantSubType === null) return; // sub-type not yet resolved – wait
      if (isAllowedRoute(pathname, [ONBOARDING_ROUTE])) return;
      console.log(
        `[ApplicantRouteProtection] ${applicantSubType} applicant: redirecting ${pathname} → /applicant`
      );
      router.replace(ONBOARDING_ROUTE);
      return;
    }

    // Allow access to paycheck stubs routes
    const isPaycheckStubsRoute =
      pathname === '/payroll' ||
      pathname.startsWith('/payroll/') ||
      pathname.startsWith('/paycheck-stubs/');

    // Allow access to login/logout routes
    const isAuthRoute = pathname === '/' || pathname.startsWith('/api/auth/');

    // Allow access to public routes (if any)
    const isPublicRoute = false; // Add public routes if needed

    if (isPaycheckStubsRoute || isAuthRoute || isPublicRoute) {
      // Allow access
      return;
    }

    // Unknown status – fall back to root
    console.log(
      `[ApplicantRouteProtection] Unknown applicant status: redirecting ${pathname} → /`
    );
    router.replace('/');
  }, [
    currentUser,
    isLoadingUser,
    isLoadingCompany,
    pathname,
    router,
    applicantSubType,
  ]);

  return { isLoading, applicantSubType };
}
