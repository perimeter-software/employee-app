'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import { clsxm } from '@/lib/utils';

export type LeaveEventConfirmVariant = 'roster' | 'waitlist';

type Props = {
  open: boolean;
  onClose: () => void;
  variant?: LeaveEventConfirmVariant;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
};

/**
 * "Attention!" confirmation before an employee drops themselves from an event.
 * Copy is kept verbatim from the v3 app (gig-react-cli2 `RemoveEventModal` /
 * `RemoveWaitlistModal`) — v4 removed the confirmation step entirely, so a
 * mis-tap silently gave up a shift.
 */
export function LeaveEventConfirmModal({
  open,
  onClose,
  variant = 'roster',
  onConfirm,
  loading = false,
}: Props) {
  const body =
    variant === 'waitlist'
      ? 'Are you sure you want to be removed from the waitlist?'
      : 'Are you sure you want to leave the event? This action is permanent cannot be undone.';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={clsxm(
          'sm:max-w-md gap-0 overflow-hidden border border-slate-200/80 p-0 shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out'
        )}
      >
        <div className="bg-gradient-to-br from-red-50/80 via-white to-white px-6 pt-6 pb-4">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100 shadow-sm">
                <AlertTriangle className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <DialogTitle className="text-lg font-semibold leading-snug text-slate-900">
                  Attention!
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-slate-600">
                  {body}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="outline-danger"
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
