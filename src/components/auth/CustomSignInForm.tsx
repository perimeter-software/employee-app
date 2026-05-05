/**
 * Custom Clerk sign-in form (V4 / Clerk mode only).
 *
 * Mirrors gignology-v4's CustomSignInForm. Replaces Clerk's hosted <SignIn>
 * to auto-recover from the "user has no password set" dead-end common for
 * users migrated from Auth0 or who only ever used Google OAuth.
 *
 * Flow:
 *   1. User enters email + password and submits.
 *   2. signIn.create({ identifier: email }) — no password yet. Clerk
 *      returns supportedFirstFactors listing which strategies this account
 *      actually supports (password / email_code / reset_password_email_code
 *      / oauth_google / ...).
 *   3a. If `password` is supported → attemptFirstFactor with the password.
 *   3b. If not, run `reset_password_email_code` so the user enters a code
 *       plus a new password and is signed in with a real password going
 *       forward.
 */
'use client';

import { useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Loader2, Mail, Lock } from 'lucide-react';

type Step = 'credentials' | 'verify-email-code' | 'reset-password';

interface ClerkApiError {
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
}

function clerkMessage(err: unknown, fallback: string): string {
  const e = err as ClerkApiError;
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? fallback;
}

export function CustomSignInForm({ redirectUrl }: { redirectUrl: string }) {
  const { signIn, isLoaded, setActive } = useSignIn();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoaded || !signIn) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  async function sendEmailCode(
    emailFactor: { emailAddressId: string },
    forEmail: string,
  ) {
    await signIn!.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    });
    setStep('verify-email-code');
    setInfo(`We emailed a code to ${forEmail}. Enter it to finish signing in.`);
    setError(null);
  }

  async function startEmailCodeSignIn(forEmail: string) {
    const created = await signIn!.create({ identifier: forEmail });
    const emailFactor = created.supportedFirstFactors?.find(
      (f: { strategy: string }) => f.strategy === 'email_code',
    ) as { strategy: 'email_code'; emailAddressId: string } | undefined;
    if (!emailFactor) {
      throw new Error(
        "This email isn't set up for one-time codes. Contact support.",
      );
    }
    await sendEmailCode(emailFactor, forEmail);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const created = await signIn!.create({ identifier: email });
      const factors = created.supportedFirstFactors ?? [];
      const hasPassword = factors.some((f) => f.strategy === 'password');
      const emailFactor = factors.find(
        (f) => f.strategy === 'email_code',
      ) as { strategy: 'email_code'; emailAddressId: string } | undefined;

      if (hasPassword) {
        const result = await signIn!.attemptFirstFactor({
          strategy: 'password',
          password,
        });
        if (result.status === 'complete') {
          await setActive!({ session: result.createdSessionId });
          window.location.href = redirectUrl;
          return;
        }
        setError('Sign-in incomplete — please try again.');
        return;
      }

      const resetFactor = factors.find(
        (f) => f.strategy === 'reset_password_email_code',
      ) as
        | { strategy: 'reset_password_email_code'; emailAddressId: string }
        | undefined;

      if (resetFactor) {
        await signIn!.prepareFirstFactor({
          strategy: 'reset_password_email_code',
          emailAddressId: resetFactor.emailAddressId,
        });
        setStep('reset-password');
        setInfo(
          `No password is set for this account. We emailed a code to ${email} — enter it and choose a new password to finish signing in.`,
        );
        return;
      }

      if (emailFactor) {
        await sendEmailCode(emailFactor, email);
        return;
      }

      setError(
        'This account has no password and no email options. Try Google sign-in or contact support.',
      );
    } catch (err) {
      setError(
        clerkMessage(err, 'Could not sign in. Check your email and password.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyEmailCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'email_code',
        code,
      });
      if (result.status !== 'complete') {
        setError('Verification incomplete — please try again.');
        return;
      }
      await setActive!({ session: result.createdSessionId });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(clerkMessage(err, 'Invalid code.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        window.location.href = redirectUrl;
        return;
      }
      setError(
        'Password reset incomplete. Please try again or contact support.',
      );
    } catch (err) {
      setError(clerkMessage(err, 'Invalid code or password.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn!.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sign-in/sso-callback',
        redirectUrlComplete: redirectUrl,
      });
    } catch (err) {
      setError(clerkMessage(err, 'Could not start Google sign-in.'));
      setBusy(false);
    }
  }

  if (step === 'reset-password') {
    return (
      <form onSubmit={handleResetPassword} className="space-y-4">
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="6-digit code"
            required
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              disabled={busy}
              className="pl-9"
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          fullWidth
          loading={busy}
          disabled={busy || code.length !== 6 || newPassword.length < 8}
        >
          Set password & sign in
        </Button>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() => {
            setStep('credentials');
            setCode('');
            setNewPassword('');
            setError(null);
            setInfo(null);
          }}
          disabled={busy}
        >
          Back
        </Button>
      </form>
    );
  }

  if (step === 'verify-email-code') {
    return (
      <form onSubmit={handleVerifyEmailCode} className="space-y-4">
        {info && (
          <Alert>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="6-digit code"
            required
            disabled={busy}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          fullWidth
          loading={busy}
          disabled={busy || code.length !== 6}
        >
          Verify & sign in
        </Button>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() => {
            setStep('credentials');
            setCode('');
            setError(null);
            setInfo(null);
          }}
          disabled={busy}
        >
          Back
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <Button
        type="button"
        variant="outline"
        fullWidth
        onClick={handleGoogle}
        disabled={busy}
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z" fill="#34A853" />
          <path d="M5.85 14.11A6.61 6.61 0 0 1 5.5 12c0-.74.13-1.45.35-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38Z" fill="#EA4335" />
        </svg>
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-gray-500">or</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            disabled={busy}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
            disabled={busy}
            className="pl-9"
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        fullWidth
        loading={busy}
        disabled={busy || !email || !password}
      >
        Sign in
      </Button>

      <button
        type="button"
        className="w-full text-center text-sm text-gray-500 hover:text-gray-900"
        onClick={async () => {
          if (!email) {
            setError('Enter your email first.');
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await startEmailCodeSignIn(email);
          } catch (err) {
            setError(clerkMessage(err, "We couldn't email a sign-in code."));
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        Sign in with a one-time email code instead
      </button>
    </form>
  );
}
