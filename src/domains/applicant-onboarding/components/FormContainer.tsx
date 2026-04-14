'use client';

// Ported skeleton of FormContainer. Next/Previous/Save buttons mirror the MUI version;
// the form body slot renders NewApplicantForms which dispatches based on active step.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { clsxm } from '@/lib/utils';
import {
  useNewApplicantContext,
  ONBOARDING_OBJECTS_ENUM,
  APPLICANT_OBJECTS_ENUM,
} from '../state/new-applicant-context';
import { URL_STEP_TO_ID } from '../utils/constants';
import type { CurrentApplicantResponse } from '../types';
import NewApplicantForms from './NewApplicantForms';
import UnsavedChangesModal from './UnsavedChangesModal';
import OverviewSection from './sections/OverviewSection';

interface FormContainerProps {
  currentApplicant: CurrentApplicantResponse | null | undefined;
  companyType?: string;
}

const FormContainer: React.FC<FormContainerProps> = ({ currentApplicant, companyType }) => {
  const {
    applicant,
    onNextStep,
    onPreviousStep,
    onNextSubStep,
    onPreviousSubStep,
    getActiveRegistrationStep,
    getActiveRegistrationSubStep,
    getFirstAndLastRegistrationSubSteps,
    buttonState,
    currentFormState,
    setApplicantSteps,
    loadApplicantAction,
    setActiveStep,
    submitRef,
  } = useNewApplicantContext();

  const params = useParams();
  const urlStep = (params?.step as string | undefined) ?? undefined;

  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [clickDirection, setClickDirection] = useState<'next' | 'previous' | null>(null);
  const [redirectKey, setRedirectKey] = useState(0);

  const activeStep = useMemo(() => getActiveRegistrationStep(), [getActiveRegistrationStep]);
  const activeSubStep = useMemo(
    () => getActiveRegistrationSubStep(),
    [getActiveRegistrationSubStep]
  );
  const [firstSubStep, lastSubStep] = getFirstAndLastRegistrationSubSteps();
  const atFirstSub = activeSubStep?.id === firstSubStep?.id;
  const atLastSub = activeSubStep?.id === lastSubStep?.id;
  const isSubStep = activeStep?.applicantObject === APPLICANT_OBJECTS_ENUM.ONBOARDING;

  // Onboarding-availability gating: stadium-people checks allowedStages + !acknowledged.
  // Until useMinStageToOnboarding is ported, treat onboarding as available when the
  // applicant exists and has not acknowledged.
  const isOnboardingAvailable = !!applicant?._id && !applicant?.acknowledged;

  const handleNext = () => {
    if (currentFormState?.isDirty) {
      setClickDirection('next');
      setUnsavedOpen(true);
    } else if (isSubStep) onNextSubStep();
    else onNextStep();
  };

  const handlePrevious = () => {
    if (currentFormState?.isDirty) {
      setClickDirection('previous');
      setUnsavedOpen(true);
    } else if (isSubStep) onPreviousSubStep();
    else onPreviousStep();
  };

  useEffect(() => {
    if (!currentApplicant?.applicant) return;
    const a = currentApplicant.applicant;
    // Mirrors stadium-people: unless the applicant is in the intake stage, jump straight
    // to whatever step is in the URL.
    setApplicantSteps(a.status, a.applicantStatus, a.acknowledged);
    loadApplicantAction(a);
    if (urlStep && URL_STEP_TO_ID[urlStep]) setRedirectKey((k) => k + 1);
  }, [currentApplicant, urlStep, setApplicantSteps, loadApplicantAction]);

  useEffect(() => {
    if (redirectKey && urlStep && URL_STEP_TO_ID[urlStep]) {
      const t = setTimeout(() => setActiveStep(URL_STEP_TO_ID[urlStep]), 100);
      return () => clearTimeout(t);
    }
  }, [redirectKey, urlStep, setActiveStep]);

  if (activeStep?.applicantObject === 'overview')
    return <OverviewSection companyType={companyType} currentApplicant={currentApplicant} />;

  const submitLabel =
    activeStep?.applicantObject === ONBOARDING_OBJECTS_ENUM.ACKNOWLEDGEMENT
      ? 'Sign and Submit Application'
      : activeStep?.applicantObject === ONBOARDING_OBJECTS_ENUM.I9_FORM
        ? 'Sign and Save'
        : 'Save';

  return (
    <>
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">
            {activeStep?.label}
            {isSubStep && activeSubStep?.label ? ` — ${activeSubStep.label}` : ''}
          </CardTitle>
          <div className="flex items-center gap-2">
            {buttonState.submit.show && (
              <Button
                type="button"
                form="current-form"
                disabled={buttonState.submit.disabled}
                onClick={() => submitRef.current?.()}
                className="hidden lg:inline-flex"
              >
                <span>{submitLabel}</span>
                <Save className="ml-2 h-4 w-4" />
              </Button>
            )}
            {buttonState.previous.show && (isOnboardingAvailable || isSubStep) && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevious}
                disabled={isSubStep ? atFirstSub : buttonState.previous.disabled}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            )}
            {buttonState.next.show && (isOnboardingAvailable || isSubStep) && (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isSubStep ? atLastSub : buttonState.next.disabled}
              >
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={clsxm('relative border p-4')}>
          <NewApplicantForms />
          {buttonState.submit.show && (
            <Button
              type="button"
              form="current-form"
              disabled={buttonState.submit.disabled}
              onClick={() => submitRef.current?.()}
              className="mt-5 flex w-full lg:hidden"
            >
              <span>{submitLabel}</span>
              <Save className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
      <UnsavedChangesModal
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        clickDirection={clickDirection}
      />
    </>
  );
};

export default FormContainer;
