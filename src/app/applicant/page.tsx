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

const ApplicantPage: NextPage = () => {
  const {
    shouldShowContent,
    isLoading,
    error,
  } = usePageAuth({ requireAuth: true });

  if (isLoading) {
    return (
      <Layout title="Applicant">
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }
  if (error)
    return (
      <Layout title="Applicant">
        <AuthErrorState error={error.message || 'Authentication error'} />
      </Layout>
    );
  if (!shouldShowContent)
    return (
      <Layout title="Applicant">
        <UnauthenticatedState />
      </Layout>
    );

  return (
    <Layout title="Applicant" description="Applicant portal" noindex>
      <NewOnboarding />
    </Layout>
  );
};

export default ApplicantPage;
