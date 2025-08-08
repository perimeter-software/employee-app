// app/time-attendance/page.tsx
'use client';

import Layout from '@/components/layout/Layout';
import { TimeTrackerContainer } from '@/domains/punch';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';

function TimeAttendancePage() {
  // Auth check
  const {
    shouldShowContent,
    isLoading: authLoading,
    error: authError,
  } = usePageAuth({
    requireAuth: true,
  });

  // Early returns for auth states
  if (authLoading) {
    return <AuthLoadingState />;
  }

  if (authError) {
    return <AuthErrorState error={authError.message} />;
  }

  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  return (
    <Layout title="Time Attendance">
      <TimeTrackerContainer />
    </Layout>
  );
}

export default TimeAttendancePage;
