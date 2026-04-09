'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { EventApiService, eventQueryKeys } from '@/domains/event/services/event-service';

export const INCOMING_COVER_REQUESTS_QUERY_KEY = [
  'event-cover-requests',
  'incoming',
] as const;

function formatEventWhen(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  items: Record<string, unknown>[];
  isLoading: boolean;
};

export function IncomingCoverRequestsModal({
  open,
  onClose,
  items,
  isLoading,
}: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<{
    id: string;
    action: 'accept' | 'decline';
  } | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: INCOMING_COVER_REQUESTS_QUERY_KEY,
    });
    await queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
  };

  const handleAccept = async (requestId: string) => {
    setBusy({ id: requestId, action: 'accept' });
    try {
      await EventApiService.acceptEventCoverRequest(requestId);
      toast.success('Cover request accepted.');
      await invalidate();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Unable to accept cover request.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setBusy({ id: requestId, action: 'decline' });
    try {
      await EventApiService.declineEventCoverRequest(requestId);
      toast.success('Cover request declined.');
      await invalidate();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Unable to decline cover request.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">Cover requests for you</DialogTitle>
          <p className="text-sm text-muted-foreground text-left font-normal pt-1">
            Pending invites to cover a coworker for an event. Accept or decline
            each request below.
          </p>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No pending cover requests.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((raw) => {
              const id = String(raw._id ?? '');
              const urlStr =
                typeof raw.eventUrl === 'string' ? raw.eventUrl.trim() : '';
              const title =
                (typeof raw.eventName === 'string' && raw.eventName.trim()
                  ? raw.eventName.trim()
                  : null) ||
                urlStr ||
                'Event';
              const eventDate =
                typeof raw.eventDate === 'string' && raw.eventDate.trim()
                  ? raw.eventDate
                  : undefined;
              const notes =
                typeof raw.notes === 'string' ? raw.notes : undefined;
              const requestedByName =
                typeof raw.requestedByName === 'string'
                  ? raw.requestedByName.trim()
                  : '';
              const acceptBusy = busy?.id === id && busy.action === 'accept';
              const declineBusy = busy?.id === id && busy.action === 'decline';
              return (
                <li
                  key={id}
                  className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2"
                >
                  <p className="font-medium text-slate-900">{title}</p>
                  {requestedByName ? (
                    <p className="text-xs text-slate-700">
                      <span className="font-medium text-slate-800">
                        Requested by:
                      </span>{' '}
                      {requestedByName}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-600">
                    {formatEventWhen(eventDate)}
                  </p>
                  {notes ? (
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">
                      {notes}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={acceptBusy}
                      onClick={() => void handleAccept(id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={declineBusy}
                      onClick={() => void handleDecline(id)}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
