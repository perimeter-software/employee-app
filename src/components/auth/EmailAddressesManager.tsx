'use client';

/**
 * Custom "Email addresses" tab for the Clerk <UserButton/> account modal
 * (employee app / employeeapp Clerk instance).
 *
 * Drives Clerk's client resource API directly so users can add, verify, set
 * primary, and remove email addresses. Backend Mongo records stay in sync via
 * the user.updated Clerk webhook (gig-v4-backend auth/clerkFlow.js).
 */

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import type { EmailAddressResource } from '@clerk/types';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Label } from '@/components/ui/Label/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert/Alert';
import { Loader2, Mail, Star, Trash2, Plus } from 'lucide-react';

interface ClerkApiError {
  errors?: Array<{ longMessage?: string; message?: string }>;
}

function clerkMessage(err: unknown, fallback: string): string {
  const e = err as ClerkApiError;
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? fallback;
}

export function EmailAddressesManager() {
  const { user, isLoaded } = useUser();

  // Direct resource calls (this Clerk version predates useReverification).
  // If the instance enforces step-up reverification, Clerk surfaces an error
  // which we display.
  const createEmail = (email: string) => user!.createEmailAddress({ email });
  const setPrimary = (emailAddressId: string) =>
    user!.update({ primaryEmailAddressId: emailAddressId });
  const destroyEmail = (ea: EmailAddressResource) => ea.destroy();

  const [newEmail, setNewEmail] = useState('');
  const [pending, setPending] = useState<EmailAddressResource | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const primaryId = user.primaryEmailAddressId;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !newEmail) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const created = await createEmail(newEmail.trim().toLowerCase());
      await created.prepareVerification({ strategy: 'email_code' });
      setPending(created);
      setInfo(`We emailed a verification code to ${created.emailAddress}.`);
      setNewEmail('');
    } catch (err) {
      setError(clerkMessage(err, 'Could not add that email address.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartVerify(ea: EmailAddressResource) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await ea.prepareVerification({ strategy: 'email_code' });
      setPending(ea);
      setCode('');
      setInfo(`We emailed a verification code to ${ea.emailAddress}.`);
    } catch (err) {
      setError(clerkMessage(err, 'Could not send a verification code.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pending || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await pending.attemptVerification({ code });
      await user!.reload();
      setPending(null);
      setCode('');
      setInfo('Email address verified and added.');
    } catch (err) {
      setError(clerkMessage(err, 'Invalid or expired code.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPrimary(ea: EmailAddressResource) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await setPrimary(ea.id);
      await user!.reload();
      setInfo(`${ea.emailAddress} is now your primary email.`);
    } catch (err) {
      setError(clerkMessage(err, 'Could not set primary email.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(ea: EmailAddressResource) {
    if (busy) return;
    const removedEmail = ea.emailAddress;
    const removedId = ea.id;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await destroyEmail(ea);
      await user!.reload();
      if (pending?.id === removedId) {
        setPending(null);
        setCode('');
      }
      setInfo(`${removedEmail} removed.`);
    } catch (err) {
      setError(clerkMessage(err, 'Could not remove that email address.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Email addresses</h2>
        <p className="text-sm text-gray-500">
          Add additional email addresses and choose which one is primary.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {info && (
        <Alert>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      )}

      <ul className="divide-y rounded-md border">
        {user.emailAddresses.map((ea) => {
          const isPrimary = ea.id === primaryId;
          const isVerified = ea.verification?.status === 'verified';
          return (
            <li
              key={ea.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate text-sm">{ea.emailAddress}</span>
                {isPrimary && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
                    Primary
                  </span>
                )}
                {!isVerified && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    Unverified
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!isVerified && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-sm"
                    onClick={() => handleStartVerify(ea)}
                    disabled={busy}
                  >
                    Verify
                  </Button>
                )}
                {!isPrimary && isVerified && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2 text-sm"
                    leftIcon={<Star className="h-3.5 w-3.5" />}
                    onClick={() => handleSetPrimary(ea)}
                    disabled={busy}
                  >
                    Set primary
                  </Button>
                )}
                {!isPrimary && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => handleRemove(ea)}
                    disabled={busy}
                    aria-label="Remove email"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pending && (
        <form
          onSubmit={handleVerify}
          className="space-y-2 rounded-md border p-4"
        >
          <Label htmlFor="email-code">
            Enter the code sent to {pending.emailAddress}
          </Label>
          <div className="flex gap-2">
            <Input
              id="email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="6-digit code"
              disabled={busy}
            />
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={busy || code.length !== 6}
            >
              Verify
            </Button>
          </div>
        </form>
      )}

      {!pending && (
        <form onSubmit={handleAdd} className="space-y-2">
          <Label htmlFor="new-email">Add an email address</Label>
          <div className="flex gap-2">
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={busy || !newEmail}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Add
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
