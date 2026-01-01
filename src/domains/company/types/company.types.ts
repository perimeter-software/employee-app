export interface TimeClockSettings {
  showPaidTimeOff: boolean;
  workWeek?: string; // e.g., "Mon-Sun", "Sun-Sat", etc.
  // Add other time clock settings here as needed
}

export interface PureBlueConfig {
  apiUrl?: string;
  chatUrl?: string;
  apiKey?: string;
  personaSlug?: string;
}

export type Company = {
  _id: string;
  imageUrl: string;
  uploadPath?: string; // Path prefix for uploaded files (e.g., 'sp')
  timeClockSettings: TimeClockSettings;
  pureBlueConfig?: PureBlueConfig;
  peoIntegration?: string; // PEO integration type (e.g., 'Helm', 'Prism')
};
