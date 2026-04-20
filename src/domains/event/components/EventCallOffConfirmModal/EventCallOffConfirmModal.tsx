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
import { AlertTriangle } from 'lucide-react';
import { clsxm } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, user already has a pending call-off — show remove flow only. */
  pendingRequestId?: string | null;
  /** Notes are stored on the call-off request for the event manager (submit flow only). */
  onConfirm: (notes: string) => void | Promise<void>;
  onRemoveRequest?: () => void | Promise<void>;
  loading?: boolean;
};

export function EventCallOffConfirmModal({
  open,
  onClose,
  pendingRequestId,
  onConfirm,
  onRemoveRequest,
  loading = false,
}: Props) {
  const [notes, setNotes] = useState('');
  const isPending = Boolean(pendingRequestId);

  useEffect(() => {
    if (!open) setNotes('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={clsxm(
          'sm:max-w-md gap-0 overflow-hidden border border-slate-200/80 p-0 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out'
        )}
      >
        <div
          className={clsxm(
            'px-6 pt-6 pb-4',
            isPending
              ? 'bg-gradient-to-br from-amber-50/90 via-white to-white'
              : 'bg-gradient-to-br from-slate-50/80 via-white to-white'
          )}
        >
          <DialogHeader className="space-y-0 text-left">
            <div className="flex gap-4">
              <div
                className={clsxm(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm',
                  isPending
                    ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200/60'
                    : 'bg-amber-50 text-amber-600 ring-1 ring-amber-100'
                )}
              >
                <AlertTriangle className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <DialogTitle className="text-lg font-semibold leading-snug text-slate-900">
                  {isPending ? 'Call-off requested' : 'Call off event'}
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-slate-600">
                  {isPending ? (
                    <>
                      You have already submitted a call-off request for this event.
                      You remain responsible to work this event until it is confirmed.
                      You can remove your request below.
                    </>
                  ) : (
                    <>
                      This submits a call-off request. You will be responsible to work
                      this event until it is confirmed.
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {!isPending && (
          <div className="space-y-2 px-6 pb-1">
            <label htmlFor="call-off-notes" className="text-sm font-medium text-slate-800">
              Notes (optional)
            </label>
            <Textarea
              id="call-off-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. reason for call-off"
              rows={3}
              disabled={loading}
              className="resize-none border-slate-200 bg-white focus-visible:ring-amber-500/30"
            />
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {isPending ? 'Close' : 'Cancel'}
          </Button>
          {isPending ? (
            <Button
              variant="outline-danger"
              onClick={() => void onRemoveRequest?.()}
              disabled={loading || !onRemoveRequest}
            >
              {loading ? 'Processing...' : 'Remove request'}
            </Button>
          ) : (
            <Button
              onClick={() => void onConfirm(notes.trim())}
              disabled={loading}
              className="border-amber-500/80 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              {loading ? 'Processing...' : 'Submit call-off'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
