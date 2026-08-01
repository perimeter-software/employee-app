'use client';

import { NextPage } from 'next';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import { AuthErrorState, UnauthenticatedState } from '@/components/shared/PageProtection';
import ErasureRequestFlow from '@/domains/privacy/components/ErasureRequestFlow';

const PrivacyDeletePage: NextPage = () => {
  const { shouldShowContent, isLoading, error } = usePageAuth({ requireAuth: true });

  if (isLoading) {
    return (
      <Layout title="Delete my account">
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }
  if (error)
    return (
      <Layout title="Delete my account">
        <AuthErrorState error={error.message || 'Authentication error'} />
      </Layout>
    );
  if (!shouldShowContent)
    return (
      <Layout title="Delete my account">
        <UnauthenticatedState />
      </Layout>
    );

  return (
    <Layout title="Delete my account" description="Request deletion of your account and data" noindex>
      <div className="px-4 py-6 sm:px-6">
        <ErasureRequestFlow />
      </div>
    </Layout>
  );
};

export default PrivacyDeletePage;
