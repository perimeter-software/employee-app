'use client';
import DOMPurify from 'dompurify';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Info } from 'lucide-react';

interface ValidationMessage {
  type: 'warning' | 'error' | 'info' | 'success';
  message: string;
}

interface ClockInValidationModalProps {
  isOpen: boolean;
  messages: ValidationMessage[];
  onConfirm: () => void; // Changed: Remove parameters, handle this in the parent
  onCancel: () => void;
  loading?: boolean;
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

const getMessageStyles = (type: ValidationMessage['type']) => {
  switch (type) {
    case 'warning':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'error':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'info':
      return 'bg-blue-50 border-blue-200 text-blue-800';
    case 'success':
      return 'bg-green-50 border-green-200 text-green-800';
    default:
      return 'bg-gray-50 border-gray-200 text-gray-800';
  }
};

export function ClockInValidationModal({
  isOpen,
  messages,
  onConfirm,
  onCancel,
  loading = false,
  title,
  confirmText = 'Proceed with Clock-In',
  cancelText = 'Cancel',
}: ClockInValidationModalProps) {
  const hasErrors = messages.some((msg) => msg.type === 'error');
  const hasWarnings = messages.some((msg) => msg.type === 'warning');

  // Auto-determine title based on message types
  const modalTitle =
    title ||
    (hasErrors
      ? 'Clock-In Error'
      : hasWarnings
        ? 'Clock-In Confirmation'
        : 'Clock-In Information');

  // Auto-determine description
  const description = hasErrors
    ? 'Please review the following issues before proceeding:'
    : hasWarnings
      ? 'Please confirm you want to proceed with the following conditions:'
      : 'Please note the following information:';

  return (
    <Dialog open={isOpen} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasErrors ? (
              <>
                <AlertTriangle className="h-5 w-5 text-red-500" />
                {modalTitle}
              </>
            ) : hasWarnings ? (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                {modalTitle}
              </>
            ) : (
              <>
                <Info className="h-5 w-5 text-blue-500" />
                {modalTitle}
              </>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getMessageStyles(
                message.type
              )}`}
            >
              <div
                className="flex-1 text-sm"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.message) }}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          {!hasErrors && (
            <Button onClick={onConfirm} disabled={loading}>
              {loading ? 'Processing...' : confirmText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
