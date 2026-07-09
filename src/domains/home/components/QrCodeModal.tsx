'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, MapPin, RefreshCw, ShieldCheck, QrCode } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { useCurrentUser } from '@/domains/user';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { useProfile } from '@/domains/user/hooks/use-profile';
import { useGeoCoords } from '@/domains/venue/hooks/use-geo-coords';
import type { GignologyEvent } from '@/domains/event/types';
import { useIssueClockInQr } from '../hooks/use-clock-in-qr';

interface QrCodeModalProps {
  open: boolean;
  onClose: () => void;
  /** The worker's next scheduled event, shown beside the QR. */
  event?: GignologyEvent | null;
}

const OTP_TTL_MS = 3 * 60 * 1000; // 3 minutes — same lifetime as the login OTP

function initialsOf(first?: string, last?: string): string {
  return `${(first?.[0] ?? '').toUpperCase()}${(last?.[0] ?? '').toUpperCase()}`;
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/**
 * "Show my QR code" modal. Leads with the worker's avatar so the manager can
 * confirm identity at a glance, then a live QR code, a 3-minute expiry
 * countdown (auto-refreshes), and the next scheduled event beside the code.
 */
export function QrCodeModal({ open, onClose, event }: QrCodeModalProps) {
  const { data: currentUser } = useCurrentUser();
  const { user: sessionUser } = useAppUser();
  const { data: profile } = useProfile();
  const coords = useGeoCoords();
  const issueQr = useIssueClockInQr();

  const [now, setNow] = useState(() => Date.now());
  const issuedRef = useRef(false);

  const firstName = currentUser?.firstName ?? '';
  const lastName = currentUser?.lastName ?? '';
  const fullName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    currentUser?.name ||
    'Your code';
  const email = currentUser?.email ?? profile?.emailAddress ?? '';
  const avatarUrl =
    profile?.profileImg ||
    (sessionUser as { picture?: string } | null)?.picture ||
    undefined;

  const qr = issueQr.data;
  const eventId = event?._id ?? event?.eventId ?? undefined;

  // Issue a fresh code: on open, and again whenever the current one expires.
  const issue = useMemo(
    () => () => {
      issueQr.mutate({ eventId, coordinates: coords ?? null });
      setNow(Date.now());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, coords]
  );

  // Kick off the first issue once the modal opens (and re-arm for next open).
  useEffect(() => {
    if (open && !issuedRef.current) {
      issuedRef.current = true;
      issue();
    }
    if (!open) issuedRef.current = false;
  }, [open, issue]);

  // Tick the countdown while the modal is open.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [open]);

  const expiresAtMs = qr ? new Date(qr.expiresAt).getTime() : 0;
  const remaining = expiresAtMs ? expiresAtMs - now : OTP_TTL_MS;
  const expired = !!qr && remaining <= 0;
  const ringPct = Math.max(0, Math.min(1, remaining / OTP_TTL_MS));

  // Auto-refresh on expiry (spec: the code refreshes automatically).
  useEffect(() => {
    if (open && expired && !issueQr.isPending) issue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expired]);

  const eventLocation = event
    ? [event.venueCity, event.venueState].filter(Boolean).join(', ')
    : '';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-appPrimary" />
            My clock-in code
          </DialogTitle>
          <DialogDescription className="sr-only">
            Show this QR code to your event manager to clock in or out.
          </DialogDescription>
        </DialogHeader>

        {/* Identity — avatar featured prominently */}
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full p-1 ring-4 ring-appPrimary/15">
            <Avatar className="h-24 w-24">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
              <AvatarFallback className="bg-appPrimary text-white text-xl font-semibold">
                {initialsOf(firstName, lastName) || 'ME'}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="mt-3 text-xl font-bold text-gray-900">{fullName}</div>
          {email && <div className="text-sm text-gray-500">{email}</div>}
        </div>

        {/* QR + scheduled event side by side (stacks on narrow screens) */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex flex-col items-center">
            <div className="relative rounded-2xl border border-gray-200 p-3 bg-white">
              {issueQr.isPending && !qr ? (
                <div className="flex h-[220px] w-[220px] items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-appPrimary border-t-transparent" />
                </div>
              ) : issueQr.isError ? (
                <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-500">
                  <span>Couldn&apos;t load your code.</span>
                  <button
                    onClick={issue}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <QRCodeSVG
                    value={qr?.payload ?? ''}
                    size={220}
                    marginSize={2}
                    style={{ opacity: expired ? 0.18 : 1, transition: 'opacity .2s' }}
                  />
                  {expired && (
                    <button
                      onClick={issue}
                      className="absolute inset-0 m-auto flex flex-col items-center justify-center gap-1.5 text-gray-700"
                    >
                      <RefreshCw className="h-6 w-6" />
                      <span className="text-sm font-semibold">Tap to refresh</span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* countdown */}
            <div className="mt-3 flex items-center gap-2">
              <div className="relative h-8 w-8">
                <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="4"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke={expired ? '#ef4444' : 'currentColor'}
                    className={expired ? '' : 'text-appPrimary'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${ringPct * 94.2} 94.2`}
                  />
                </svg>
              </div>
              <span
                className={`text-sm font-medium ${
                  expired ? 'text-red-500' : 'text-gray-600'
                }`}
              >
                {expired
                  ? 'Code expired'
                  : `Expires in ${formatCountdown(remaining)}`}
              </span>
            </div>
          </div>

          {/* Scheduled event beside the QR */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              You&apos;re scheduled for
            </div>
            {event ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="font-semibold text-gray-900 truncate">
                  {event.eventName}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock className="h-4 w-4" />
                  <span>
                    {(() => {
                      try {
                        // Render in the EVENT's timezone (not the worker's
                        // device) so a US event reads correctly from anywhere.
                        const d = new Date(event.eventDate);
                        const tz = event.timeZone || undefined;
                        const datePart = new Intl.DateTimeFormat('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          timeZone: tz,
                        }).format(d);
                        const timePart = new Intl.DateTimeFormat('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: tz,
                        }).format(d);
                        return `${datePart} · ${timePart}`;
                      } catch {
                        return '';
                      }
                    })()}
                  </span>
                </div>
                {eventLocation && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
                    <MapPin className="h-4 w-4" />
                    <span>{eventLocation}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
                No upcoming shift scheduled.
              </div>
            )}
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              Show this code to your event manager to clock in or out. It stays
              valid for 3 minutes, then refreshes automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <ShieldCheck className="h-3.5 w-3.5" />
          Secured with a 3-minute one-time code
          {coords ? ' · location attached' : ''}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QrCodeModal;
