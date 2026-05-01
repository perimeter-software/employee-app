'use client';

// Dispatcher that selects the correct step body based on the active step.
import { useNewApplicantContext } from '../state/new-applicant-context';
import { useDynamicStateTaxForms } from '../hooks/use-dynamic-state-tax-forms';
import { getApplicantRequiredTaxStates } from '../utils/applicant-helpers';
import {
  APPLICANT_OBJECTS_ENUM,
  ONBOARDING_OBJECTS_ENUM,
} from '../utils/constants';
import ApplicantContactForm from './sections/ApplicantContactForm';
import ApplicantResumeAndJobHistory from './sections/ApplicantResumeAndJobHistory';
import RecommendedJobs from './sections/RecommendedJobs';
import JobApplicationsAndInterviews from './sections/JobApplicationsAndInterviews';
import JobApplicationForm from './sections/JobApplicationForm';
import Verification from './sections/Verification';
import I9Form from './sections/I9Form';
import UploadID from './sections/UploadID';
import W4TaxForm from './sections/W4TaxForm';
import DynamicStateTaxForm from './sections/DynamicStateTaxForm';
import DirectDeposit from './sections/DirectDeposit';
import AdditionalForms from './sections/AdditionalForms';
import Acknowledgement from './sections/Acknowledgement';
import Congratulations from './sections/Congratulations';

const NewApplicantForms: React.FC = () => {
  const { applicant, getActiveRegistrationStep, getActiveRegistrationSubStep } = useNewApplicantContext();
  const active = getActiveRegistrationStep();
  const sub = getActiveRegistrationSubStep();
  const key = active?.applicantObject ?? '';

  const requiredStates = getApplicantRequiredTaxStates(applicant, null);
  const { getFormConfig, isLoading: isFormLoading } = useDynamicStateTaxForms(
    applicant?._id as string | undefined,
    requiredStates
  );

  // Dynamic state tax steps have applicantObject like "caStateTaxForm".
  const stateTaxMatch = /^([a-z]{2})StateTaxForm$/.exec(key);
  if (stateTaxMatch) {
    const stateCode = stateTaxMatch[1].toUpperCase();
    const formConfig = getFormConfig(stateCode);
    return (
      <DynamicStateTaxForm
        stateCode={stateCode}
        stateName={formConfig?.stateName ?? `${stateCode} State`}
        formConfig={formConfig}
        isFormLoading={isFormLoading}
      />
    );
  }

  switch (key) {
    // ── Onboarding mode (registrationSteps = ONBOARDING_STEPS) ──────────────
    // When the applicant is ready for onboarding, ONBOARDING_STEPS become the
    // registrationSteps directly, so active.applicantObject is an ONBOARDING
    // enum value, not 'onboarding'. Each case maps to its own screen.
    case ONBOARDING_OBJECTS_ENUM.JOB_APPLICATION:
      return <JobApplicationForm />;
    case ONBOARDING_OBJECTS_ENUM.I9_FORM:
      return <I9Form />;
    case ONBOARDING_OBJECTS_ENUM.UPLOAD:
      return <UploadID />;
    case ONBOARDING_OBJECTS_ENUM.W4_TAX:
      return <W4TaxForm />;
    case ONBOARDING_OBJECTS_ENUM.DIRECT_DEPOSIT:
      return <DirectDeposit />;
    case ONBOARDING_OBJECTS_ENUM.ACKNOWLEDGEMENT:
      return <Acknowledgement />;
    // 'complete' (onboarding) and 'completeBasic' (applicant) both map to the same screen.
    case ONBOARDING_OBJECTS_ENUM.COMPLETE:
      return <Congratulations />;

    // ── Pre-onboarding / post-onboarding APPLICANT_STEPS ────────────────────
    case APPLICANT_OBJECTS_ENUM.VERIFICATION:
      return <Verification />;
    case APPLICANT_OBJECTS_ENUM.APPLICANT_INFO:
      return <ApplicantContactForm />;
    case APPLICANT_OBJECTS_ENUM.RESUME_AND_JOB_HISTORY:
      return <ApplicantResumeAndJobHistory />;
    case APPLICANT_OBJECTS_ENUM.RECOMMENDED_JOBS:
      return <RecommendedJobs />;
    case APPLICANT_OBJECTS_ENUM.JOB_APPLICANTS_AND_INTERVIEWS:
      return <JobApplicationsAndInterviews />;
    case APPLICANT_OBJECTS_ENUM.ADDITIONAL_FORMS:
      // Note: ONBOARDING_OBJECTS_ENUM.ADDITIONAL_FORMS = 'additionalForms' (same value)
      return <AdditionalForms />;
    case APPLICANT_OBJECTS_ENUM.COMPLETE:
      return <Congratulations />;

    // ── Legacy: 'onboarding' tab inside APPLICANT_STEPS (post-acknowledged) ─
    case APPLICANT_OBJECTS_ENUM.ONBOARDING: {
      const subKey = sub?.applicantObject ?? '';
      const subStateTaxMatch = /^([a-z]{2})StateTaxForm$/.exec(subKey);
      if (subStateTaxMatch) {
        const stateCode = subStateTaxMatch[1].toUpperCase();
        const formConfig = getFormConfig(stateCode);
        return (
          <DynamicStateTaxForm
            stateCode={stateCode}
            stateName={formConfig?.stateName ?? `${stateCode} State`}
            formConfig={formConfig}
            isFormLoading={isFormLoading}
          />
        );
      }
      switch (subKey) {
        case ONBOARDING_OBJECTS_ENUM.JOB_APPLICATION:
          return <JobApplicationForm />;
        case ONBOARDING_OBJECTS_ENUM.I9_FORM:
          return <I9Form />;
        case ONBOARDING_OBJECTS_ENUM.UPLOAD:
          return <UploadID />;
        case ONBOARDING_OBJECTS_ENUM.W4_TAX:
          return <W4TaxForm />;
        case ONBOARDING_OBJECTS_ENUM.DIRECT_DEPOSIT:
          return <DirectDeposit />;
        case ONBOARDING_OBJECTS_ENUM.ADDITIONAL_FORMS:
          return <AdditionalForms />;
        case ONBOARDING_OBJECTS_ENUM.ACKNOWLEDGEMENT:
          return <Acknowledgement />;
        case ONBOARDING_OBJECTS_ENUM.COMPLETE:
          return <Congratulations />;
        default:
          return (
            <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-600">
              Unknown sub-step: {subKey || 'none'}
            </div>
          );
      }
    }
    default:
      return (
        <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-600">
          Unknown step: {key || 'none'}
        </div>
      );
  }
};

export default NewApplicantForms;
