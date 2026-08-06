// components/auth/OTPLoginForm.auth0.tsx — legacy Auth0/OTP backend path.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, Loader2, Building2 } from 'lucide-react';
import type { OTPLoginFormProps } from './OTPLoginForm.types';

/** One choice offered when an email belongs to more than one client. */
interface SelectableTenant {
  clientDomain: string;
  clientName: string;
  tenantLogo?: string;
}

export function OTPLoginFormAuth0({ returnUrl, onError }: OTPLoginFormProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'tenant'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Populated only when the verified email exists in multiple tenants.
  const [tenantOptions, setTenantOptions] = useState<SelectableTenant[]>([]);
  const [tenantTicket, setTenantTicket] = useState('');

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle employee not found error specifically
        if (data.employeeNotFound) {
          throw new Error('Employee not found. Please contact your supervisor');
        }
        throw new Error(data.error || 'Failed to send code');
      }

      setStep('code');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send code';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
          returnTo: returnUrl || '/time',
        }),
        credentials: 'include', // Important: include cookies in the request
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      // The code was accepted, but the email belongs to more than one client —
      // ask which one before a session is created.
      if (data.needsTenantSelection) {
        setTenantOptions(data.tenants ?? []);
        setTenantTicket(data.ticket ?? '');
        setStep('tenant');
        return;
      }

      // Redirect to the URL provided by the server
      if (data.success && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        // Fallback redirect
        window.location.href = returnUrl || '/time';
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid code';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTenant = async (clientDomain: string) => {
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/otp/select-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket: tenantTicket, tenantDomain: clientDomain }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not continue. Please try again.');
      }

      window.location.href = data.redirectUrl || returnUrl || '/applicant';
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Could not continue';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError('');
    setTenantOptions([]);
    setTenantTicket('');
  };

  if (step === 'email') {
    return (
      <form onSubmit={handleSendOTP} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-appPrimary focus:border-transparent outline-none transition-all"
              disabled={isLoading}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoading || !email}
          className="w-full bg-gradient-to-r from-appPrimary to-appPrimary/90 hover:from-appPrimary/90 hover:to-appPrimary text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg min-h-[60px] border-0 relative overflow-hidden group"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </span>
          ) : (
            <span className="relative z-10">Send Login Code</span>
          )}
        </Button>
      </form>
    );
  }

  if (step === 'tenant') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">
            We found your account with more than one employer. Which one are you
            signing in for?
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {tenantOptions.map((tenant) => (
            <button
              key={tenant.clientDomain}
              type="button"
              onClick={() => handleSelectTenant(tenant.clientDomain)}
              disabled={isLoading}
              className="w-full flex items-center gap-3 px-4 py-4 border border-gray-300 rounded-xl text-left transition-all hover:border-appPrimary hover:bg-appPrimary/5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {tenant.tenantLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.tenantLogo}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-gray-500" />
                </div>
              )}
              <span className="font-medium text-gray-900">
                {tenant.clientName}
              </span>
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Signing you in...
          </div>
        )}

        <Button
          type="button"
          onClick={handleBack}
          variant="ghost"
          disabled={isLoading}
          className="w-full text-gray-600 hover:text-gray-900"
        >
          Back to Email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleVerifyOTP} className="space-y-4">
      <div>
        <p className="text-sm text-gray-600 mb-4">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>
        <label
          htmlFor="code"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Enter Code
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="000000"
            required
            maxLength={6}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-appPrimary focus:border-transparent outline-none transition-all text-center text-2xl tracking-widest font-mono"
            disabled={isLoading}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Button
          type="submit"
          disabled={isLoading || code.length !== 6}
          className="w-full bg-gradient-to-r from-appPrimary to-appPrimary/90 hover:from-appPrimary/90 hover:to-appPrimary text-white font-semibold py-4 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 text-lg min-h-[60px] border-0 relative overflow-hidden group"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Verifying...
            </span>
          ) : (
            <span className="relative z-10">Verify Code</span>
          )}
        </Button>

        <Button
          type="button"
          onClick={handleBack}
          variant="ghost"
          className="w-full text-gray-600 hover:text-gray-900"
        >
          Back to Email
        </Button>
      </div>
    </form>
  );
}
