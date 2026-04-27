'use client';

// Structural port of stadium-people Verification (501). Original verifies applicant
// identity via email/code + creates applicant if not found. This port shows the
// verified state; the full sign-up flow is pending.
import { useEffect } from 'react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { StubBanner } from './_StepScaffold';

const Verification: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: false, disabled: true },
      next: { show: true, disabled: !applicant?._id },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [applicant?._id, updateButtons, updateCurrentFormState, submitRef]);

  return (
    <div className="space-y-4">
      <StubBanner note="Email verification + applicant-creation flow pending. The applicant is already loaded via /outside-protected/applicants/current." />
      <div className="rounded border border-gray-200 bg-white p-4 text-sm">
        <div>Signed in as: <strong>{(applicant?.email as string) ?? '—'}</strong></div>
        <div>Applicant ID: <code className="rounded bg-gray-100 px-1">{applicant?._id ?? '—'}</code></div>
      </div>
    </div>
  );
};

export default Verification;
