'use client';

import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { baseInstance } from '@/lib/api/instance';
import type { ApiErrorWithDetails } from '@/lib/api/types';
import type { GignologyEvent } from '@/domains/event/types';
import { eventQueryKeys } from '@/domains/event/services/event-service';

export type EventCoverModalIntent = 'invite-cover';

type Props = {
  open: boolean;
  onClose: () => void;
  event: GignologyEvent;
  intent?: EventCoverModalIntent;
  /** When set, a cover request is already pending — show status only. */
  pendingPeerEmail?: string | null;
};

const TITLES: Record<EventCoverModalIntent, string> = {
  'invite-cover': 'Let someone cover for me',
};

export function EventCoverRequestModal({
  open,
  onClose,
  event,
  intent = 'invite-cover',
  pendingPeerEmail,
}: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const pendingView = Boolean(pendingPeerEmail?.trim());

  const reset = () => {
    setEmail('');
    setNotes('');
    setError(null);
    setSuccessEmail(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await baseInstance.post(`events/${event._id}/cover-request`, {
        peerEmail: email.trim(),
        notes: notes.trim() || undefined,
      });
      setSuccessEmail(email.trim().toLowerCase());
      await queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
    } catch (e) {
      const err = e as ApiErrorWithDetails;
      const msg =
        typeof err.message === 'string' && err.message.trim()
          ? err.message.trim()
          : 'Unable to complete this request.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (open) {
      setEmail('');
      setNotes('');
      setError(null);
      setSuccessEmail(null);
    }
  }, [open, event._id, intent]);

  const title = TITLES[intent];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">{title}</DialogTitle>
        </DialogHeader>

        {pendingView && !successEmail ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p className="leading-relaxed">
              You have requested{' '}
              <span className="font-medium text-slate-900">
                {pendingPeerEmail}
              </span>{' '}
              to cover for you for this event.
            </p>
            <Button variant="primary" fullWidth onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {!successEmail && (
              <p className="text-xs text-slate-500 -mt-1">
                Ask a coworker to take your place for this event. They must
                accept, then an administrator approves before the replacement
                takes place.
              </p>
            )}

            {successEmail ? (
              <div className="space-y-4 text-sm text-slate-700">
                <p>
                  Thank you — we will let you know if{' '}
                  <span className="font-medium text-slate-900">
                    {successEmail}
                  </span>{' '}
                  accepts.
                </p>
                <Button variant="primary" fullWidth onClick={handleClose}>
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  The person you invite must be:
                </p>
                <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                  <li>Approved for this venue</li>
                  <li>Not already working this event</li>
                </ul>

                <div>
                  <label
                    htmlFor="cover-peer-email"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Coworker email
                  </label>
                  <input
                    id="cover-peer-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-appPrimary/30 focus:border-appPrimary"
                    placeholder="name@company.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cover-notes"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id="cover-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-appPrimary/30 focus:border-appPrimary"
                    placeholder="e.g. message for your coworker or admin"
                  />
                </div>

                <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-snug">
                  YOU ARE RESPONSIBLE TO WORK THIS EVENT UNTIL A REPLACEMENT HAS
                  BEEN CONFIRMED.
                </p>

                {error && (
                  <p className="text-sm text-red-600" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={submitting}>
                    Send request
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
