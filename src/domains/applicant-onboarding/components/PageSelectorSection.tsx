'use client';

// Placeholder port of stadium-people PageSelectorSection (95 lines).
// Renders a horizontal step chooser. Full styling/icons to follow.
import { clsxm } from '@/lib/utils';
import { useNewApplicantContext } from '../state/new-applicant-context';

interface Props { isAvailable: boolean; isOnboarding?: boolean }

const PageSelectorSection: React.FC<Props> = ({ isAvailable, isOnboarding }) => {
  const { registrationSteps, activeStepId, setActiveStep } = useNewApplicantContext();
  if (!isAvailable || isOnboarding) return null;
  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      {registrationSteps.map((s) => (
        <button
          type="button"
          key={s.id}
          onClick={() => setActiveStep(s.id)}
          className={clsxm(
            'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
            s.id === activeStepId
              ? 'border-appPrimary bg-appPrimary/10 text-appPrimary'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          )}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
};

export default PageSelectorSection;
