'use client';

import { notFound, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { IS_V4 } from '@/lib/config/auth-mode';
import { CustomSignInForm } from '@/components/auth/CustomSignInForm';

function SignInInner() {
  const params = useSearchParams();
  const redirectUrl = params.get('redirect_url') ?? '/';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back. Continue with email or Google.
          </p>
        </div>
        <CustomSignInForm redirectUrl={redirectUrl} />
      </div>
    </div>
  );
}

export default function SignInPage() {
  if (!IS_V4) notFound();
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
