// Simple logout page to clear all cookies
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function LogoutPage() {
  useEffect(() => {
    // Clear all cookies on page load
    const cookiesToClear = [
      'appSession',
      'appSession.0',
      'appSession.1',
      'appSession.2',
      'auth0',
      'auth0.is.authenticated',
    ];

    cookiesToClear.forEach((cookieName) => {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`;
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });

    // Clear localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('auth') || key.includes('Auth')) {
        localStorage.removeItem(key);
      }
    });

    // Clear sessionStorage
    sessionStorage.clear();

    console.log('🧹 All auth cookies and storage cleared');
  }, []);

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
        <div className="mb-4">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Logged Out</h1>
        <p className="text-gray-600 mb-6">
          All authentication data has been cleared from your browser.
        </p>
        <div className="space-y-3">
          <Button onClick={handleLogin} className="w-full">
            Log In Again
          </Button>
          <Button variant="outline" onClick={handleGoHome} className="w-full">
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}
