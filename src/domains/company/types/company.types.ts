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
};
