'use client';

// Stub port of stadium-people/src/hooks/useApplicantOverviewInfo (211 lines).
// Full implementation calculates profile completion, missing fields, resume presence,
// recommended job count, interviews, assessment links, and onboarding completion.
// For now this returns safe defaults; flesh out as each dependent step is ported.
import { useMemo } from 'react';
import type { ApplicantRecord } from '../types';

export interface ApplicantOverviewInfo {
  profileCompletion: number;
  currentMissingFields: string[];
  requiredProfileFieldNames: Record<string, string>;
  hasResume: boolean;
  isLoadingFiltered: boolean;
  resumeDataAvailable: boolean;
  totalPendingInterviews: number;
  canStartAIInterview: boolean;
  assessmentLinks: unknown[];
  isOnboardingAvailable: boolean;
  onboardingCompletion: number;
  recommendedJobCount: number;
}

const REQUIRED_PROFILE_FIELD_NAMES: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  phone: 'Phone',
  address1: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip Code',
};

const REQUIRED_FIELDS = Object.keys(REQUIRED_PROFILE_FIELD_NAMES);

export function useApplicantOverviewInfo(args: {
  currentApplicant: { applicant?: ApplicantRecord | null } | null | undefined;
  applicant?: ApplicantRecord | null;
}): ApplicantOverviewInfo {
  const applicant =
    args.applicant ?? args.currentApplicant?.applicant ?? null;

  return useMemo(() => {
    const missing: string[] = [];
    let filled = 0;
    REQUIRED_FIELDS.forEach((f) => {
      const v = (applicant as Record<string, unknown> | null)?.[f];
      if (v && (typeof v !== 'string' || v.length > 0)) filled += 1;
      else missing.push(f);
    });
    const profileCompletion = REQUIRED_FIELDS.length
      ? Math.round((filled / REQUIRED_FIELDS.length) * 100)
      : 0;

    const resumes = (applicant as { resume?: unknown; resumes?: unknown[] } | null) ?? null;
    const hasResume =
      !!resumes?.resume || (Array.isArray(resumes?.resumes) && resumes!.resumes!.length > 0);

    return {
      profileCompletion,
      currentMissingFields: missing,
      requiredProfileFieldNames: REQUIRED_PROFILE_FIELD_NAMES,
      hasResume,
      isLoadingFiltered: false,
      resumeDataAvailable: hasResume,
      totalPendingInterviews: 0,
      canStartAIInterview: false,
      assessmentLinks: [],
      isOnboardingAvailable: !!applicant?._id && !applicant?.acknowledged,
      onboardingCompletion: 0,
      recommendedJobCount: 0,
    };
  }, [applicant]);
}
