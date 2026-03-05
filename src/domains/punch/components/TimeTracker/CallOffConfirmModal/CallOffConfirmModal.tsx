'use client';

import React, { useState, useEffect } from 'react';
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

export interface CallOffConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the required call-off reason when user confirms */
  onConfirm: (reason: string) => void;
  loading?: boolean;
  /** Shift context shown in the modal body */
  shiftInfo?: {
    date: string;
    jobTitle: string;
    shiftName: string;
  } | null;
}

export function CallOffConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
  shiftInfo,
}: CallOffConfirmModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) setReason('');
  }, [isOpen]);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  const isReasonValid = reason.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Call off shift
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to call off this shift? Please provide a reason (required).
            {shiftInfo && (
              <span className="mt-2 block text-sm text-muted-foreground">
                {shiftInfo.date} · {shiftInfo.jobTitle} · {shiftInfo.shiftName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="call-off-reason" className="text-sm font-medium">
            Reason for call off
          </label>
          <Textarea
            id="call-off-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Illness, emergency, schedule conflict..."
            rows={3}
            disabled={loading}
            className="resize-none"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !isReasonValid}
            className="border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100"
          >
            {loading ? 'Processing...' : 'Call off'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
