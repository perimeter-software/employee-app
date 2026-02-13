export interface TimeClockSettings {
  showPaidTimeOff: boolean;
  workWeek?: string; // e.g., "Mon-Sun", "Sun-Sat", etc.
  // Add other time clock settings here as needed
}

export interface PureBluePersona {
  function: string;
  personaSlug: string;
  dependencies: string[];
}

export interface PureBlueConfig {
  apiUrl?: string;
  chatUrl?: string;
  apiKey?: string;
  personas?: PureBluePersona[];
}

export type Company = {
  _id: string;
  imageUrl: string;
  uploadPath?: string; // Path prefix for uploaded files (e.g., 'sp')
  timeClockSettings: TimeClockSettings;
  pureBlueConfig?: PureBlueConfig;
  peoIntegration?: string; // PEO integration type (e.g., 'Helm', 'Prism')
};
