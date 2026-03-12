export interface EventApplicant {
  id: string;
  status: string;
  note?: string;
  /** Actual clock-in time (null/undefined until the employee clocks in) */
  timeIn?: string | null;
  /** Actual clock-out time (null/undefined until the employee clocks out) */
  timeOut?: string | null;
  /** When the applicant is expected to report — falls back to event.eventDate if absent */
  reportTime?: string;
  agent?: string;
  createAgent?: string;
  eventUrl?: string;
  dateModified?: string;
  timeInBeforeEdit?: string;
  timeOutBeforeEdit?: string | null;
}

export interface GignologyEvent {
  _id: string;
  eventId?: string;
  eventName: string;
  eventDate: string;
  eventEndTime?: string;
  reportTimeTBD?: string;
  /** Whether employees may clock in up to 1 hour early */
  allowEarlyClockin?: string; // 'Yes' | 'No'
  venueName?: string;
  venueSlug?: string;
  venueCity?: string;
  venueState?: string;
  address?: string;
  zip?: string;
  logoUrl?: string;
  eventType?: string;
  eventUrl?: string;
  status?: string;
  timeZone?: string;
  applicants?: EventApplicant[];
}
