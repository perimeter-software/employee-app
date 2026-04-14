// Types for the applicant onboarding wizard ported from stadium-people.
export type OutsideMode = '' | 'public' | 'protected';

export type ApplicantObject =
  | 'overview'
  | 'verification'
  | 'applicantInfo'
  | 'resumeAndJobHistory'
  | 'recommendedJobs'
  | 'jobApplicantsAndInterviews'
  | 'subscriptions'
  | 'additionalForms'
  | 'completeBasic'
  | 'onboarding';

export type OnboardingObject =
  | 'verification'
  | 'jobApplication'
  | 'i9Form'
  | 'upload'
  | 'w4Tax'
  | 'directDeposit'
  | 'employerI9'
  | 'additionalForms'
  | 'acknowledged'
  | 'complete';

export interface RegistrationStep {
  id: number;
  label: string;
  altLabel?: string;
  applicantObject: ApplicantObject | OnboardingObject;
  iconKey: string; // lucide icon lookup key (we avoid storing JSX in state)
  loggedIn?: boolean;
}

export interface ButtonState {
  show: boolean;
  disabled: boolean;
}
export interface NavButtonStates {
  submit: ButtonState;
  previous: ButtonState;
  next: ButtonState;
}

export interface CurrentFormState {
  isDirty?: boolean;
  isSubmitting?: boolean;
  isValid?: boolean;
  [k: string]: unknown;
}

export interface Address {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface ApplicantRecord {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  status?: string;
  applicantStatus?: string;
  acknowledged?: boolean;
  profileImg?: string;
  userRecordId?: string;
  modifiedDate?: string;
  createdDate?: string;
  address?: Address;
  venues?: unknown[];
  jobs?: unknown[];
  licenses?: unknown[];
  [k: string]: unknown;
}

export interface CurrentApplicantResponse {
  applicant: ApplicantRecord | null;
  [k: string]: unknown;
}

export interface NewApplicantState {
  applicant: ApplicantRecord;
  registrationSteps: RegistrationStep[];
  registrationSubSteps: RegistrationStep[];
  activeStepId: number;
  activeStep: string;
  activeSubStepId: number;
  activeSubStep: string;
  onboardingProgressId: number;
  error: Record<string, unknown>;
  buttonState: NavButtonStates;
  currentFormState: CurrentFormState;
}
