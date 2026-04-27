'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { OnboardingService } from '../../services/onboarding-service';
import type { Company } from '@/domains/company/types';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

const Acknowledgement: React.FC = () => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
    onNextStep,
  } = useNewApplicantContext();

  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const signatureRef = useRef<HTMLParagraphElement>(null);

  const { complete, validIDs = [] } = (
    applicant.onboardingDocsComplete as
      | { complete?: string; validIDs?: string[] }
      | undefined
  ) ?? {};

  const isComplete = complete === 'Yes';
  const validUploadsMessage =
    (validIDs as string[]).length > 0
      ? `Valid uploads found: ${(validIDs as string[]).join(', ')}`
      : 'No valid uploads found';

  const i9Form = applicant.i9Form as
    | { signature?: string; processedDate?: string }
    | undefined;

  useEffect(() => {
    OnboardingService.getPrimaryCompany().then(setCompany).catch(() => {});
  }, []);

  useEffect(() => {
    const ack = applicant.acknowledged as boolean | { date?: string } | undefined;
    const hasAcknowledged = typeof ack === 'object' ? !!ack?.date : !!ack;
    setIsAcknowledged(hasAcknowledged);
  }, [applicant]);

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: false, disabled: true },
      submit: { show: true, disabled: true },
    });
    submitRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateButtons({
      submit: { show: true, disabled: !isAcknowledged || !isComplete },
    });
  }, [isAcknowledged, isComplete, updateButtons]);

  useEffect(() => {
    if (isAcknowledged && signatureRef.current) {
      signatureRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isAcknowledged]);

  const handleSubmit = useCallback(async () => {
    if (!applicant._id) return;
    await updateApplicantAction(
      applicant._id,
      {
        acknowledged: {
          date: new Date().toISOString(),
          version: 1,
          signature: i9Form?.signature,
          createdDate: i9Form?.processedDate,
        },
      } as unknown as import('../../types').ApplicantRecord,
      true
    );
    onNextStep();
  }, [applicant._id, i9Form, updateApplicantAction, onNextStep]);

  useEffect(() => {
    submitRef.current = handleSubmit;
    return () => { submitRef.current = null; };
  }, [handleSubmit, submitRef]);

  const ackHtml =
    typeof window !== 'undefined' && company?.acknowledgmentText
      ? DOMPurify.sanitize(company.acknowledgmentText)
      : '';

  const signatureUrl =
    applicant._id && i9Form?.signature
      ? `${IMAGE_SERVER}/applicants/${applicant._id}/signature/${i9Form.signature}`
      : null;

  const signedDate = i9Form?.processedDate
    ? new Date(i9Form.processedDate).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : '';

  return (
    <div className="space-y-4">
      {/* Acknowledgment text */}
      <div className="rounded border border-black p-3">
        <div
          className="h-[30rem] overflow-y-auto text-sm"
          dangerouslySetInnerHTML={{ __html: ackHtml }}
        />
      </div>

      {/* Docs completeness status */}
      <p className={`text-sm font-semibold ${isComplete ? 'text-green-700' : 'text-red-700'}`}>
        {isComplete
          ? 'Onboarding documents are complete.'
          : 'Onboarding documents are incomplete. Complete your documents to proceed.'}{' '}
        {validUploadsMessage}
      </p>

      {/* Agreement checkbox */}
      <label
        className={`inline-flex items-center gap-2 text-sm font-semibold ${
          !isComplete ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          disabled={!isComplete}
          checked={isAcknowledged}
          onChange={(e) => setIsAcknowledged(e.target.checked)}
        />
        I agree to all terms and conditions
      </label>

      {/* Signature image + date (shown when checkbox is checked and signature exists) */}
      {signatureUrl && isAcknowledged && (
        <>
          <div className="w-full max-w-[45%] rounded border border-gray-200 p-1 max-sm:max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signatureUrl} alt="signature" className="w-full p-[3px]" />
          </div>
          <p className="text-sm font-semibold" ref={signatureRef}>
            Date Signed: {signedDate}
          </p>
        </>
      )}
    </div>
  );
};

export default Acknowledgement;
