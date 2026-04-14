'use client';

// Port of stadium-people Congratulations (87).
import { useEffect } from 'react';
import { CircleCheck } from 'lucide-react';
import { useNewApplicantContext } from '../../state/new-applicant-context';

const Congratulations: React.FC = () => {
  const { updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();
  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: false, disabled: true },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <CircleCheck className="h-16 w-16 text-green-600" />
      <h2 className="text-xl font-semibold">You're all set!</h2>
      <p className="text-sm text-gray-600">
        Your onboarding is complete. We'll be in touch with next steps.
      </p>
    </div>
  );
};

export default Congratulations;
