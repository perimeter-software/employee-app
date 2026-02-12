import { useState, useCallback } from 'react';
import { FormService } from '../services';

export interface UseFormSubmissionOptions {
  formId: string;
  employeeId: string;
  onDraftSaved?: () => void;
  onSubmitSuccess?: () => void;
  onError?: (error: string) => void;
}

export interface UseFormSubmissionReturn {
  isLoading: boolean;
  isSaving: boolean;
  isSubmitting: boolean;
  error: string | null;
  saveDraft: (formValues: Record<string, any>) => Promise<boolean>;
  submitForm: (formValues: Record<string, any>) => Promise<boolean>;
  clearError: () => void;
}

/**
 * Custom hook for handling form draft saving and submission.
 * Uses FormService for API calls (same pattern as other domains).
 */
export const useFormSubmission = ({
  formId,
  employeeId,
  onDraftSaved,
  onSubmitSuccess,
  onError,
}: UseFormSubmissionOptions): UseFormSubmissionReturn => {
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDraft = useCallback(
    async (formValues: Record<string, any>): Promise<boolean> => {
      setIsSaving(true);
      setError(null);
      try {
        await FormService.saveDraft(formId, employeeId, formValues);
        onDraftSaved?.();
        setIsSaving(false);
        return true;
      } catch (err: any) {
        const message =
          err.errors && Object.keys(err.errors).length > 0
            ? 'Please fix the validation errors before saving'
            : err.message || 'An error occurred while saving draft';
        setError(message);
        onError?.(message);
        setIsSaving(false);
        return false;
      }
    },
    [formId, employeeId, onDraftSaved, onError]
  );

  const submitForm = useCallback(
    async (formValues: Record<string, any>): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        await FormService.submitForm(formId, employeeId, formValues);
        onSubmitSuccess?.();
        setIsSubmitting(false);
        return true;
      } catch (err: any) {
        const message =
          err.errors && Object.keys(err.errors).length > 0
            ? 'Please fix the validation errors before submitting'
            : err.message || 'An error occurred while submitting form';
        setError(message);
        onError?.(message);
        setIsSubmitting(false);
        return false;
      }
    },
    [formId, employeeId, onSubmitSuccess, onError]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isLoading: isSaving || isSubmitting,
    isSaving,
    isSubmitting,
    error,
    saveDraft,
    submitForm,
    clearError,
  };
};
