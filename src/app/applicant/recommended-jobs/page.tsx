'use client';

import { NextPage } from 'next';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import ApplicantPlaceholder from '@/domains/applicant/components/ApplicantPlaceholder';

const ApplicantRecommendedJobsPage: NextPage = () => {
  const { shouldShowContent, isLoading, error } = usePageAuth({ requireAuth: true });

  if (isLoading) {
    return (
      <Layout title="Recommended Jobs">
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }
  if (error)
    return (
      <Layout title="Recommended Jobs">
        <AuthErrorState error={error.message || 'Authentication error'} />
      </Layout>
    );
  if (!shouldShowContent)
    return (
      <Layout title="Recommended Jobs">
        <UnauthenticatedState />
      </Layout>
    );

  return (
    <Layout title="Recommended Jobs">
      <ApplicantPlaceholder title="Recommended Jobs" />
    </Layout>
  );
};

export default ApplicantRecommendedJobsPage;
