'use client';

// Structural port of stadium-people AdditionalForms (768). Original renders
// customer-configurable extra forms attached to the applicant. The source at :128
// gates some visibility on Master/Admin userType — per scope instructions, we never
// branch on admin here.
import { useEffect } from 'react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { StubBanner } from './_StepScaffold';

const AdditionalForms: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();
  const extras =
    (applicant?.additionalForms as Array<{ name?: string; status?: string }> | undefined) ?? [];

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  return (
    <div className="space-y-4">
      <StubBanner note="Dynamic form configuration + fill-in flow pending full port." />
      {extras.length === 0 && <p className="text-sm text-gray-500">No additional forms configured.</p>}
      <ul className="divide-y divide-gray-100 text-sm">
        {extras.map((f, i) => (
          <li key={i} className="flex items-center justify-between py-2">
            <span>{f.name ?? 'Form'}</span>
            <span className="text-xs text-gray-500">{f.status ?? '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdditionalForms;
