'use client';

import { useMemo } from 'react';
import { useNewApplicantContext } from '../state/new-applicant-context';
import { useApplicantOverviewInfo } from '../hooks/use-applicant-overview-info';
import AlertsSectionCard from './AlertsSectionCard';
import type { CurrentApplicantResponse } from '../types';

interface Props {
  isAvailable: boolean;
  currentApplicant: CurrentApplicantResponse | null | undefined;
}

const AlertsSection: React.FC<Props> = ({ isAvailable, currentApplicant }) => {
  const { applicant, setActiveStep, activeStep } = useNewApplicantContext();

  const {
    currentMissingFields,
    hasResume,
    canStartAIInterview,
    assessmentLinks,
    isOnboardingAvailable,
  } = useApplicantOverviewInfo({ currentApplicant, applicant });

  const messages = useMemo(() => {
    const items: Parameters<typeof AlertsSectionCard>[0]['message'][] = [];

    if (
      applicant?.availableAutoSchedulingJobs &&
      (
        applicant.availableAutoSchedulingJobs as Array<{ suggestedInterviewSlots?: unknown[] }>
      ).some((jb) => !jb.suggestedInterviewSlots?.length)
    ) {
      items.push({
        type: 'urgent',
        title: 'Interview Scheduling Required',
        description:
          'You have been selected for an interview. Please schedule your interview time slot.',
        action: 'Schedule Now',
        func: () => setActiveStep(5),
      });
    }

    if (currentMissingFields.filter((f) => f !== 'availability').length > 0) {
      items.push({
        type: 'urgent',
        title: 'Missing Profile Information',
        description: 'Your profile is missing some required information.',
        action: 'Update Profile',
        func: () => setActiveStep(2),
      });
    }

    if (currentMissingFields.includes('availability')) {
      items.push({
        type: 'warning',
        title: 'Missing Availability Information',
        description:
          'Please update your availability to help us match you with suitable positions.',
        action: 'Update Availability',
        func: () => setActiveStep(2),
      });
    }

    if (!hasResume) {
      items.push({
        type: 'warning',
        title: 'Missing Resume',
        description:
          'Please upload a resume to help us match you with suitable positions.',
        action: 'Upload Resume',
        func: () => setActiveStep(3),
      });
    }

    if (canStartAIInterview) {
      items.push({
        type: 'infoalt',
        title: 'AI Screening Available',
        description:
          'You can start an AI Screening Interview that will increase your chances of getting hired.',
        action: 'Start Now',
        func: () => setActiveStep(5),
      });
    }

    if (assessmentLinks.length > 0) {
      items.push({
        type: 'info',
        title: 'Assessment Available',
        description:
          'You can start a quick assessment that will increase your chances of getting hired.',
        action: 'Start Now',
        func: () => setActiveStep(5),
      });
    }

    return items;
  }, [
    applicant?.availableAutoSchedulingJobs,
    assessmentLinks.length,
    canStartAIInterview,
    currentMissingFields,
    hasResume,
    setActiveStep,
  ]);

  if (
    !messages.length ||
    !isAvailable ||
    activeStep === 'verification' ||
    isOnboardingAvailable
  ) {
    return null;
  }

  if (currentApplicant === undefined) return null;

  return (
    <div className="mt-4 pb-2">
      <h2 className="text-lg font-medium text-gray-900">Important Updates</h2>
      {messages.map((msg, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <AlertsSectionCard key={index} message={msg} />
      ))}
    </div>
  );
};

export default AlertsSection;
