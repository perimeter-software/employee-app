export interface TimeClockSettings {
  showPaidTimeOff: boolean;
  workWeek?: string; // e.g., "Mon-Sun", "Sun-Sat", etc.
  // Add other time clock settings here as needed
}

export type Company = {
  _id: string;
  imageUrl: string;
  uploadPath?: string; // Path prefix for uploaded files (e.g., 'sp')
  timeClockSettings: TimeClockSettings;
  peoIntegration?: string; // PEO integration type (e.g., 'Helm', 'Prism')
  companyType?: string; // Company type (e.g., 'Venue')
  acknowledgmentText?: string; // HTML content shown in the Acknowledgement onboarding step
  onboardingCompletionText?: string; // HTML content shown on the Congratulations step
  name?: string;
  companyEmail?: string;
};
