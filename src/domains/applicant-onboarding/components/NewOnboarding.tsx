'use client';

// Ported shell of stadium-people NewOnboarding.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentApplicant, NewApplicantContextProvider } from '../';
import {
  usePrimaryOnboardingCompany,
  useOnboardingVenues,
} from '../hooks/use-company-venues';
import NewApplicantHeader from './NewApplicantHeader';
import PageSelectorSection from './PageSelectorSection';
import AlertsSection from './AlertsSection';
import MessageSection from './MessageSection';
import FormContainer from './FormContainer';
import type { OutsideMode } from '../types';
// Use the auth-provider-agnostic hook (Clerk under V4, Auth0 under legacy)
// instead of Auth0's useUser directly — the latter throws
// "You forgot to wrap your app in <UserProvider>" in Clerk mode.
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { useApplicantSubType } from '@/lib/hooks/use-applicant-route-protection';

const NewOnboarding: React.FC = () => {
  const params = useParams();
  const urlStep = (params?.step as string | undefined) ?? undefined;
  const { user } = useAppUser();
  const contextOutsideMode: OutsideMode = user ? '' : 'protected';

  const { data: currentApplicant, isLoading } = useCurrentApplicant('protected');
  const { data: company } = usePrimaryOnboardingCompany();
  const { data: venues } = useOnboardingVenues();
  const applicantSubType = useApplicantSubType();

  const isPreOnboarding = applicantSubType === 'pre-onboarding';
  const isOnboarding = applicantSubType === 'onboarding';

  const [isAvailable, setIsAvailable] = useState(true);

  return (
    <NewApplicantContextProvider
      outsideMode={contextOutsideMode}
      venues={venues ?? null}
    >
      <div className="relative mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <NewApplicantHeader isAvailable={isAvailable} setIsAvailable={setIsAvailable} applicantSubType={applicantSubType} />
        <PageSelectorSection isAvailable={isAvailable} isOnboarding={isOnboarding} />
        <AlertsSection isAvailable={isAvailable} currentApplicant={currentApplicant} />
        <MessageSection isAvailable={isAvailable} />
        {isAvailable && !isLoading && (
          <FormContainer
            currentApplicant={currentApplicant}
            isPreOnboarding={isPreOnboarding}
            companyType={
              (company as { companyType?: string } | undefined)?.companyType ??
              (company as { settings?: { companyType?: string } } | undefined)?.settings
                ?.companyType
            }
          />
        )}
        {isLoading && (
          <div className="mt-8">
            <Skeleton className="h-96 w-full" />
          </div>
        )}
      </div>
    </NewApplicantContextProvider>
  );
};

export default NewOnboarding;
