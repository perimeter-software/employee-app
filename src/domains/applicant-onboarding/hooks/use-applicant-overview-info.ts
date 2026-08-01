'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { ApplicantRecord } from '../types';
import { useMinStageToOnboarding } from './use-min-stage-to-onboarding';
import { usePrimaryOnboardingCompany } from './use-company-venues';

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
  city: 'City',
  state: 'State',
  zip: 'Zip Code',
  availability: 'Availability',
};

const REQUIRED_FIELDS = Object.keys(REQUIRED_PROFILE_FIELD_NAMES);

export function useApplicantOverviewInfo(args: {
  currentApplicant: { applicant?: ApplicantRecord | null } | null | undefined;
  applicant?: ApplicantRecord | null;
}): ApplicantOverviewInfo {
  const applicant =
    args.applicant ?? args.currentApplicant?.applicant ?? null;

  const { allowedStages } = useMinStageToOnboarding();
  const { data: company } = usePrimaryOnboardingCompany();

  // ---- Profile completion ----
  const { profileCompletion, currentMissingFields } = useMemo(() => {
    const missing: string[] = [];
    let filled = 0;
    REQUIRED_FIELDS.forEach((f) => {
      const v = (applicant as Record<string, unknown> | null)?.[f];
      if (v && (typeof v !== 'string' || v.length > 0)) filled += 1;
      else missing.push(f);
    });
    return {
      profileCompletion: REQUIRED_FIELDS.length
        ? Math.round((filled / REQUIRED_FIELDS.length) * 100)
        : 0,
      currentMissingFields: missing,
    };
  }, [applicant]);

  // ---- Resume ----
  const hasResume = useMemo(() => {
    const attachments = applicant?.attachments as Array<{ type?: string }> | undefined;
    return !!(Array.isArray(attachments) && attachments.find((a) => a.type === 'Resume'));
  }, [applicant?.attachments]);

  const resumeDataAvailable = !!(applicant?.resumeUploaded as boolean | undefined);

  // ---- AI Interviews ----
  type AIInterview = { interviewData?: { interviewEndDate?: string }; status?: string; venue?: string; customer?: string };
  const aiInterviews = (applicant?.aiInterviews as AIInterview[] | undefined) ?? [];
  const firstAvailableAIInterview = aiInterviews[0];
  const applicantStatus = applicant?.applicantStatus;
  const interviews = (applicant?.interviews as unknown[] | undefined) ?? [];

  const canStartAIInterview =
    !!firstAvailableAIInterview &&
    !firstAvailableAIInterview.interviewData?.interviewEndDate &&
    (applicantStatus === 'New' || applicantStatus === 'ATC') &&
    interviews.length === 0;

  // ---- Assessment links (API) ----
  const applicantId = applicant?._id as string | undefined;

  const { data: applicantAssessmentInfo } = useQuery({
    queryKey: ['applicant-onboarding', 'assessment-links', applicantId],
    queryFn: async () => {
      const { data } = await axios.get(
        `/api/applicant-onboarding/jobs/assessment/link/${applicantId}`
      );
      return data;
    },
    enabled: !!applicantId,
    refetchOnWindowFocus: true,
    gcTime: 0,
  });

  const assessmentLinks: unknown[] =
    ((applicantAssessmentInfo as { assessmentLinks?: unknown[] } | undefined)?.assessmentLinks) ?? [];

  // ---- Total pending interviews ----
  const availableAutoSchedulingJobs =
    (applicant?.availableAutoSchedulingJobs as unknown[] | undefined) ?? [];

  const totalPendingInterviews =
    (assessmentLinks.length) +
    (canStartAIInterview ? 1 : 0) +
    availableAutoSchedulingJobs.length;

  // ---- Recommended jobs (API) ----
  const { data: jobsFiltered, isLoading: isLoadingFiltered } = useQuery({
    queryKey: ['applicant-onboarding', 'overview-recommended-jobs', applicantId],
    queryFn: async () => {
      const { data } = await axios.post(
        `/api/applicant-onboarding/applicants/${applicantId}/search`,
        { orderBy: 'weightedScore', order: 'desc', geoPreference: 'Anywhere' }
      );
      return data;
    },
    enabled: !!applicantId && resumeDataAvailable && company != null,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });

  const recommendedJobCount =
    ((jobsFiltered as { data?: unknown[] } | undefined)?.data?.length) ?? 0;

  // ---- Onboarding availability ----
  const isOnboardingAvailable =
    allowedStages.includes(applicantStatus ?? '') &&
    !applicant?.acknowledged;

  return {
    profileCompletion,
    currentMissingFields,
    requiredProfileFieldNames: REQUIRED_PROFILE_FIELD_NAMES,
    hasResume,
    isLoadingFiltered,
    resumeDataAvailable,
    totalPendingInterviews,
    canStartAIInterview,
    assessmentLinks,
    isOnboardingAvailable,
    onboardingCompletion: 35,
    recommendedJobCount,
  };
}
