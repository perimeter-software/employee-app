// Ported from stadium-people src/utils/constants/applicant.js
// MUI icons are replaced by lucide icon keys resolved at render time.
import type { RegistrationStep, ApplicantObject, OnboardingObject } from '../types';

export const APPLICANT_OBJECTS_ENUM = {
  OVERVIEW: 'overview',
  VERIFICATION: 'verification',
  APPLICANT_INFO: 'applicantInfo',
  RESUME_AND_JOB_HISTORY: 'resumeAndJobHistory',
  RECOMMENDED_JOBS: 'recommendedJobs',
  JOB_APPLICANTS_AND_INTERVIEWS: 'jobApplicantsAndInterviews',
  SUBSCRIPTIONS: 'subscriptions',
  ADDITIONAL_FORMS: 'additionalForms',
  COMPLETE: 'completeBasic',
  ONBOARDING: 'onboarding',
} as const satisfies Record<string, ApplicantObject>;

export const ONBOARDING_OBJECTS_ENUM = {
  VERIFICATION: 'verification',
  JOB_APPLICATION: 'jobApplication',
  I9_FORM: 'i9Form',
  UPLOAD: 'upload',
  W4_TAX: 'w4Tax',
  DIRECT_DEPOSIT: 'directDeposit',
  EMPLOYER_I_9: 'employerI9',
  ADDITIONAL_FORMS: 'additionalForms',
  ACKNOWLEDGEMENT: 'acknowledged',
  COMPLETE: 'complete',
} as const satisfies Record<string, OnboardingObject>;

export const APPLICANT_STEPS: RegistrationStep[] = [
  { id: 1, label: 'Overview', applicantObject: APPLICANT_OBJECTS_ENUM.OVERVIEW, iconKey: 'list' },
  {
    id: 2,
    label: 'Applicant Contact Info',
    altLabel: 'Personal',
    applicantObject: APPLICANT_OBJECTS_ENUM.APPLICANT_INFO,
    iconKey: 'contact',
  },
  {
    id: 3,
    label: 'Resume & Job History',
    applicantObject: APPLICANT_OBJECTS_ENUM.RESUME_AND_JOB_HISTORY,
    iconKey: 'search',
  },
  {
    id: 4,
    label: 'Recommended Jobs',
    applicantObject: APPLICANT_OBJECTS_ENUM.RECOMMENDED_JOBS,
    iconKey: 'jobSearch',
  },
  {
    id: 5,
    label: 'Job Applications',
    applicantObject: APPLICANT_OBJECTS_ENUM.JOB_APPLICANTS_AND_INTERVIEWS,
    iconKey: 'work',
  },
  {
    id: 6,
    label: 'Additional Forms',
    applicantObject: APPLICANT_OBJECTS_ENUM.ADDITIONAL_FORMS,
    iconKey: 'fileCopy',
  },
  {
    id: 7,
    label: 'Complete!',
    applicantObject: APPLICANT_OBJECTS_ENUM.COMPLETE,
    iconKey: 'check',
  },
  {
    id: 8,
    label: 'Onboarding',
    applicantObject: APPLICANT_OBJECTS_ENUM.ONBOARDING,
    iconKey: 'personAdd',
  },
];

export const ONBOARDING_STEPS: RegistrationStep[] = [
  {
    id: 1,
    label: 'Job Application',
    altLabel: 'Personal',
    applicantObject: ONBOARDING_OBJECTS_ENUM.JOB_APPLICATION,
    iconKey: 'personAdd',
  },
  {
    id: 2,
    label: 'U.S. I-9 Form',
    altLabel: 'I-Nine',
    applicantObject: ONBOARDING_OBJECTS_ENUM.I9_FORM,
    iconKey: 'userCircle',
  },
  {
    id: 3,
    label: `Upload ID's`,
    altLabel: 'Attachments',
    applicantObject: ONBOARDING_OBJECTS_ENUM.UPLOAD,
    iconKey: 'badge',
  },
  {
    id: 4,
    label: 'W-4 Tax Form',
    altLabel: 'Federal W4',
    applicantObject: ONBOARDING_OBJECTS_ENUM.W4_TAX,
    iconKey: 'request',
  },
  {
    id: 5,
    label: 'Direct Deposit',
    altLabel: 'Direct Deposit',
    applicantObject: ONBOARDING_OBJECTS_ENUM.DIRECT_DEPOSIT,
    iconKey: 'bank',
  },
  {
    id: 6,
    label: 'Employer I-9',
    applicantObject: ONBOARDING_OBJECTS_ENUM.EMPLOYER_I_9,
    iconKey: 'userCircle',
    loggedIn: true,
  },
  {
    id: 7,
    label: 'Additional Forms',
    applicantObject: ONBOARDING_OBJECTS_ENUM.ADDITIONAL_FORMS,
    iconKey: 'fileCopy',
  },
  {
    id: 8,
    label: 'Acknowledgement',
    applicantObject: ONBOARDING_OBJECTS_ENUM.ACKNOWLEDGEMENT,
    iconKey: 'thumbsUp',
  },
  {
    id: 9,
    label: 'Complete!',
    applicantObject: ONBOARDING_OBJECTS_ENUM.COMPLETE,
    iconKey: 'check',
  },
];

export const URL_STEP_TO_ID: Record<string, number> = {
  overview: 1,
  info: 2,
  resume: 3,
  recommended: 4,
  jobs: 5,
  interviews: 5,
  additional: 6,
};

export const ID_TO_URL_STEP: Record<number, string> = {
  1: 'overview',
  2: 'info',
  3: 'resume',
  4: 'recommended',
  5: 'jobs',
  6: 'additional',
};

export const EMPLOYEE_APPLICANT_STATUS = [
  'Employee',
  'Inactive',
  'Terminated',
  'Partner',
] as const;
