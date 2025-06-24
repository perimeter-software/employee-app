// components/shared/AuthErrorBoundary/AuthErrorBoundary.tsx
'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's an auth-related error
    const isAuthError =
      error.message?.includes('JWE') ||
      error.message?.includes('auth') ||
      error.message?.includes('session') ||
      error.message?.includes('Authentication');

    return {
      hasError: isAuthError,
      error: isAuthError ? error : undefined,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log auth errors but auto-clear session
    if (this.state.hasError) {
      console.error('Auth error caught by boundary:', error, errorInfo);

      // Clear any client-side auth data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth0.is.authenticated');
        localStorage.removeItem('auth0');
        sessionStorage.clear();

        // Redirect to login after a short delay
        setTimeout(() => {
          window.location.href = '/api/auth/login';
        }, 2000);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
            <div className="mb-4">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.866-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Session Expired
            </h1>
            <p className="text-gray-600 mb-6">
              Your session has expired or become corrupted. You&apos;ll be
              redirected to login automatically.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => (window.location.href = '/api/auth/login')}
                className="w-full"
              >
                Go to Login
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Clear everything and reload
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="w-full"
              >
                Clear All Data & Reload
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
