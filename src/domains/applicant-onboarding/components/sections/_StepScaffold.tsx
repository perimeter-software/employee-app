'use client';

// Shared helper to reduce boilerplate across step ports. Each step wraps a RHF form,
// registers its submit with FormContainer via submitRef, and drives the parent button
// state based on form validity / dirty. Full per-step field UIs should still be built
// out; this keeps the scaffold compiling and navigable.
import { useEffect, useMemo } from 'react';
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import type { ApplicantRecord } from '../../types';

interface StepScaffoldProps<T extends FieldValues> {
  title?: string;
  description?: string;
  defaultValues: DefaultValues<T>;
  resolver?: Resolver<T>;
  // Transform form values into the payload sent to PUT /applicants/:id. Return null to skip save.
  toPayload?: (values: T) => Partial<ApplicantRecord> | null;
  // If true, disables Previous (use on the first step).
  isFirstStep?: boolean;
  // If true, disables Next (use on the last step before Complete).
  isLastStep?: boolean;
  children: (form: ReturnType<typeof useForm<T>>) => React.ReactNode;
}

export function StepScaffold<T extends FieldValues>({
  title,
  description,
  defaultValues,
  resolver,
  toPayload,
  isFirstStep,
  isLastStep,
  children,
}: StepScaffoldProps<T>) {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const form = useForm<T>({
    defaultValues,
    resolver,
    mode: 'onBlur',
  });
  const {
    handleSubmit,
    reset,
    formState: { isDirty, isValid, isSubmitSuccessful },
  } = form;

  // Keep values in sync with applicant changes
  useEffect(() => {
    reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant]);

  useEffect(() => {
    updateCurrentFormState({ isDirty });
  }, [isDirty, updateCurrentFormState]);

  useEffect(() => {
    updateButtons({
      previous: { show: !isFirstStep, disabled: !!isFirstStep },
      next: { show: !isLastStep, disabled: !isValid },
      submit: { show: true, disabled: !isDirty && !isSubmitSuccessful },
    });
  }, [
    isDirty,
    isValid,
    isSubmitSuccessful,
    isFirstStep,
    isLastStep,
    updateButtons,
  ]);

  const onSubmit = useMemo(
    () => async (values: T) => {
      if (!toPayload || !applicant?._id) return;
      const payload = toPayload(values);
      if (!payload) return;
      await updateApplicantAction(applicant._id, payload);
    },
    [applicant?._id, toPayload, updateApplicantAction]
  );

  useEffect(() => {
    submitRef.current = handleSubmit(onSubmit);
    return () => {
      submitRef.current = null;
    };
  }, [handleSubmit, onSubmit, submitRef]);

  return (
    <Card className="border-none shadow-none">
      {(title || description) && (
        <CardHeader className="pt-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && (
            <p className="text-sm text-gray-600">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className="space-y-4 pt-0">
        <form id="current-form" onSubmit={handleSubmit(onSubmit)}>
          {children(form)}
        </form>
      </CardContent>
    </Card>
  );
}

// Generic field row used across simple stub ports.
export const SimpleField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <div className="space-y-1">
    <label className="text-xs font-medium uppercase tracking-wide text-gray-600">
      {label}
    </label>
    {children}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

// Read-only banner used by steps awaiting full port.
export const StubBanner: React.FC<{ note: string }> = ({ note }) => (
  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
    <strong>Port pending:</strong> {note}
  </div>
);
