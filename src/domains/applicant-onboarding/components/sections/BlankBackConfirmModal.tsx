'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { OnboardingService } from '../../services/onboarding-service';
import type {
  BlankBackCandidate,
  BlankBackPrompt,
  BlankBackSelectionResult,
} from '../../types';

interface BlankBackConfirmModalProps {
  /** Always a `BLANK_PAGE` prompt — informational ones are rendered inline instead. */
  prompt: BlankBackPrompt | null;
  onConfirmed: (result: BlankBackSelectionResult) => void;
  /** Applicant says it isn't the back of anything: discard the page and re-prompt. */
  onDeclined: (filename: string) => void;
  /** Closed without answering — the page stays pending, nothing is discarded. */
  onDismiss: () => void;
}

// "Birth_Certificate_Front" → "Birth Certificate". Display only; the eligibility
// rule and the candidate list itself always come from the backend.
function frontDocumentName(candidate: BlankBackCandidate): string {
  const raw = candidate.front?.replace(/_(Front|Back)$/i, '').replace(/_/g, ' ').trim();
  return raw || candidate.label;
}

const BlankBackConfirmModal: React.FC<BlankBackConfirmModalProps> = ({
  prompt,
  onConfirmed,
  onDeclined,
  onDismiss,
}) => {
  // Candidates start from the upload response but can be replaced by a 400 that
  // carries a fresh list (the record changed between prompt and answer).
  const [candidates, setCandidates] = useState<BlankBackCandidate[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [noOptionsLeft, setNoOptionsLeft] = useState(false);

  useEffect(() => {
    setCandidates(prompt?.candidates ?? []);
    setSelectedType(prompt?.candidates?.length === 1 ? prompt.candidates[0].type : '');
    setSubmitting(false);
    setError('');
    setNoOptionsLeft(false);
  }, [prompt]);

  if (!prompt) return null;

  const filename = prompt.filename;
  const single = candidates.length === 1 ? candidates[0] : null;

  const handleConfirm = async () => {
    if (!selectedType || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await OnboardingService.submitBlankBackSelection(filename, selectedType);
      onConfirmed({ ...result, filename, type: selectedType });
    } catch (err: unknown) {
      const response = (err as {
        response?: {
          status?: number;
          data?: unknown;
        };
      }).response;
      // Error bodies are only trustworthy on a 400 from this endpoint; anything
      // else (404 HTML from a bad route, a 500, a network failure) is a plain
      // failure and must not be reported as "upload the front first".
      const body =
        response?.data && typeof response.data === 'object'
          ? (response.data as { message?: string; candidates?: BlankBackCandidate[] })
          : undefined;
      const fresh = response?.status === 400 ? body?.candidates ?? [] : [];

      if (fresh.length) {
        // Options changed server-side — re-render the picker, never retry the same payload.
        setCandidates(fresh);
        setSelectedType(fresh.length === 1 ? fresh[0].type : '');
        setError(body?.message ?? 'That option is no longer available. Please choose again.');
      } else if (response?.status === 400) {
        setNoOptionsLeft(true);
        setError(
          body?.message ??
            'This page can no longer be matched to a document. Please upload the front of the document first.'
        );
      } else {
        setError("We couldn't save that just now. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onDismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {noOptionsLeft
              ? 'Upload the front of the document'
              : single
                ? `Is this the back of your ${frontDocumentName(single)}?`
                : 'Which document is this the back of?'}
          </DialogTitle>
          <DialogDescription>{noOptionsLeft ? error : prompt.message}</DialogDescription>
        </DialogHeader>

        {!noOptionsLeft && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 break-all">{filename}</p>

            {single ? (
              <div className="rounded border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-800">{single.label}</p>
                {single.description && (
                  <p className="mt-1 text-sm text-gray-600">{single.description}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <label
                    key={c.type}
                    className={`flex cursor-pointer gap-2 rounded border p-3 ${
                      selectedType === c.type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="blank-back-candidate"
                      className="mt-1"
                      value={c.type}
                      checked={selectedType === c.type}
                      onChange={() => setSelectedType(c.type)}
                      disabled={submitting}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{c.label}</span>
                      {c.description && (
                        <span className="block text-sm text-gray-600">{c.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {error && (
              <p className="flex items-start gap-1.5 text-sm text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {noOptionsLeft ? (
            <Button onClick={() => onDeclined(filename)}>Upload document</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onDeclined(filename)}
                disabled={submitting}
              >
                {single ? 'No, re-upload' : 'None of these — re-upload'}
              </Button>
              <Button onClick={handleConfirm} disabled={submitting || !selectedType}>
                {submitting ? 'Confirming…' : single ? 'Yes, confirm' : 'Confirm'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlankBackConfirmModal;
