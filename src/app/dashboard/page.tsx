'use client';

import { NextPage } from 'next';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { useCurrentUser } from '@/domains/user';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { DashboardView } from '@/domains/dashboard/components/DashboardView';

const DashboardPage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useAppUser();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({ requireAuth: true });

  if (authLoading || currentUserLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-600 font-medium">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>{(authError as { message?: string }).message || 'Something went wrong'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} fullWidth>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-yellow-600">Authentication Required</CardTitle>
            <CardDescription>Please log in to access your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button fullWidth onClick={() => (window.location.href = '/api/auth/login')}>
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageAuthLoading) return <AuthLoadingState />;
  if (pageAuthError || authError) {
    const msg = pageAuthError?.message || 'Authentication error';
    return <AuthErrorState error={msg} />;
  }
  if (!shouldShowContent) return <UnauthenticatedState />;

  return (
    <Layout>
      <DashboardView mode="full" />
    </Layout>
  );
};

export default DashboardPage;
