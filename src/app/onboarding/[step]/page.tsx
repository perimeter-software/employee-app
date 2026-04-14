'use client';

import { NextPage } from 'next';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import NewOnboarding from '@/domains/applicant-onboarding/components/NewOnboarding';

const OnboardingStepPage: NextPage = () => {
  const { shouldShowContent, isLoading, error } = usePageAuth({ requireAuth: true });

  if (isLoading) {
    return (
      <Layout title="Onboarding">
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }
  if (error)
    return (
      <Layout title="Onboarding">
        <AuthErrorState error={error.message || 'Authentication error'} />
      </Layout>
    );
  if (!shouldShowContent)
    return (
      <Layout title="Onboarding">
        <UnauthenticatedState />
      </Layout>
    );

  return (
    <Layout title="Onboarding" description="Applicant onboarding" noindex>
      <NewOnboarding />
    </Layout>
  );
};

export default OnboardingStepPage;
