'use client';

// Placeholder port of stadium-people NewApplicantHeader (266 lines).
// Shows applicant availability banner + masthead. Full form to follow.
interface NewApplicantHeaderProps {
  isAvailable: boolean;
  setIsAvailable: (v: boolean) => void;
  isPreOnboarding: boolean;
}

const NewApplicantHeader: React.FC<NewApplicantHeaderProps> = ({ isAvailable, isPreOnboarding }) => (
  <header className="mb-4 flex items-center justify-between rounded-md border border-gray-200 bg-white p-4">
    <div>
      <h1 className="text-lg font-semibold text-gray-900">
        {isPreOnboarding ? 'My Profile' : 'Onboarding'}
      </h1>
      <p className="text-xs text-gray-600">
        {isPreOnboarding
          ? 'Update your information and view your existing applications.'
          : 'Complete each step to submit your application.'}
      </p>
    </div>
    <span
      className={
        isAvailable
          ? 'rounded-full bg-green-100 px-2 py-1 text-xs text-green-700'
          : 'rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700'
      }
    >
      {isAvailable ? 'Available' : 'Unavailable'}
    </span>
  </header>
);

export default NewApplicantHeader;
