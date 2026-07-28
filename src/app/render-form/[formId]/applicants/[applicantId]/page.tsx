'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { FormRenderer } from '@/domains/forms/components/FormRenderer/FormRenderer';
import { useFormData } from '@/domains/forms/hooks/useFormData';
import { getAllFieldsFromSections } from '@/domains/forms/utils/formMapper';
import type { DynamicForm } from '@/domains/forms/types/form.types';
import {
  PublicPageShell,
  PublicCard,
  useCompanyBranding,
} from '@/components/public/PublicPageShell';
import { outsidePublicFetch } from '@/lib/api/outside-public';

/* ------------------------------------------------------------------ *
 * Public candidate-facing dynamic-form page. Ported from the legacy
 * stadium-people /render-form route (never carried over to any of the
 * newer apps). Unauthenticated: every call goes to sp1-api's
 * /outside-public/* endpoints through our own proxy, with identity
 * proven by the OTP step. Styling follows the employee app; the request
 * shapes are unchanged from stadium-people.
 * ------------------------------------------------------------------ */

interface FormApplicant {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  dynamicForms?: Record<string, { submittedDate?: string } & Record<string, unknown>>;
}

interface LoadData {
  form?: DynamicForm;
  applicant?: FormApplicant;
  requiresOtp?: boolean;
  otpVerified?: boolean;
}

