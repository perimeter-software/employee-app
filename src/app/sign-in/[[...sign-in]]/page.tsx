'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { IS_V4 } from '@/lib/config/auth-mode';
import { CustomSignInForm } from '@/components/auth/CustomSignInForm';
import { useAppUser } from '@/domains/user/hooks/useAppUser';

function SignInInner() {
  const params = useSearchParams();
  const redirectUrl = params.get('redirect_url') ?? '/';
  const router = useRouter();
  // Resolves the current user from either auth source (Clerk or the OTP
  // session) via /api/auth/me.
  const { user, isLoading } = useAppUser();

  // Already signed in? Don't show the form — send them home. Without this, a
  // user who lands on /sign-in while still authenticated (a stale link, a
  // session-refresh bounce, or the back button) gets stuck staring at the
  // sign-in form even though their session is valid. Destination mirrors the
  // "/" landing (see app/page.tsx): Home for full users, else their surface.
  useEffect(() => {
    if (user && !isLoading) {
      const isApplicantOnly = user.isApplicantOnly ?? false;
      const isLimitedAccess = user.isLimitedAccess ?? false;
      let dest = '/home';
      if (isApplicantOnly) dest = '/applicant';
      else if (isLimitedAccess) dest = '/payroll';
      router.replace(dest);
    }
  }, [user, isLoading, router]);

  // While auth is resolving, or while redirecting an already-signed-in user,
  // show a spinner instead of flashing the sign-in form.
  if (isLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="h-12 w-12 animate-spin rounded-full border-b-[3px] border-appPrimary" />
      </div>
    );
  }

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
