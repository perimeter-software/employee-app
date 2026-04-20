'use client';

import { NextPage } from 'next';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

/**
 * /paycheck-stubs is now part of the unified Payroll page.
 * Redirect to /payroll?tab=stubs (or straight to a stub detail if stubId param is present).
 */
const PaycheckStubsRedirectContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const stubId = searchParams.get('stubId');
    if (stubId) {
      router.replace(`/paycheck-stubs/${stubId}`);
    } else {
      router.replace('/payroll?tab=stubs');
    }
  }, [router, searchParams]);

  // Show a skeleton while the redirect happens
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3">
                <Skeleton className="h-12 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
};

const PaycheckStubsPage: NextPage = () => (
  <Suspense fallback={null}>
    <PaycheckStubsRedirectContent />
  </Suspense>
);

export default PaycheckStubsPage;
