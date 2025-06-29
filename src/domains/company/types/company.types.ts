export interface TimeClockSettings {
  showPaidTimeOff: boolean;
  // Add other time clock settings here as needed
}

export type Company = {
  _id: string;
  imageUrl: string;
  timeClockSettings: TimeClockSettings;
};
