'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { MessageSquareWarning } from 'lucide-react';
import { clsxm } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Sends the note. Resolve `true` to close the modal. */
  onSubmit: (message: string) => Promise<boolean> | boolean;
  loading?: boolean;
};

/**
 * "Contact Event Manager" — the v3 flow for events the employee can no longer
 * remove themselves from (< 48h away). Copy is kept verbatim from
 * gig-react-cli2 `EventManagerModal` so long-time staff see what they expect.
 */
export function ContactEventManagerModal({
  open,
  onClose,
  onSubmit,
  loading = false,
}: Props) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) setMessage('');
  }, [open]);

  const canSubmit = message.trim().length > 0 && !loading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={clsxm(
          'sm:max-w-md gap-0 overflow-hidden border border-slate-200/80 p-0 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out'
        )}
      >
        <div className="bg-gradient-to-br from-amber-50/90 via-white to-white px-6 pt-6 pb-4">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200/60 shadow-sm">
                <MessageSquareWarning className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <DialogTitle className="text-lg font-semibold leading-snug text-slate-900">
                  Contact Event Manager
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-slate-600">
                  Send a message to the Event manager with more information
                  regarding call off:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-2 px-6 pb-1">
          <Textarea
            id="event-manager-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={loading}
            className="resize-none border-slate-200 bg-white focus-visible:ring-amber-500/30"
          />
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const ok = await onSubmit(message.trim());
              if (ok) onClose();
            }}
            disabled={!canSubmit}
            className="border-amber-500/80 bg-amber-50 text-amber-900 hover:bg-amber-100"
          >
            {loading ? 'Sending...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
