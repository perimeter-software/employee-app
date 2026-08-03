'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  venueName: string;
  loading?: boolean;
};

export const LeaveVenueConfirmModal = ({
  open,
  onClose,
  onConfirm,
  venueName,
  loading = false,
}: Props) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          Leave venue
        </DialogTitle>
        <DialogDescription>
          Are you sure you want to leave{' '}
          <span className="font-medium text-slate-700">{venueName}</span>? You
          will be removed from its staffing pool and will no longer be able to
          pick up its events. You would need to request access again to rejoin.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="bg-red-600 text-white hover:bg-red-700"
        >
          {loading ? 'Leaving…' : 'Leave venue'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
