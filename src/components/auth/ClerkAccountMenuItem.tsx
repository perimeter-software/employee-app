'use client';

/**
 * Dropdown item that opens Clerk's account modal ("Manage account") from the
 * header user menu.
 *
 * Clerk's openUserProfile() needs a real Clerk session. Users who signed in via
 * Clerk already have one. Users who signed in via the Email 1-Time Code (OTP)
 * flow only have a custom otp_session cookie — no Clerk session — so the modal
 * would silently do nothing. For those, we transparently establish a Clerk
 * session first: POST /api/auth/clerk-bridge mints a single-use sign-in ticket
 * for their existing Clerk account, we exchange it (signIn strategy 'ticket'),
 * then open the modal. No Clerk user is ever created — if there's no Clerk
 * account for the email, we degrade gracefully.
 *
 * Rendered ONLY when IS_V4 (i.e. inside ClerkProvider), so the Clerk hooks are safe.
 */

import { useState } from 'react';
import { useClerk, useAuth, useSignIn } from '@clerk/nextjs';
import { Mail, Loader2 } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/DropdownMenu';

export function ClerkAccountMenuItem() {
  const { openUserProfile } = useClerk();
  const { isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [busy, setBusy] = useState(false);

  async function handleManageAccount() {
    // Already have a Clerk session (signed in via Clerk) — just open it.
    if (isSignedIn) {
      openUserProfile();
      return;
    }
    // OTP-authenticated: silently bridge into a Clerk session, then open.
    if (!isLoaded || !signIn || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/clerk-bridge', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        hasClerkUser?: boolean;
        ticket?: string;
      };
      if (!res.ok || !data.hasClerkUser || !data.ticket) {
        // No Clerk account to manage, or the bridge failed — do nothing.
        return;
      }
      const attempt = await signIn.create({
        strategy: 'ticket',
        ticket: data.ticket,
      });
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        openUserProfile();
      }
    } catch (err) {
      console.error('[clerk-bridge] background sign-in failed:', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenuItem
      // Keep the menu from closing/stealing focus before the async flow can
      // open the modal.
      onSelect={(e) => {
        e.preventDefault();
        void handleManageAccount();
      }}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Mail className="w-4 h-4 mr-2" />
      )}
      Manage account
    </DropdownMenuItem>
  );
}
