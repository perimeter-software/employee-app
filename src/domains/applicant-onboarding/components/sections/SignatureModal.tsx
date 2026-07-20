'use client';

import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import axios from 'axios';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { applicantFileKey } from '@/lib/utils';
import { fileUrlQueryKeys, useFileUrl } from '@/lib/hooks/use-file-url';

interface SignatureModalProps {
  applicantId: string;
  applicantFirstName?: string;
  applicantLastName?: string;
  existingSignature?: string;
  /**
   * S3 filename the drawn signature is saved as, under
   * applicants/<id>/signature/. Defaults to the canonical onboarding/I-9
   * signature ('signatureFile.png'); dynamic-form signature fields pass a
   * per-field name so they never overwrite the canonical signature.
   */
  fileName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignatureSaved: (filename: string) => void;
}

const SignatureModal: React.FC<SignatureModalProps> = ({
  applicantId,
  applicantFirstName,
  applicantLastName,
  existingSignature,
  fileName = 'signatureFile.png',
  open,
  onOpenChange,
  onSignatureSaved,
}) => {
  const queryClient = useQueryClient();
  const signatureKey = existingSignature
    ? applicantFileKey(applicantId, 'signature', existingSignature)
    : null;
  const signatureUrl = useFileUrl(signatureKey);
  const [emptyCanvas, setEmptyCanvas] = useState(false);
  const [editMode, setEditMode] = useState(!existingSignature);
  const [saving, setSaving] = useState(false);
  // Drives the "Sign here" guide overlay — hidden as soon as the first stroke starts.
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Store the pad in a ref so we never read stale state inside callbacks
  const padRef = useRef<SignaturePad | null>(null);

  // Reset edit mode whenever the modal opens
  useEffect(() => {
    if (open) {
      setEditMode(!existingSignature);
      setEmptyCanvas(false);
      setHasInk(false);
    }
  }, [open, existingSignature]);

  // Initialize SignaturePad once the canvas is visible and has real dimensions.
  // useLayoutEffect fires before the Dialog portal has finished layout (offsetWidth=0),
  // and display:none on a hidden canvas also yields offsetWidth=0.
  // Instead, poll with requestAnimationFrame until the canvas reports a non-zero width.
  useEffect(() => {
    if (!open || !editMode) {
      // Clean up any existing pad when the canvas is hidden or the modal closes
      padRef.current?.off();
      padRef.current = null;
      return;
    }

    let rafId: number;
    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas || canvas.offsetWidth === 0) {
        // Canvas not laid out yet — try again next frame
        rafId = requestAnimationFrame(init);
        return;
      }
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      ctx?.scale(ratio, ratio);
      setHasInk(false);
      padRef.current = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
      // Hide the "Sign here" guide the instant the first stroke begins.
      padRef.current.addEventListener('beginStroke', () => setHasInk(true));
    };

    rafId = requestAnimationFrame(init);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      padRef.current?.off();
      padRef.current = null;
    };
  }, [open, editMode]);

  const handleClear = () => {
    padRef.current?.clear();
    setHasInk(false);
    if (existingSignature) setEditMode(true);
  };

  const handleSave = async () => {
    if (existingSignature && !editMode) {
      onOpenChange(false);
      return;
    }

    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setEmptyCanvas(true);
      return;
    }

    setEmptyCanvas(false);
    setSaving(true);

    try {
      const dataURL = pad.toDataURL();
      const [header, b64] = dataURL.split(',');
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const form = new FormData();
      form.append('file', blob, fileName);

      await axios.post(
        `/api/applicant-onboarding/applicants/${applicantId}/upload/signature`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      // The signature always lands on the same key, so the cached presigned URL
      // would keep resolving to the previous image. Drop it to force a re-sign.
      await queryClient.invalidateQueries({
        queryKey: fileUrlQueryKeys.detail(
          applicantFileKey(applicantId, 'signature', fileName)
        ),
      });

      toast.success('Signature has been updated!');
      onSignatureSaved(fileName);
      setEditMode(false);
      onOpenChange(false);
    } catch {
      toast.error('Failed to save signature. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Sign for {applicantFirstName} {applicantLastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing signature preview (when not in edit mode) */}
          {!editMode && existingSignature && signatureUrl && (
            <div>
              <p className="mb-1 text-sm font-semibold">E-Signature</p>
              <div className="rounded border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureUrl} alt="signature" className="w-full" />
              </div>
            </div>
          )}

          {/* Drawing canvas (shown in edit mode) */}
          {editMode && (
            <div>
              <p className="mb-1 text-sm font-semibold">E-Signature</p>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="block h-[200px] w-full touch-none cursor-crosshair rounded border border-gray-300 bg-white"
                />
                {/* "Sign here" guide — a visual affordance only (not part of the
                    saved image); disappears the moment drawing starts. */}
                {!hasInk && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-1">
                    <span className="text-xs uppercase tracking-wide text-gray-300">Sign here</span>
                    <div className="mx-8 w-[70%] border-t border-gray-300" />
                  </div>
                )}
              </div>
              {emptyCanvas ? (
                <p className="mt-1 text-sm text-red-600">You can&apos;t save a blank signature</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">Draw your signature above using your mouse or finger.</p>
              )}
              <p className="mt-3 text-[11px] leading-snug text-gray-500">
                By saving, you agree that this electronic signature is the legal
                equivalent of your handwritten signature.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setEmptyCanvas(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="outline" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignatureModal;
