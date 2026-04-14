'use client';

// Dispatcher that selects the correct step body based on the active step.
import { useNewApplicantContext } from '../state/new-applicant-context';
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
import Subscriptions from './sections/Subscriptions';
import AdditionalForms from './sections/AdditionalForms';
import Acknowledgement from './sections/Acknowledgement';
import Congratulations from './sections/Congratulations';

const NewApplicantForms: React.FC = () => {
  const { getActiveRegistrationStep, getActiveRegistrationSubStep } = useNewApplicantContext();
  const active = getActiveRegistrationStep();
  const sub = getActiveRegistrationSubStep();
  const key = active?.applicantObject ?? '';

  // Dynamic state tax steps have applicantObject like "caStateTaxForm".
  const stateTaxMatch = /^([a-z]{2})StateTaxForm$/.exec(key);
  if (stateTaxMatch) return <DynamicStateTaxForm stateCode={stateTaxMatch[1].toUpperCase()} />;

  switch (key) {
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
      return <AdditionalForms />;
    case APPLICANT_OBJECTS_ENUM.SUBSCRIPTIONS:
      return <Subscriptions />;
    case APPLICANT_OBJECTS_ENUM.COMPLETE:
      return <Congratulations />;
    case APPLICANT_OBJECTS_ENUM.ONBOARDING:
      switch (sub?.applicantObject) {
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
              Unknown sub-step: {sub?.applicantObject ?? 'none'}
            </div>
          );
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
