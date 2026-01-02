// components/auth/OTPLoginForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, Loader2 } from 'lucide-react';

interface OTPLoginFormProps {
  returnUrl?: string;
  onError?: (error: string) => void;
}

export function OTPLoginForm({ returnUrl, onError }: OTPLoginFormProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
        throw new Error(data.error || 'Failed to send code');
      }

      setStep('code');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send code';
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
          returnTo: returnUrl || '/time-attendance',
        }),
        credentials: 'include', // Important: include cookies in the request
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid code');
      }

      // Redirect to the URL provided by the server
      if (data.success && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        // Fallback redirect
        window.location.href = returnUrl || '/time-attendance';
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

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  if (step === 'email') {
    return (
      <form onSubmit={handleSendOTP} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
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

  return (
    <form onSubmit={handleVerifyOTP} className="space-y-4">
      <div>
        <p className="text-sm text-gray-600 mb-4">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>
        <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
          Enter Code
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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

