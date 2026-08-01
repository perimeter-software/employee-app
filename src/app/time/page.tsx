'use client';

import Layout from '@/components/layout/Layout';
import { TimeContainer } from '@/domains/time/components/TimeContainer';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthLoadingState,
  AuthErrorState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';

export default function TimePage() {
  const { shouldShowContent, isLoading, error } = usePageAuth({ requireAuth: true });

  if (isLoading) return <AuthLoadingState />;
  if (error) return <AuthErrorState error={error.message} />;
  if (!shouldShowContent) return <UnauthenticatedState />;

  return (
    <Layout title="Time">
      <TimeContainer />
    </Layout>
  );
}
