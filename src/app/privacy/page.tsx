'use client';

import { NextPage } from 'next';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import { AuthErrorState, UnauthenticatedState } from '@/components/shared/PageProtection';
import DataAccessView from '@/domains/privacy/components/DataAccessView';

const PrivacyPage: NextPage = () => {
  const { shouldShowContent, isLoading, error } = usePageAuth({ requireAuth: true });

  if (isLoading) {
    return (
      <Layout title="Privacy & My Data">
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }
  if (error)
    return (
      <Layout title="Privacy & My Data">
        <AuthErrorState error={error.message || 'Authentication error'} />
      </Layout>
    );
  if (!shouldShowContent)
    return (
      <Layout title="Privacy & My Data">
        <UnauthenticatedState />
      </Layout>
    );

  return (
    <Layout title="Privacy & My Data" description="See and manage the data we hold about you" noindex>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <DataAccessView />
      </div>
    </Layout>
  );
};

export default PrivacyPage;
