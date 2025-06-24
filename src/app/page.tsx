// app/page.tsx
'use client';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { Button } from '@/components/ui/Button';
import Image from 'next/image';

interface NotificationState {
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  show: boolean;
}

// Component that handles search params (needs to be wrapped in Suspense)
function SearchParamsHandler({
  setNotification,
}: {
  setNotification: (state: NotificationState) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const expired = searchParams.get('expired');
    const loggedOut = searchParams.get('loggedout');
    const error = searchParams.get('error');

    if (expired) {
      setNotification({
        message: 'Please sign in again.',
        level: 'warning',
        show: true,
      });
    } else if (loggedOut) {
      setNotification({
        message: 'You have successfully logged out.',
        level: 'info',
        show: true,
      });
    } else if (error) {
      let message = 'Error logging in, try again shortly.';
      if (error === 'no-tenant') {
        message = 'No active tenant found for your account.';
      } else if (error === 'user-not-found') {
        message = 'Account not found. Please contact support.';
      }
      setNotification({
        message,
        level: 'error',
        show: true,
      });
    }
  }, [searchParams, setNotification]);

  return null; // This component doesn't render anything
}

// Component for login button that uses search params
function LoginButton() {
  const searchParams = useSearchParams();

  const handleLogin = () => {
    const returnUrl = searchParams.get('returnUrl') || '/time-attendance';
    // Using the correct API route for Auth0 login
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(
      returnUrl
    )}`;
  };

  return (
    <Button
      onClick={handleLogin}
      className="w-full bg-gradient-to-r from-appPrimary to-appPrimary/90 hover:from-appPrimary/90 hover:to-appPrimary text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg min-h-[60px] border-0 relative overflow-hidden group"
      type="button"
    >
      <span className="relative z-10">Proceed To Sign In</span>
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
    </Button>
  );
}

export default function LoginPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    level: 'info',
    show: false,
  });

  // FIXED: Separate useEffect for auto-hiding notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, show: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]); // FIXED: Only depend on notification.show

  // Redirect if user is already authenticated
  useEffect(() => {
    if (user && !isLoading) {
      router.push('/time-attendance');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-appBackground via-altMutedBackground to-altPrimaryBackground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-3 border-appPrimary"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-appBackground via-altMutedBackground to-altPrimaryBackground">
      {/* Search params handler wrapped in Suspense */}
      <Suspense fallback={null}>
        <SearchParamsHandler setNotification={setNotification} />
      </Suspense>

      {/* Notification Banner */}
      {notification.show && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 p-4 border-b shadow-lg backdrop-blur-md ${
            notification.level === 'error'
              ? 'bg-red-50/90 border-errorRed text-altText'
              : notification.level === 'warning'
                ? 'bg-orange-50/90 border-warningOrange text-altText'
                : notification.level === 'success'
                  ? 'bg-green-50/90 border-successGreen text-altText'
                  : 'bg-altMutedBackground/90 border-appPrimary text-altText'
          }`}
        >
          <div className="max-w-md mx-auto text-center font-medium">
            {notification.message}
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <div className="flex items-center justify-center min-h-screen px-4 py-8 relative z-10">
        <div className="w-full max-w-md mx-auto">
          {/* Unified Beautiful Layout */}
          <div className="relative">
            {/* Animated Background Elements */}
            <div className="absolute -inset-4 bg-gradient-to-r from-appPrimary/20 via-appSecondary/20 to-altPrimary/20 rounded-[2.5rem] blur-xl opacity-60 animate-pulse"></div>

            {/* Main Card */}
            <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 md:p-10">
              {/* Header Section */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-appPrimary to-altPrimary rounded-2xl mb-6 shadow-lg">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                    <div className="w-6 h-6 bg-gradient-to-br from-appPrimary to-altPrimary rounded-full"></div>
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-altText mb-2">
                  Welcome Back
                </h1>
                <p className="text-altText/70 text-sm">
                  Please sign in to continue to your account
                </p>
              </div>

              {/* Logo Section */}
              <div className="flex flex-col items-center mb-8">
                <div className="bg-gradient-to-r from-altMutedBackground to-white p-6 rounded-2xl shadow-inner border border-altPrimary/20 mb-4 w-full">
                  <Image
                    src="/images/powered-by-gig-blue.png"
                    alt="logo"
                    width={300}
                    height={90}
                    className="w-full h-auto max-w-[280px] mx-auto"
                    priority
                  />
                </div>

                {/* Elegant Divider */}
                <div className="flex items-center w-full my-6">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-altPrimary/50 to-transparent"></div>
                  <div className="px-4">
                    <div className="w-2 h-2 bg-appPrimary rounded-full shadow-lg"></div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-altPrimary/50 to-transparent"></div>
                </div>
              </div>

              {/* Button Section */}
              <div className="space-y-4">
                {/* Login button wrapped in Suspense */}
                <Suspense
                  fallback={
                    <Button
                      className="w-full bg-gradient-to-r from-appPrimary to-appPrimary/90 hover:from-appPrimary/90 hover:to-appPrimary text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg min-h-[60px] border-0 relative overflow-hidden group"
                      type="button"
                      disabled
                    >
                      <span className="relative z-10">Loading...</span>
                    </Button>
                  }
                >
                  <LoginButton />
                </Suspense>

                {/* Security Badge */}
                <div className="flex items-center justify-center space-x-2 text-xs text-altText/60 mt-4">
                  <div className="w-4 h-4 bg-successGreen/20 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-successGreen rounded-full"></div>
                  </div>
                  <span>Secured with enterprise-grade authentication</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Elements */}
          <div className="flex justify-center space-x-4 mt-8 opacity-60">
            <div className="w-3 h-3 bg-appPrimary rounded-full animate-bounce delay-0"></div>
            <div className="w-3 h-3 bg-altPrimary rounded-full animate-bounce delay-75"></div>
            <div className="w-3 h-3 bg-appSecondary rounded-full animate-bounce delay-150"></div>
          </div>
        </div>
      </div>

      {/* Enhanced Background Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Animated Gradient Orbs */}
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-altPrimary/30 to-appPrimary/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-appSecondary/30 to-altSecondary/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/4 right-1/4 w-60 h-60 bg-gradient-to-br from-altMutedBackground/40 to-altPrimaryBackground/30 rounded-full blur-2xl animate-pulse delay-500"></div>

        {/* Floating Particles */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-appPrimary/40 rounded-full animate-ping delay-300"></div>
        <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-altPrimary/60 rounded-full animate-ping delay-700"></div>
        <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-appSecondary/50 rounded-full animate-ping delay-1000"></div>
      </div>
    </main>
  );
}