export default function RenderFormPage() {
  const params = useParams<{ formId: string; applicantId: string }>();
  const formId = params?.formId as string | undefined;
  const applicantId = params?.applicantId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DynamicForm | null>(null);
  const [applicant, setApplicant] = useState<FormApplicant | null>(null);

  // OTP
  const [requiresOtp, setRequiresOtp] = useState(true); // assume gated until told otherwise
  const [otpVerified, setOtpVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<Date | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [completedDate, setCompletedDate] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { bannerUrl: companyBanner } = useCompanyBranding();

  const fields = useMemo(
    () => (form ? getAllFieldsFromSections(form.formData?.form?.sections ?? []) : []),
    [form]
  );
  const emptyInitialValues = useMemo(() => ({}), []);
  const { formValues, errors, setFieldValue, validateAllFields } = useFormData({
    initialValues: emptyInitialValues,
    fields,
  });

  useEffect(() => {
    if (!formId || !applicantId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await outsidePublicFetch<{
          success: boolean;
          data?: LoadData;
          error?: string;
        }>(`/forms/${formId}/applicants/${applicantId}`);
        if (cancelled) return;

        if (!res.success || !res.data) {
          setError(res.error || 'Failed to load form data');
          return;
        }

        const loaded = res.data;
        setForm(loaded.form ?? null);
        setApplicant(loaded.applicant ?? null);
        setRequiresOtp(!!loaded.requiresOtp);
        setOtpVerified(!!loaded.otpVerified);

        // A form is one-and-done: the applicant's stored response for this
        // form's shortName carries the submission date.
        const shortName = loaded.form?.metadata
          ? (loaded.form.metadata as { shortName?: string }).shortName
          : undefined;
        const priorResponse = shortName
          ? loaded.applicant?.dynamicForms?.[shortName]
          : undefined;
        if (priorResponse?.submittedDate) {
          setAlreadyCompleted(true);
          setCompletedDate(new Date(priorResponse.submittedDate));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'An error occurred while fetching the form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formId, applicantId]);

  const sendOtp = useCallback(async () => {
    setSendingOtp(true);
    setOtpError(null);
    try {
      const res = await outsidePublicFetch<{
        success?: boolean;
        data?: { expiresAt?: string };
      }>(`/forms/${formId}/applicants/${applicantId}/send-otp`, { method: 'POST' });
      setOtpSent(true);
      setOtpExpiresAt(
        res?.data?.expiresAt
          ? new Date(res.data.expiresAt)
          : new Date(Date.now() + 15 * 60 * 1000) // default 15 minutes
      );
    } catch (e) {
      setOtpError((e as Error).message || 'Failed to send verification code');
    } finally {
      setSendingOtp(false);
    }
  }, [formId, applicantId]);

  const verifyOtp = useCallback(async () => {
    if (!otp) return;
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await outsidePublicFetch(`/forms/${formId}/applicants/${applicantId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      });
      setOtpVerified(true);
    } catch (e) {
      setOtpError((e as Error).message || 'Invalid authentication code');
    } finally {
      setVerifyingOtp(false);
    }
  }, [otp, formId, applicantId]);

  const submitForm = useCallback(async () => {
    const validation = validateAllFields(true);
    if (!validation.isValid) {
      setSubmitError('Please fix the highlighted fields before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      // Save the responses onto the applicant record first, then render the
      // filled PDF and attach it — same two-step sequence as stadium-people.
      await outsidePublicFetch(
        `/forms/${formId}/applicants/${applicantId}/save-responses`,
        { method: 'POST', body: JSON.stringify({ formValues }) }
      );
      await outsidePublicFetch('/llm/dynamicForms/applicant/generate-pdf', {
        method: 'POST',
        body: JSON.stringify({ formId, applicantId, formValues }),
      });
      setComplete(true);
    } catch (e) {
      setSubmitError((e as Error).message || 'An error occurred while submitting the form');
    } finally {
      setSubmitting(false);
    }
  }, [validateAllFields, formValues, formId, applicantId]);

  // ---------- render ----------

  if (loading) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="flex items-center justify-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-appPrimary" />
          <span className="text-gray-500">Loading form…</span>
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (error) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-errorRed" />
          <p className="font-medium text-gray-900">{error}</p>
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (complete) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-successGreen" />
          <h1 className="text-xl font-semibold text-gray-900">Form submitted</h1>
          <p className="mt-2 text-gray-600">
            Thank you for completing this form. It has been submitted successfully.
          </p>
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (alreadyCompleted) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-successGreen" />
          <h1 className="text-xl font-semibold text-gray-900">Form already completed</h1>
          <p className="mt-2 text-gray-600">
            You have already completed this form
            {completedDate
              ? ` on ${completedDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}`
              : ''}
            .
          </p>
          <p className="mt-3 text-gray-600">
            If you need to modify any information or have questions about your
            submission, please contact our support team for assistance.
          </p>
        </PublicCard>
      </PublicPageShell>
    );
  }

  // OTP gate
  if (requiresOtp && !otpVerified) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard>
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-appPrimary/10">
              <Lock className="h-7 w-7 text-appPrimary" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Verify your identity</h1>
            <p className="mt-1 text-sm text-gray-600">
              For security reasons, we need to verify your identity before you can fill
              out this form.
            </p>
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-lg border border-appPrimary/30 bg-altMutedBackground p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-appPrimary">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-600">Verification code will be sent to:</p>
              <p className="truncate font-semibold text-gray-900">
                {applicant?.email || '—'}
              </p>
            </div>
          </div>

          {!otpSent ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-gray-600">
                Click the button below to receive your verification code
              </p>
              <Button fullWidth onClick={sendOtp} disabled={sendingOtp}>
                {sendingOtp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Send verification code'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">
                  Enter the 6-digit code sent to your email
                </Label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="text-center text-lg tracking-[0.5em]"
                />
              </div>
              {otpExpiresAt && (
                <p className="text-center text-xs text-gray-500">
                  Code expires at {otpExpiresAt.toLocaleTimeString()}
                </p>
              )}
              <Button
                fullWidth
                onClick={verifyOtp}
                disabled={verifyingOtp || otp.length !== 6}
              >
                {verifyingOtp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Verify & continue'
                )}
              </Button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={sendingOtp}
                className="w-full text-xs text-gray-500 hover:text-appPrimary"
              >
                {sendingOtp ? 'Resending…' : 'Resend code'}
              </button>
            </div>
          )}

          {otpError && (
            <p className="mt-3 text-center text-sm text-errorRed">{otpError}</p>
          )}
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (!form?.formData?.form) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-warningOrange" />
          <p className="font-medium text-gray-900">Form data could not be loaded.</p>
        </PublicCard>
      </PublicPageShell>
    );
  }

  const applicantName = [applicant?.firstName, applicant?.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <PublicPageShell banner={companyBanner} wide>
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
          {(form.metadata as { description?: string })?.description && (
            <p className="mt-2 text-gray-600">
              {(form.metadata as { description?: string }).description}
            </p>
          )}
          {applicantName && (
            <p className="mt-3 text-sm font-medium text-gray-600">
              Applicant: {applicantName}
            </p>
          )}
        </div>

        <FormRenderer
          formData={form.formData}
          formValues={formValues}
          errors={errors}
          onFieldChange={setFieldValue}
        />

        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{submitError}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="lg" onClick={submitForm} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit form'}
          </Button>
        </div>
      </div>
    </PublicPageShell>
  );
}
